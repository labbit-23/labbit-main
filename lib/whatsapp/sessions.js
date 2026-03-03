// lib/whatsapp/sessions.js

import { supabase } from "@/lib/supabaseServer";

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function toCanonicalPhone(value) {
  const digits = digitsOnly(value);
  if (!digits) return "";

  let trimmed = digits;
  if (trimmed.length === 11 && trimmed.startsWith("0")) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.length === 10) {
    return `91${trimmed}`;
  }
  if (trimmed.length > 12) {
    return `91${trimmed.slice(-10)}`;
  }
  return trimmed;
}

function phoneVariants(value) {
  const canonical = toCanonicalPhone(value);
  const digits = digitsOnly(value);
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  return Array.from(
    new Set([value, canonical, digits, last10, last10 ? `91${last10}` : ""].filter(Boolean))
  );
}

export async function getOrCreateSession(phone) {
  const canonicalPhone = toCanonicalPhone(phone);
  const { data } = await supabase
    .from("chat_sessions")
    .select("*")
    .in("phone", phoneVariants(phone))
    .eq("status", "active")
    .order("created_at", { ascending: false })
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
