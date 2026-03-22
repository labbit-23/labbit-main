import { NextResponse } from "next/server";

import { supabase } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function extractPreview(payload = {}) {
  try {
    if (payload?.type === "text") {
      return String(payload?.text?.body || "").trim();
    }

    if (payload?.type === "interactive") {
      const body = payload?.interactive?.body?.text;
      if (body) return String(body).trim();
      return "Interactive message";
    }

    if (payload?.type === "document") {
      const name = payload?.document?.filename || "document";
      return `Document: ${name}`;
    }

    return payload?.type ? `Message type: ${payload.type}` : "Outbound message";
  } catch {
    return "Outbound message";
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const to = String(body?.to || "").trim();
    const labId =
      request.headers.get("x-lab-id") ||
      request.nextUrl.searchParams.get("lab_id") ||
      null;

    if (!to) {
      return NextResponse.json(
        { ok: false, error: "Missing recipient phone in `to`." },
        { status: 400 }
      );
    }

    const preview = extractPreview(body);

    try {
      await supabase.from("whatsapp_messages").insert({
        lab_id: labId,
        phone: to,
        direction: "outbound",
        message: preview,
        payload: {
          dev_mode: true,
          endpoint: "nextjs-dev-outbound",
          request: body
        }
      });
    } catch (logError) {
      console.error("[dev-outbound] failed to log message:", logError);
    }

    const messageId = `dev.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;
    return NextResponse.json({
      messaging_product: "whatsapp",
      contacts: [{ input: to, wa_id: to }],
      messages: [{ id: messageId }],
      dev: true
    });
  } catch (error) {
    console.error("[dev-outbound] error:", error);
    return NextResponse.json(
      { ok: false, error: "Invalid request payload." },
      { status: 400 }
    );
  }
}

