// File: /app/api/send-otp/route.js

import { NextResponse } from "next/server";
import { supabase } from '@/lib/supabaseServer';
import crypto from 'crypto';
import mustache from 'mustache';

export async function POST(request) {
  const { phone: rawPhone, labId: rawLabId, purpose: rawPurpose } = await request.json();

  if (!rawPhone) {
    return NextResponse.json({ error: "Missing phone number" }, { status: 400 });
  }

  const rawIdentifier = String(rawPhone || "").trim();
  const normalizedDigits = rawIdentifier.replace(/\D/g, '');
  const normalizedPhone = normalizedDigits.length >= 10
    ? normalizedDigits.slice(-10)
    : "";
  const looksLikePhone = normalizedPhone.length === 10;

  let phone = looksLikePhone ? normalizedPhone : "";
  let labId = rawLabId || "";
  const purpose = String(rawPurpose || "").trim().toLowerCase();
  const forcePatientLogin = purpose === "patient_login";
  const forceEmployeeReset = purpose === "employee_reset";
  let isExecutive = forceEmployeeReset;

  let matchedExecutive = null;

  if (!looksLikePhone && !forcePatientLogin) {
    const { data: executives, error: execLookupError } = await supabase
      .from('executives')
      .select('id, phone')
      .ilike('email', rawIdentifier.toLowerCase())
      .limit(2);

    if (execLookupError || !Array.isArray(executives) || executives.length === 0) {
      return NextResponse.json({ error: "Executive not found for reset password flow" }, { status: 404 });
    }

    if (executives.length > 1) {
      return NextResponse.json(
        { error: "Multiple executive accounts found. Use mobile number for reset password." },
        { status: 409 }
      );
    }

    matchedExecutive = executives[0];
    phone = String(matchedExecutive.phone || "").replace(/\D/g, '');
    isExecutive = true;

    if (!phone) {
      return NextResponse.json({ error: "Executive phone number is missing." }, { status: 400 });
    }

    if (!labId) {
      const { data: labRows, error: labError } = await supabase
        .from('executives_labs')
        .select('lab_id')
        .eq('executive_id', matchedExecutive.id)
        .limit(1);

      if (labError || !Array.isArray(labRows) || !labRows[0]?.lab_id) {
        return NextResponse.json({ error: "No lab ID found associated with this executive." }, { status: 404 });
      }

      labId = labRows[0].lab_id;
    }
  }

  if (!isExecutive && !forcePatientLogin) {
    try {
      const { data: executiveRows, error: execError } = await supabase
        .from('executives')
        .select('id, phone')
        .eq('phone', phone)
        .limit(2);

      if (!execError && Array.isArray(executiveRows) && executiveRows.length === 1 && executiveRows[0]?.id) {
        isExecutive = true;
        matchedExecutive = executiveRows[0];
      }
    } catch (err) {
      // fail silently - treat as patient if there's an error looking up executives
      console.error('Error checking if executive:', err);
    }
  }

  if (isExecutive && !labId && matchedExecutive?.id) {
    const { data: labRows, error: labError } = await supabase
      .from('executives_labs')
      .select('lab_id')
      .eq('executive_id', matchedExecutive.id)
      .limit(1);

    if (labError || !Array.isArray(labRows) || !labRows[0]?.lab_id) {
      return NextResponse.json({ error: "No lab ID found associated with this executive." }, { status: 404 });
    }

    labId = labRows[0].lab_id;
  }

  if (!phone) {
    return NextResponse.json({ error: "Missing phone number" }, { status: 400 });
  }
  if (!labId) {
    return NextResponse.json({ error: "Missing lab ID" }, { status: 400 });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Hash OTP securely (SHA256)
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

  // Set expiry for 5 minutes in the future
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // Store OTP in DB before sending SMS
  const { data: insertedOtp, error: dbError } = await supabase
    .from('otp_codes')
    .insert([{
      phone,
      otp_hash: otpHash,
      expires_at: expiresAt,
      is_used: false,
      created_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (dbError || !insertedOtp) {
    console.error('Failed to save OTP:', dbError);
    return NextResponse.json({ error: "Failed to generate OTP" }, { status: 500 });
  }

  // Load lab-specific SMS config and templates from labs_apis
  const { data: labConfig, error } = await supabase
    .from('labs_apis')
    .select('base_url, auth_details, templates')
    .eq('lab_id', labId)
    .eq('api_name', 'sms')
    .single();

  if (error || !labConfig) {
    return NextResponse.json({ error: "Lab SMS configuration not found" }, { status: 404 });
  }

  // Parse templates JSON
  let smsTemplates = {};
  if (typeof labConfig.templates === 'string') {
    try {
      smsTemplates = JSON.parse(labConfig.templates);
    } catch (e) {
      console.error('Invalid templates JSON in lab config:', e);
      return NextResponse.json({ error: "Invalid templates JSON in lab config" }, { status: 500 });
    }
  } else if (typeof labConfig.templates === 'object' && labConfig.templates !== null) {
    smsTemplates = labConfig.templates;
  } else {
    return NextResponse.json({ error: "Missing or invalid templates in lab config" }, { status: 500 });
  }

  // Choose template key based on flow intent and account type.
  const templateKey = forcePatientLogin ? "otp" : (isExecutive ? "forgot_password" : "otp");

  const chosenTemplate = smsTemplates[templateKey];
  if (!chosenTemplate) {
    return NextResponse.json({ error: `SMS template '${templateKey}' not found in configuration` }, { status: 500 });
  }

  // Render message with mustache variable replacement
  const message = mustache.render(chosenTemplate.templateText, { otp });

  // Build SMS API query parameters
  const params = new URLSearchParams({
    username: labConfig.auth_details.username,
    apikey: labConfig.auth_details.apikey,
    senderid: labConfig.auth_details.senderid,
    mobile: phone,
    message,
    templateid: chosenTemplate.templateId,
  });

  try {
    // Send SMS request
    const smsRes = await fetch(`${labConfig.base_url}?${params.toString()}`);
    const smsText = await smsRes.text();

    return NextResponse.json({
      message: 'OTP sent successfully',
      smsResponse: smsText,
      resolvedPhone: phone,
      resolvedLabId: labId,
      isExecutive
    });
  } catch (err) {
    console.error('Failed to send OTP SMS:', err);
    return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
  }
}
