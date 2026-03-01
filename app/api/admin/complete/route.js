//app/api/admin/complete/route.js

import { supabase } from "@/lib/supabaseServer";

export async function POST(req) {
  const formData = await req.formData();
  const phone = formData.get("phone");

  await supabase
    .from("chat_sessions")
    .update({ status: "completed" })
    .eq("phone", phone);

  return Response.redirect(`/admin/whatsapp`);
}