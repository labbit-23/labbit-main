// Supabase-backed persistence for the bot: settings, interaction events, inbox threads/messages/notes.
// Every function takes an optional `db` (defaults to the server Supabase client) so tests can pass a fake.
import crypto from "node:crypto";
import { mergeSettings } from "./settings.js";
import { phoneLast10 } from "../phone.js";

let _db = null;
async function defaultDb() {
  if (!_db) _db = (await import("../supabaseServer.js")).supabase;
  return _db;
}

export function last10(phone) { return phoneLast10(phone).slice(-10); }

// Stable, non-reversible key for per-patient timelines. Salt is env-configurable; the default only keeps the hash non-trivial.
export function phoneHash(phone) {
  const p = last10(phone);
  if (p.length !== 10) return null;
  return crypto.createHash("sha256").update(`${process.env.WHATSAPP_BOT_PHONE_SALT || "sdrc-bot-v1"}:${p}`).digest("hex").slice(0, 32);
}

// campaign_recipients.mobile is stored in canonical form (91 + 10 digits); older rows may hold the bare 10 digits.
export function mobileVariants(phone) {
  const p = last10(phone);
  return p.length === 10 ? [`91${p}`, p, `+91${p}`] : [];
}

export function maskPhone(phone) {
  const p = last10(phone);
  return p.length === 10 ? `******${p.slice(-4)}` : null;
}

// ---- settings ---------------------------------------------------------------------------------------------------------

let settingsCache = { at: 0, value: null };
export function invalidateSettingsCache() { settingsCache = { at: 0, value: null }; }

export async function loadSettings({ db = null, maxAgeMs = 20000 } = {}) {
  if (!db && settingsCache.value && Date.now() - settingsCache.at < maxAgeMs) return settingsCache.value;
  try {
    const client = db || (await defaultDb());
    const { data, error } = await client.from("whatsapp_bot_settings").select("key,value");
    const value = mergeSettings(error ? [] : data || []);
    if (!db) settingsCache = { at: Date.now(), value };
    return value;
  } catch {
    return mergeSettings([]); // fail closed: everything off
  }
}

export async function saveSettingKey(key, value, { userId = null, db = null } = {}) {
  const client = db || (await defaultDb());
  const { error } = await client.from("whatsapp_bot_settings").upsert({ key, value, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  invalidateSettingsCache();
}

export async function readRawSettingKey(key, { db = null } = {}) {
  const client = db || (await defaultDb());
  const { data } = await client.from("whatsapp_bot_settings").select("value").eq("key", key).maybeSingle();
  return data?.value || {};
}

// ---- events ------------------------------------------------------------------------------------------------------------

export async function recordEvent(ev, { db = null } = {}) {
  try {
    const client = db || (await defaultDb());
    const row = {
      phone_hash: ev.phone_hash || phoneHash(ev.phone),
      mrn: ev.mrn || null,
      thread_id: ev.thread_id || null,
      event_type: ev.event_type,
      direction: ev.direction || null,
      intent: ev.intent || null,
      campaign_id: ev.campaign_id || null,
      offer_id: ev.offer_id || null,
      ref_id: ev.ref_id ? String(ev.ref_id).slice(0, 80) : null,
      detail: ev.detail || {}
    };
    if (!row.phone_hash) return { ok: false };
    const { error } = await client.from("whatsapp_interaction_events").insert(row);
    return { ok: !error };
  } catch {
    return { ok: false }; // the tracker must never break the patient's reply
  }
}

export async function countEvents({ phoneHash: ph, eventType, sinceIso }, { db = null } = {}) {
  const client = db || (await defaultDb());
  const { count } = await client.from("whatsapp_interaction_events").select("id", { count: "exact", head: true })
    .eq("phone_hash", ph).eq("event_type", eventType).gte("created_at", sinceIso);
  return count || 0;
}

// Latest campaign message sent to this phone within `days` (for attribution of a reply).
export async function campaignContext(phone, days = 7, { db = null } = {}) {
  try {
    const client = db || (await defaultDb());
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await client.from("campaign_recipients").select("campaign_id,sent_at").in("mobile", mobileVariants(phone)).eq("status", "sent")
      .gte("sent_at", since).order("sent_at", { ascending: false }).limit(1);
    const row = data?.[0];
    if (!row) return null;
    const { data: c } = await client.from("campaigns").select("id,name,config").eq("id", row.campaign_id).maybeSingle();
    const cfg = c?.config || {};
    return { campaign_id: row.campaign_id, campaign_name: c?.name || null, offer_id: cfg.offer_id || cfg.offer?.id || null, sent_at: row.sent_at };
  } catch {
    return null;
  }
}

export async function removeOptOut(phone, { db = null } = {}) {
  const client = db || (await defaultDb());
  const { error } = await client.from("whatsapp_opt_outs").delete().eq("phone10", last10(phone));
  if (error) throw new Error(error.message);
}

// ---- inbox -------------------------------------------------------------------------------------------------------------

export async function findOpenThread(phone, { db = null } = {}) {
  const client = db || (await defaultDb());
  const { data } = await client.from("whatsapp_inbox_threads").select("*").eq("phone10", last10(phone)).neq("status", "resolved")
    .order("created_at", { ascending: false }).limit(1);
  return data?.[0] || null;
}

export async function createThread({ phone, labId = null, mrn = null, displayName = null, reason, campaignId = null, offerId = null, lastInboundAt = null }, { db = null } = {}) {
  const client = db || (await defaultDb());
  const { data, error } = await client.from("whatsapp_inbox_threads").insert({
    lab_id: labId, phone10: last10(phone), phone_hash: phoneHash(phone), mrn, display_name: displayName, status: "open", reason,
    campaign_id: campaignId, offer_id: offerId, last_inbound_at: lastInboundAt || new Date().toISOString(), last_message_at: new Date().toISOString(), unread_count: 1
  }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function appendThreadMessage({ threadId, direction, sender, body, waMessageId = null, staffUserId = null, kind = "text" }, { db = null } = {}) {
  const client = db || (await defaultDb());
  const { error } = await client.from("whatsapp_inbox_messages").insert({
    thread_id: threadId, direction, sender, body: String(body || "").slice(0, 4000), wa_message_id: waMessageId, staff_user_id: staffUserId, kind
  });
  if (error) throw new Error(error.message);
}

export async function touchThreadInbound(thread, { db = null } = {}) {
  const client = db || (await defaultDb());
  const now = new Date().toISOString();
  await client.from("whatsapp_inbox_threads").update({ last_inbound_at: now, last_message_at: now, unread_count: (thread.unread_count || 0) + 1, status: thread.status === "resolved" ? "open" : thread.status }).eq("id", thread.id);
}
