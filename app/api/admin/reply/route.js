//app/api/admin/reply/route.js

import { sendTextMessage } from "@/lib/whatsapp/sender";
import { createClient } from "@/lib/supabaseServer";

export async function POST(req) {
  const formData = await req.formData();

  const phone = formData.get("phone");
  const message = formData.get("message");

  const supabase = createClient();

  const { data: session } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("phone", phone)
    .single();

  if (!session) {
    return new Response("Session not found", { status: 404 });
  }

  await sendTextMessage({
    labId: session.lab_id,
    phone,
    text: message
  });

  await supabase
    .from("chat_sessions")
    .update({
      last_message_at: new Date(),
      updated_at: new Date()
    })
    .eq("id", session.id);

  return Response.redirect(`/admin/whatsapp/${phone}`);
}