// Persistence for saved segments, offers and the audit trail (tables from db/migrations/20261028_marketing_engine_v3.sql).
import { supabase } from "@/lib/supabaseServer";
import { normalizeOffer, validateOffer } from "./offers";
import { validateFilter } from "./audienceClient";

const fail = (error) => { if (error) throw new Error(error.message); };

// ---- audit (never patient identifiers) -------------------------------------------------------------------------------
const AUDIT_DROP = /phone|mobile|^numbers$|^name$|patient|mrn|email|token/i;
export function auditSafe(details) {
  if (Array.isArray(details)) return details.map(auditSafe);
  if (details && typeof details === "object") {
    const out = {};
    for (const [k, v] of Object.entries(details)) {
      if (k === "sample" || k === "rows") continue;
      if (AUDIT_DROP.test(k)) continue;
      out[k] = auditSafe(v);
    }
    return out;
  }
  return typeof details === "string" ? details.slice(0, 500) : details;
}

export async function writeMarketingAudit({ actor, action, campaignId = null, details = {} }) {
  const { error } = await supabase.from("marketing_audit").insert({
    actor_user_id: actor?.id != null ? String(actor.id) : null,
    actor_name: actor?.name || null,
    actor_role: actor?.role || null,
    action: String(action),
    campaign_id: campaignId,
    details: auditSafe(details)
  });
  // Auditing must not take down the action that already happened; surface it in logs.
  if (error) console.error("[marketing_audit] write failed", error.message);
}

export async function listMarketingAudit({ campaignId = null, limit = 100 } = {}) {
  let q = supabase.from("marketing_audit").select("*").order("created_at", { ascending: false }).limit(Math.min(Number(limit) || 100, 500));
  if (campaignId) q = q.eq("campaign_id", campaignId);
  const { data, error } = await q;
  fail(error);
  return data || [];
}

// ---- segments --------------------------------------------------------------------------------------------------------
export function validateSegmentInput(input) {
  const errors = [];
  if (!String(input?.name || "").trim()) errors.push("name is required");
  if (!input?.filter || typeof input.filter !== "object" || Array.isArray(input.filter)) errors.push("filter must be a JSON object");
  else if (JSON.stringify(input.filter).length > 20000) errors.push("filter is too large");
  else errors.push(...validateFilter(input.filter));
  return errors;
}

export async function listSegments() {
  const { data, error } = await supabase.from("marketing_segments").select("*").is("archived_at", null).order("created_at", { ascending: false });
  fail(error);
  return data || [];
}
export async function getSegment(id) {
  const { data, error } = await supabase.from("marketing_segments").select("*").eq("id", id).maybeSingle();
  fail(error);
  return data;
}
export async function saveSegment({ id = null, input, actor }) {
  const errors = validateSegmentInput(input);
  if (errors.length) return { ok: false, error: errors.join("; ") };
  const row = { name: String(input.name).trim(), filter: input.filter, notes: String(input.notes || "").trim() || null, updated_at: new Date().toISOString() };
  const q = id
    ? supabase.from("marketing_segments").update(row).eq("id", id).is("archived_at", null)
    : supabase.from("marketing_segments").insert({ ...row, created_by: actor?.name || null });
  const { data, error } = await q.select("*").maybeSingle();
  fail(error);
  if (!data) return { ok: false, error: "Segment not found" };
  return { ok: true, segment: data };
}
export async function archiveSegment(id) {
  const { error } = await supabase.from("marketing_segments").update({ archived_at: new Date().toISOString() }).eq("id", id);
  fail(error);
  return { ok: true };
}

// ---- offers ----------------------------------------------------------------------------------------------------------
export async function listOffers() {
  const { data, error } = await supabase.from("marketing_offers").select("*").is("archived_at", null).order("created_at", { ascending: false });
  fail(error);
  return data || [];
}
export async function getOffer(id) {
  const { data, error } = await supabase.from("marketing_offers").select("*").eq("id", id).maybeSingle();
  fail(error);
  return data;
}
export async function saveOffer({ id = null, input, actor }) {
  const o = normalizeOffer(input);
  const errors = validateOffer(o);
  if (errors.length) return { ok: false, error: errors.join("; ") };
  const row = { ...o, updated_at: new Date().toISOString() };
  const q = id
    ? supabase.from("marketing_offers").update(row).eq("id", id).is("archived_at", null)
    : supabase.from("marketing_offers").insert({ ...row, created_by: actor?.name || null });
  const { data, error } = await q.select("*").maybeSingle();
  fail(error);
  if (!data) return { ok: false, error: "Offer not found" };
  return { ok: true, offer: data };
}
export async function archiveOffer(id) {
  const { error } = await supabase.from("marketing_offers").update({ archived_at: new Date().toISOString() }).eq("id", id);
  fail(error);
  return { ok: true };
}
