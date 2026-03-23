import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const to = String(body?.to || "").trim();

    if (!to) {
      return NextResponse.json(
        { ok: false, error: "Missing recipient phone in `to`." },
        { status: 400 }
      );
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
