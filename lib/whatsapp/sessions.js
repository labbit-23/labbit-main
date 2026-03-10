// lib/whatsapp/sessions.js

import { supabase } from "@/lib/supabaseServer";
import { phoneVariantsIndia, toCanonicalIndiaPhone } from "@/lib/phone";

export async function getOrCreateSession(phone) {
  const canonicalPhone = phone.replace(/\D/g, "");
  const { data } = await supabase
    .from("chat_sessions")
    .select("*")
    .in("phone", phoneVariantsIndia(phone))
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .gt("last_message_at", new Date(Date.now() - 24*60*60*1000))
    .limit(1);

  if (data?.[0]) {
    const existing = data[0];
    if (canonicalPhone && existing.phone !== canonicalPhone) {
      const { data: updated } = await supabase
        .from("chat_sessions")
        .update({ phone: canonicalPhone, updated_at: new Date() })
        .eq("id", existing.id)
        .select("*")
        .single();
      return updated || existing;
    }
    return existing;
  }

  const { data: newSession } = await supabase
    .from("chat_sessions")
    .insert({
      phone: canonicalPhone || phone,
      lab_id: process.env.DEFAULT_LAB_ID,
      current_state: "START",
      status: "active",
      last_user_message_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    })
    .select()
    .single();

  return newSession;
}

export async function updateSession(id, newState, context) {
  await supabase
    .from("chat_sessions")
    .update({
      current_state: newState,
      context,
      last_user_message_at: new Date(),
      updated_at: new Date()
    })
    .eq("id", id);
}

/**
 * Call this when user chooses "Transfer to Executive"
 */
export async function handoffToHuman(id) {
  await supabase
  .from("chat_sessions")
  .update({
    current_state: "HUMAN_HANDOVER",
    status: "handoff",
    updated_at: new Date()
  })  .eq("id", id);
}
