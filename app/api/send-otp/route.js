import { NextResponse } from "next/server";
import { supabase } from '@/lib/supabaseServer'; // Adjust your import path
import crypto from 'crypto';

export async function POST(request) {
  const { phone } = await request.json();

  if (!phone) {
    return NextResponse.json({ error: "Missing phone number" }, { status: 400 });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Hash OTP securely (SHA256)
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

  // Set expiry for 5 minutes in the future
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // Store OTP in DB before sending SMS
  const { error: dbError } = await supabase
    .from('otp_codes')
    .insert([{
      phone,
      otp_hash: otpHash,
      expires_at: expiresAt,
      is_used: false,
      created_at: new Date().toISOString(),
    }]);

  if (dbError) {
    console.error('Failed to save OTP:', dbError);
    return NextResponse.json({ error: "Failed to generate OTP" }, { status: 500 });
  }

  // Construct message per approved template
  const message = `Your OTP to reset your password is ${otp}. Please ignore this message if it was sent to you in error. Thank you.\n-SDRC My Health`;

  // Build query parameters string as per API spec; mobile supports multiple comma-separated numbers if needed
  const smsParams = new URLSearchParams({
    username: 'secdiagno',
    apikey: process.env.SMS_API_KEY || '',
    senderid: 'SDRCIN',
    mobile: phone,
    message,
    templateid: '1507162200687761639', // Your approved template ID
  });

  try {
    const smsRes = await fetch(`https://smslogin.co/v3/api.php?${smsParams.toString()}`);
    const smsText = await smsRes.text();

    // Optionally parse the smsText to extract MessageID if needed here

    return NextResponse.json({ message: 'OTP sent successfully', smsResponse: smsText });
  } catch (err) {
    console.error('Failed to send SMS:', err);
    return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
  }
}
