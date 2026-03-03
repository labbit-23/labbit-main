///app/api/admin/reply/route.js

import { supabase } from "@/lib/supabaseServer";
import { sendTextMessage } from "@/lib/whatsapp/sender";

export async function POST(req) {
  try {
    const body = await req.json();
    const { phone, message } = body;

    if (!phone || !message) {
      return new Response("Missing phone or message", { status: 400 });
    }

    // Get latest session
    const { data: sessions } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1);

    const session = sessions?.[0];

    if (!session) {
      return new Response("Session not found", { status: 404 });
    }

    // Send WhatsApp message
    await sendTextMessage({
      labId: session.lab_id,
      phone,
      text: message
    });

    // Update timestamps
    await supabase
      .from("chat_sessions")
      .update({
        last_message_at: new Date(),
        updated_at: new Date()
      })
      .eq("id", session.id);

    return Response.json({ success: true });

  } catch (err) {
    console.error("Admin reply error:", err);
    return new Response("Internal server error", { status: 500 });
  }
}