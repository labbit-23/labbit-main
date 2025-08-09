// File: /app/api/send-sms/route.js
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import mustache from "mustache";

async function sendSms({ labConfig, phone, templateName, templateVars }) {
  const { base_url, auth_details, templates } = labConfig;

  // Handle both string and object forms of templates from Supabase
  let smsTemplates = {};
  if (typeof templates === 'string') {
    try {
      smsTemplates = JSON.parse(templates);
    } catch (e) {
      throw new Error('Invalid SMS templates JSON');
    }
  } else if (typeof templates === 'object' && templates !== null) {
    smsTemplates = templates;
  } else {
    throw new Error('Missing or invalid SMS templates');
  }

  const templateEntry = smsTemplates[templateName];
  if (!templateEntry) {
    throw new Error(`Template "${templateName}" not found`);
  }

  // Render message using mustache templates
  const message = mustache.render(templateEntry.templateText, templateVars);

  // Construct URL parameters for SMS API call
  const params = new URLSearchParams({
    username: auth_details.username,
    apikey: auth_details.apikey,
    senderid: auth_details.senderid,
    mobile: phone,
    message,
    templateid: templateEntry.templateId,
  });

  const url = `${base_url}?${params.toString()}`;

  // Call SMS API
  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`SMS sending failed: ${errorText}`);
  }

  return await res.text();
}

export async function POST(request) {
  try {
    const { phone, labId, templateName, templateVars } = await request.json();

    if (!phone || !labId || !templateName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fetch lab SMS API configuration from Supabase
    const { data: labConfig, error } = await supabase
      .from("labs_apis")
      .select("base_url, auth_details, templates")
      .eq("lab_id", labId)
      .eq("api_name", "sms")
      .single();

    if (error || !labConfig) {
      return NextResponse.json({ error: "Lab SMS configuration not found" }, { status: 404 });
    }

    const smsResponse = await sendSms({ labConfig, phone, templateName, templateVars });

    return NextResponse.json({ message: "SMS sent successfully", smsResponse });
  } catch (err) {
    console.error("Failed to send SMS:", err);
    return NextResponse.json({ error: err.message || "SMS sending failed" }, { status: 500 });
  }
}
