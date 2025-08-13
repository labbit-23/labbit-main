// File: /app/api/verify-otp/route.js

import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { ironOptions } from '@/lib/session'; // Adjust path if needed
import crypto from 'crypto';
import { supabase } from '@/lib/supabaseServer'; // Adjust path if needed

export async function POST(request) {
  try {
    const body = await request.json();
    const { phone: rawPhone, otp } = body;

    if (!rawPhone || !otp) {
      return NextResponse.json({ error: 'Missing phone or OTP' }, { status: 400 });
    }

    const phone = rawPhone.replace(/\D/g, '');

    // Hash OTP to compare securely
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    // Verify OTP record exists, unused, and not expired
    const { data: otpRecord, error: otpError } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('phone', phone)
      .eq('otp_hash', otpHash)
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError) {
      console.error('OTP verification DB error:', otpError);
      return NextResponse.json({ error: 'Internal error during OTP validation' }, { status: 500 });
    }

    if (!otpRecord) {
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 });
    }

    // Mark OTP as used
    const { error: updateError } = await supabase
      .from('otp_codes')
      .update({ is_used: true })
      .eq('id', otpRecord.id);

    if (updateError) {
      console.error('Failed to mark OTP as used:', updateError);
      return NextResponse.json({ error: 'Internal error during OTP update' }, { status: 500 });
    }

    // Lookup patients linked to phone
    const { data: patients, error: patientError } = await supabase
      .from('patients')
      .select('id, name, email, mrn')
      .eq('phone', phone);

    if (patientError) {
      console.error('Patient lookup error:', patientError);
      return NextResponse.json({ error: 'Internal error during patient lookup' }, { status: 500 });
    }

    // Lookup executives linked to phone and active
    const { data: executive, error: execError } = await supabase
      .from('executives')
      .select('id, name, email, status, type, active')
      .eq('phone', phone)
      .eq('active', true)
      .maybeSingle();

    if (execError) {
      console.error('Executive lookup error:', execError);
      return NextResponse.json({ error: 'Internal error during executive lookup' }, { status: 500 });
    }

    // Prepare response payload with default userType and redirectUrl
    const payload = {
      message: 'OTP verified successfully',
      userType: 'patient',  // default if no exec found
      verifiedPhone: phone,
      patients: patients || [],
      executive: executive || null,
      redirectUrl: '/patient', // default redirect for patients
    };

    if (executive) {
      payload.userType = 'executive';

      const execType = (executive.type || '').trim().toLowerCase();
      const adminTypes = ['admin', 'manager', 'director'];

      console.log('EXEC TYPE:', execType, 'REDIRECT before assign:', payload.redirectUrl);

      if (adminTypes.includes(execType)) {
        payload.redirectUrl = '/admin';
      } else if (execType === 'phlebo') {
        payload.redirectUrl = '/phlebo';
      } else {
        payload.redirectUrl = '/dashboard';
      }

      console.log('REDIRECT after assign:', payload.redirectUrl);
    }

    // Create JSON response
    const response = NextResponse.json(payload, { status: 200 });

    // Save full user data in session (including patients and executive)
    const session = await getIronSession(request, response, ironOptions);

    if (executive) {
      const execType = (executive.type || '').trim().toLowerCase();
      session.user = {
        phone,
        id: executive.id,
        name: executive.name,
        email: executive.email,
        userType: execType,
        roleKey: execType,
        executiveType: execType,
        executiveId: executive.id,
        executiveData: executive,
        patients: patients || [],
      };
    } else {
      session.user = {
        phone,
        userType: "patient",
        roleKey: "patient",
        patients: patients || [],
      };
    }


    await session.save();

    return response;
  } catch (error) {
    console.error('Unexpected error in /api/verify-otp:', error);
    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 }
    );
  }
}
