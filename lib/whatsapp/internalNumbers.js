// lib/whatsapp/internalNumbers.js
//
// Single source of truth for "which WhatsApp number is an internal
// staff/alert number, not a real patient" -- extracted 2026-10-02 so the new
// per-patient service-message rate limiter (lib/whatsapp/rateLimiter.js) can
// reuse the EXACT SAME resolution the bot already uses to decide where to
// send "FAILED DELIVERY" / report-request internal alerts
// (app/api/whatsapp/webhook/route.js's resolveInternalNotifyPhone, now
// re-exported from here instead of duplicated) rather than hardcoding a
// second, separately-maintained list that could drift from this one.

import { supabase } from "@/lib/supabaseServer";
import { toCanonicalIndiaPhone } from "@/lib/phone";

export function parseWhatsappTemplates(templates) {
  if (!templates) return {};
  if (typeof templates === "string") {
    try {
      return JSON.parse(templates);
    } catch {
      return {};
    }
  }
  return typeof templates === "object" ? templates : {};
}

// Moved verbatim from app/api/whatsapp/webhook/route.js (same name/shape) --
// resolves the lab's configured "send internal alerts here" number from,
// in priority order: bot_flow.report_notify_number, top-level
// report_notify_number, labs.internal_whatsapp_number.
export function resolveInternalNotifyPhone({ templates = {}, lab = null }) {
  const botFlow = templates?.bot_flow || {};
  const candidate =
    botFlow?.report_notify_number ||
    templates?.report_notify_number ||
    lab?.internal_whatsapp_number ||
    "";
  return toCanonicalIndiaPhone(candidate) || String(candidate || "").replace(/\D/g, "") || null;
}

// Confirmed internal/test numbers from this session's production data
// analysis (2026-10-02) -- excluded from the rate limiter regardless of
// per-lab config, since they aren't real patient traffic:
//   919949099249 -- internal trial/simulation number.
// Per-lab internal alert numbers (report_notify_number /
// internal_whatsapp_number) are resolved dynamically below instead of being
// hardcoded here, so this stays correct as labs are added/reconfigured.
const HARDCODED_INTERNAL_NUMBERS = new Set(["919949099249"]);

async function fetchLabAndTemplates(labId) {
  if (!labId) return { lab: null, templates: {} };
  try {
    const [{ data: lab }, { data: apiConfig }] = await Promise.all([
      supabase.from("labs").select("internal_whatsapp_number").eq("id", labId).maybeSingle(),
      supabase
        .from("labs_apis")
        .select("templates")
        .eq("lab_id", labId)
        .eq("api_name", "whatsapp_outbound")
        .maybeSingle()
    ]);
    return { lab: lab || null, templates: parseWhatsappTemplates(apiConfig?.templates) };
  } catch (error) {
    console.error("[internal-numbers] lab/template lookup failed", error?.message || error);
    return { lab: null, templates: {} };
  }
}

// Main entrypoint for the rate limiter: is `canonicalPhone` (already run
// through toCanonicalIndiaPhone, e.g. "919849025601") an internal number for
// this lab? Fails OPEN to "not internal" on a lookup error -- a DB hiccup
// must never cause a real patient to lose their rate-limit protection, and
// must never cause an internal number to be silently treated as "not
// internal" either in a way that blocks real alerts (the hardcoded set above
// is checked first and needs no DB round-trip).
export async function isInternalWhatsappNumber({ labId, canonicalPhone }) {
  if (!canonicalPhone) return false;
  if (HARDCODED_INTERNAL_NUMBERS.has(canonicalPhone)) return true;
  if (!labId) return false;

  const { lab, templates } = await fetchLabAndTemplates(labId);
  const internalNotifyPhone = resolveInternalNotifyPhone({ templates, lab });
  return Boolean(internalNotifyPhone) && internalNotifyPhone === canonicalPhone;
}
