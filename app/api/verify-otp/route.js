// /app/api/verify-otp.js
import { NextResponse } from "next/server";
import { supabase } from '@/lib/supabaseServer'; // Adjust import path accordingly
import crypto from 'crypto';

export async function POST(request) {
  try {
    const { phone, otp } = await request.json();

    if (!phone || !otp) {
      return NextResponse.json({ error: "Missing phone or OTP" }, { status: 400 });
    }

    // Hash the received OTP for comparison
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    // Query for a valid OTP record: matching phone, OTP hash, unused and unexpired
    const { data: otpRecord, error } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('phone', phone)
      .eq('otp_hash', otpHash)
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error querying OTP:', error);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    if (!otpRecord) {
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 });
    }

    // Mark this OTP record as used
    const { error: updateError } = await supabase
      .from('otp_codes')
      .update({ is_used: true })
      .eq('id', otpRecord.id);

    if (updateError) {
      console.error('Failed to mark OTP as used:', updateError);
      // Not blocking success; log and proceed
    }

    // OPTIONAL: Lookup user in your 'users' table associated with this phone to get userId
    // Example:
    const { data: userProfile, error: userError } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('phone', phone)
      .maybeSingle();

    if (userError) {
      console.error('Failed to find user for phone:', userError);
      return NextResponse.json({ error: 'User lookup failed' }, { status: 500 });
    }

    if (!userProfile) {
      // Optionally create new user here if needed, or reject
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // TODO: Implement session/token generation or return info so frontend can create auth session

    // For now just respond with user info and success
    return NextResponse.json({
      message: 'OTP verified successfully',
      userId: userProfile.id,
      userType: userProfile.user_type || null,
      // you may add password reset flag or other metadata here
    });

  } catch (err) {
    console.error('Unexpected error in verify-otp:', err);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
