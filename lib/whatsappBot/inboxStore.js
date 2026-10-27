// Read/write helpers for inbox + tracker admin routes (Supabase). Kept apart from store.js, which the webhook path uses.
import { db } from "./adminAuth.js";
import { phoneHash, last10, mobileVariants } from "./store.js";

const UUID = /^[0-9a-f-]{36}$/i;
export const isUuid = (v) => UUID.test(String(v || ""));

export async function listThreads({ status, assignedTo, tag, q, limit = 50, before = null }) {
  const client = await db();
  let query = client.from("whatsapp_inbox_threads").select("*").order("last_message_at", { ascending: false }).limit(Math.min(Math.max(Number(limit) || 50, 1), 200));
  if (status && ["open", "assigned", "resolved"].includes(status)) query = query.eq("status", status);
  else query = query.neq("status", "resolved");
  if (assignedTo === "none") query = query.is("assigned_to", null);
  else if (assignedTo) query = query.eq("assigned_to", assignedTo);
  if (tag) query = query.contains("tags", [String(tag).toLowerCase()]);
  if (before) query = query.lt("last_message_at", before);
  if (q) {
    const digits = String(q).replace(/\D/g, "");
    if (digits.length >= 10) query = query.eq("phone10", digits.slice(-10));
    else {
      const term = String(q).replace(/[^A-Za-z0-9 _-]/g, " ").trim().slice(0, 40);
      if (term) query = query.ilike("mrn", `%${term.replace(/[%_]/g, " ")}%`);
    }
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getThread(id) {
  if (!isUuid(id)) return null;
  const client = await db();
  const { data } = await client.from("whatsapp_inbox_threads").select("*").eq("id", id).maybeSingle();
  return data || null;
}

export async function threadDetail(id) {
  const client = await db();
  const [msgs, notes] = await Promise.all([
    client.from("whatsapp_inbox_messages").select("id,direction,sender,body,kind,staff_user_id,created_at").eq("thread_id", id).order("created_at", { ascending: true }).limit(500),
    client.from("whatsapp_inbox_notes").select("id,author_id,author_name,body,created_at").eq("thread_id", id).order("created_at", { ascending: true }).limit(200)
  ]);
  return { messages: msgs.data || [], notes: notes.data || [] };
}

export async function updateThread(id, patch) {
  const client = await db();
  const { data, error } = await client.from("whatsapp_inbox_threads").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function addNote({ threadId, authorId, authorName, body }) {
  const client = await db();
  const { error } = await client.from("whatsapp_inbox_notes").insert({ thread_id: threadId, author_id: authorId, author_name: authorName, body: String(body).slice(0, 2000) });
  if (error) throw new Error(error.message);
}

// ---- tracker -----------------------------------------------------------------------------------------------------------

export function aggregateEvents(rows) {
  const by_type = {}, by_intent = {}, by_day = {}, by_campaign = {};
  const patients = new Set();
  for (const r of rows) {
    by_type[r.event_type] = (by_type[r.event_type] || 0) + 1;
    if (r.intent) by_intent[r.intent] = (by_intent[r.intent] || 0) + 1;
    const day = String(r.created_at || "").slice(0, 10);
    if (day) { by_day[day] ||= {}; by_day[day][r.event_type] = (by_day[day][r.event_type] || 0) + 1; }
    if (r.campaign_id) {
      const c = (by_campaign[r.campaign_id] ||= { inbound: 0, button_taps: 0, bookings: 0, handoffs: 0, report_status_sent: 0, package_info_sent: 0 });
      if (r.event_type === "inbound_message") c.inbound++;
      else if (r.event_type === "button_tap") c.button_taps++;
      else if (r.event_type === "booking_created") c.bookings++;
      else if (r.event_type === "handoff_created") c.handoffs++;
      else if (r.event_type === "report_status_sent") c.report_status_sent++;
      else if (r.event_type === "package_info_sent") c.package_info_sent++;
    }
    if (r.phone_hash) patients.add(r.phone_hash);
  }
  return { by_type, by_intent, by_day, by_campaign, distinct_patients: patients.size };
}

export async function trackerSummary(days = 7) {
  const client = await db();
  const since = new Date(Date.now() - Math.min(Math.max(Number(days) || 7, 1), 90) * 86400000).toISOString();
  const { data, error } = await client.from("whatsapp_interaction_events").select("event_type,intent,campaign_id,phone_hash,created_at,detail").gte("created_at", since).order("created_at", { ascending: false }).limit(20000);
  if (error) throw new Error(error.message);
  const agg = aggregateEvents(data || []);
  const handoff_reasons = {};
  for (const r of data || []) if (r.event_type === "handoff_created") { const k = r.detail?.reason || "unknown"; handoff_reasons[k] = (handoff_reasons[k] || 0) + 1; }
  const { data: threads } = await client.from("whatsapp_inbox_threads").select("status").neq("status", "resolved");
  const open_threads = { open: 0, assigned: 0 };
  for (const t of threads || []) open_threads[t.status] = (open_threads[t.status] || 0) + 1;
  return { since, events_scanned: (data || []).length, truncated: (data || []).length >= 20000, ...agg, handoff_reasons, open_threads };
}

export async function patientTimeline({ phone, phoneHashKey, mrn, limit = 200 }) {
  const client = await db();
  let ph = phoneHashKey || (phone ? phoneHash(phone) : null);
  let phone10 = phone ? last10(phone) : null;
  if (!ph && mrn) {
    const { data } = await client.from("whatsapp_interaction_events").select("phone_hash").eq("mrn", mrn).limit(1);
    ph = data?.[0]?.phone_hash || null;
  }
  if (!ph) return { events: [], campaigns: [] };
  if (!phone10) {
    const { data } = await client.from("whatsapp_inbox_threads").select("phone10").eq("phone_hash", ph).limit(1);
    phone10 = data?.[0]?.phone10 || null;
  }
  const { data: events } = await client.from("whatsapp_interaction_events").select("id,event_type,direction,intent,campaign_id,offer_id,ref_id,detail,thread_id,mrn,created_at").eq("phone_hash", ph).order("created_at", { ascending: false }).limit(Math.min(Number(limit) || 200, 500));
  let campaigns = [];
  if (phone10) {
    const { data } = await client.from("campaign_recipients").select("campaign_id,status,delivery_status,sent_at,delivery_updated_at,skip_reason").in("mobile", mobileVariants(phone10)).order("sent_at", { ascending: false }).limit(50);
    campaigns = (data || []).map((r) => ({ campaign_id: r.campaign_id, status: r.status, delivery_status: r.delivery_status || null, sent_at: r.sent_at, delivery_updated_at: r.delivery_updated_at, skip_reason: r.skip_reason || null }));
  }
  return { phone_hash: ph, events: events || [], campaigns };
}

export async function recentPatients({ limit = 50, days = 14 }) {
  const client = await db();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await client.from("whatsapp_interaction_events").select("phone_hash,mrn,event_type,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(5000);
  if (error) throw new Error(error.message);
  const map = new Map();
  for (const r of data || []) {
    const p = map.get(r.phone_hash) || { phone_hash: r.phone_hash, mrn: r.mrn || null, last_event_at: r.created_at, last_event_type: r.event_type, events: 0 };
    p.events++;
    if (!p.mrn && r.mrn) p.mrn = r.mrn;
    map.set(r.phone_hash, p);
  }
  return [...map.values()].slice(0, Math.min(Number(limit) || 50, 200));
}
