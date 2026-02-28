// lib/whatsapp/sessions.js

import { supabase } from "@/lib/supabaseServer";

export async function getOrCreateSession(phone) {
  const { data } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("phone", phone)
    .eq("status", "active")
    .maybeSingle();

  if (data) return data;

  const { data: newSession } = await supabase
    .from("chat_sessions")
    .insert({
      phone,
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