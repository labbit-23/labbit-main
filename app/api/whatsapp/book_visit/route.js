// app/api/whatsapp/book_visit/route.js
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import processBookingMessage from "@/lib/processBookingMessage";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const labId = "b539c161-1e2b-480b-9526-d4b37bd37b1e";
    const body = await req.json();

    const { data: cfgRows, error } = await supabase
      .from("labs_apis")
      .select("*")
      .match({ lab_id: labId, api_name: "whatsapp_inbound" })
      .limit(1);

    if (error) return NextResponse.json({ error: "DB fetch failed" }, { status: 500 });
    const cfg = cfgRows?.[0];
    if (!cfg) return NextResponse.json({ error: "No inbound config" }, { status: 404 });

    if (
      cfg.auth_details?.webhook_token &&
      req.headers.get("x-webhook-token") !== cfg.auth_details.webhook_token
    ) return NextResponse.json({ error: "Invalid token" }, { status: 403 });

    const mapping = cfg.templates?.field_mapping || {};
    const phone = body[mapping.phone];
    const name = body[mapping.name];
    const textMessage = body[mapping.text];
    const messageType = body.type || "text";
    let imageUrl = null;

    // If this is an image message, fetch and store to Supabase Storage
    if (messageType === "image" && body.image_url) {
      const originalUrl = body.image_url;
      const fileName = `${phone}_${Date.now()}.jpg`;

      const imgRes = await fetch(originalUrl);
      const imgBuffer = await imgRes.arrayBuffer();

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("whatsapp-uploads")
        .upload(fileName, imgBuffer, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (!uploadError) {
        const { data: publicData } = supabase.storage
          .from("whatsapp_uploads")
          .getPublicUrl(fileName);
        imageUrl = publicData?.publicUrl || null;
      }
    }

    // Log inbound message (image or text)
    await supabase.from("whatsapp_messages").insert({
      lab_id: labId,
      phone,
      name,
      message: messageType === "text" ? textMessage : "[Image]",
      direction: "inbound",
      payload: body
    });

    await processBookingMessage({ labId, phone, name, message: textMessage, imageUrl });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
