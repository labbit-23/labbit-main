// lib/whatsapp/sessions.js

import { supabase } from "@/lib/supabaseServer";
import { phoneVariantsIndia, toCanonicalIndiaPhone } from "@/lib/phone";

export async function getOrCreateSession(phone) {
  const canonicalPhone = phone.replace(/\D/g, "");
  const activeSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { data } = await supabase
    .from("chat_sessions")
    .select("*")
    .in("phone", phoneVariantsIndia(phone))
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .gt("last_message_at", activeSince.toISOString())
    .limit(1);

  if (data?.[0]) {
    const existing = data[0];
    console.log("[sessions] Reusing existing session", {
      sessionId: existing.id,
      phone: existing.phone,
      state: existing.current_state,
      status: existing.status,
      lastMessageAt: existing.last_message_at,
      lastUserMessageAt: existing.last_user_message_at
    });
    if (canonicalPhone && existing.phone !== canonicalPhone) {
      const touchTime = new Date();
      const { data: updated } = await supabase
        .from("chat_sessions")
        .update({
          phone: canonicalPhone,
          last_message_at: touchTime.toISOString(),
          updated_at: touchTime.toISOString()
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      return updated || existing;
    }
    return existing;
  }

  const createdAt = new Date();
  const { data: newSession } = await supabase
    .from("chat_sessions")
    .insert({
      phone: canonicalPhone || phone,
      lab_id: process.env.DEFAULT_LAB_ID,
      current_state: "START",
      status: "active",
      last_message_at: createdAt.toISOString(),
      last_user_message_at: createdAt.toISOString(),
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString()
    })
    .select()
    .single();

  console.log("[sessions] Created new session", {
    sessionId: newSession?.id || null,
    phone: canonicalPhone || phone
  });

  return newSession;
}

export async function updateSession(id, newState, context, messageTimestamp = null) {
  const touchTime = new Date();
  const updatePayload = {
    current_state: newState,
    context,
    last_message_at: touchTime.toISOString(),
    last_user_message_at: touchTime.toISOString(),
    updated_at: touchTime.toISOString()
  };

  const query = supabase
    .from("chat_sessions")
    .update(updatePayload)
    .eq("id", id);

  await query;
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
