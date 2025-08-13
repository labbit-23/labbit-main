// ==============================
// File: app/api/whatsapp/send/route.js
// ==============================
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req) {
  try {
    const labId = "b539c161-1e2b-480b-9526-d4b37bd37b1e";

    // Parse JSON body
    const { destination, userName, templateParams } = await req.json();

    if (!destination) {
      return NextResponse.json({ error: "Missing destination number" }, { status: 400 });
    }

    // Fetch outbound config from DB
    const { data: cfgRows, error } = await supabase
      .from("labs_apis")
      .select("*")
      .match({ lab_id: labId, api_name: "whatsapp_outbound" })
      .limit(1);

    if (error) {
      console.error("[Supabase error]", error);
      return NextResponse.json({ error: "DB fetch failed" }, { status: 500 });
    }

    const cfg = cfgRows?.[0];
    if (!cfg) {
      return NextResponse.json({ error: "No outbound config" }, { status: 404 });
    }

    const apiKey = cfg.auth_details?.api_key;
    const campaignName = cfg.templates?.default_campaign;
    const source = cfg.templates?.default_source;

    if (!apiKey || !campaignName) {
      return NextResponse.json({ error: "Incomplete outbound config" }, { status: 500 });
    }

    // Construct payload
    const payload = {
      apiKey: apiKey,
      campaignName,
      destination,
      userName,
      source,
      templateParams: templateParams || [],
    };

    // Call Whitecoats API
    const response = await fetch(cfg.base_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("WhatsApp API send error:", text);
      return NextResponse.json({ error: "WhatsApp API error: " + text }, { status: 502 });
    }

    const json = await response.json();
    return NextResponse.json({ success: true, data: json }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
