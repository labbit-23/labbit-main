// Patient-message-jobs framework — the runJob() core.
//
// Config model (labs_apis.templates.patient_message_jobs[], edited as JSON),
// mapped to Shivam's SMS masters:
//
//   key         "requisition_ack"                 SMS Event Master
//   enabled     bool
//   window      { start_hhmm, end_hhmm }          SMS Schedule Event
//   trigger     { source_url, rows_path, dedup_by }  (the runner fetches; this
//               module only sees one `context` row at a time)
//   recipient   "patient"                          SMS Recipient Master
//   template    { name, language, params: [name…] }  SMS Template Master
//                 param names -> lib/patientMessageJobs/variables.js
//   attachment  { kind, ref_field } | null         -> labit-py /document/{kind}/{ref}
//
// The py_utils enqueue-watch loop fetches the source and POSTs
// { key, context } per row to /api/internal/whatsapp/campaign-send, which
// calls runJob(). Dedup + send + audit all live here.

import { supabase } from "@/lib/supabaseServer";
import { digitsOnly, toCanonicalIndiaPhone } from "@/lib/phone";
import { sendTemplateMessage } from "@/lib/whatsapp/sender";
import { extractProviderMessageId, logReportDispatch } from "@/lib/reportDispatchLogs";
import { resolveParam } from "./variables";
import { resolveRecipientPhone } from "./recipients";

const PY_BASE = String(process.env.NEOSOFT_API_BASE_URL || "https://api.sdrc.in/py").replace(/\/+$/, "");

function parseTemplates(t) {
  if (!t) return {};
  if (typeof t === "string") { try { return JSON.parse(t); } catch { return {}; } }
  return typeof t === "object" ? t : {};
}

async function loadJob(labId, key) {
  const { data, error } = await supabase
    .from("labs_apis")
    .select("templates")
    .eq("lab_id", labId)
    .eq("api_name", "whatsapp_outbound")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const templates = parseTemplates(data?.templates);
  const jobs = Array.isArray(templates?.patient_message_jobs) ? templates.patient_message_jobs : [];
  const job = jobs.find((j) => String(j?.key || "").trim() === String(key || "").trim());
  return { job: job || null, templates };
}

function dedupKey(job, ctx) {
  const by = String(job?.trigger?.dedup_by || job?.dedup?.by || "reqid").trim();
  return String(ctx?.[by] ?? "").trim();
}

function attachmentLink(job, ctx) {
  const a = job?.attachment;
  if (!a || !a.kind) return null;
  if (a.static_url) return { link: a.static_url, filename: a.filename || `${a.kind}.pdf` };
  const ref = String(ctx?.[a.ref_field || "reqid"] ?? "").trim();
  if (!ref) return null;
  // patient_dispatch=1 -> labit-core refuses a confidential-org requisition
  // (belt-and-braces on top of the confidential skip in runJob).
  return {
    link: `${PY_BASE}/document/${encodeURIComponent(a.kind)}/${encodeURIComponent(ref)}?patient_dispatch=1`,
    filename: a.filename || `SDRC_${a.kind}_${ref}.pdf`
  };
}

// Reports AND bills must never reach the patient directly for a confidential
// referring org (labit_core.referrer.confidential — 1-2 SDRC orgs, carried
// on the requisitions-by-date feed row). This gate is non-negotiable, not a
// per-job option.
function isConfidential(ctx) {
  const v = ctx?.confidential ?? ctx?.CONFIDENTIAL ?? ctx?.source_confidential;
  return v === true || v === 1 || String(v).toLowerCase() === "true" || String(v) === "1";
}

/**
 * @returns {{ok:true, sent?:true, skipped?:true, reason?:string, provider_message_id?:string}}
 */
export async function runJob({ labId, key, context }) {
  const lab = String(labId || process.env.DEFAULT_LAB_ID || "").trim();
  if (!lab) return { ok: false, error: "missing lab_id" };

  const { job } = await loadJob(lab, key);
  if (!job) return { ok: false, error: `job not configured: ${key}` };
  if (job.enabled === false) return { ok: true, skipped: true, reason: "disabled" };

  // Hard block: confidential referring org -> never send to the patient,
  // by any path. Applies regardless of job config.
  if (isConfidential(context)) return { ok: true, skipped: true, reason: "source_confidential" };

  const recipient = String(job.recipient || "patient");
  const phoneRaw = resolveRecipientPhone(recipient, context);
  const digits = digitsOnly(phoneRaw);
  if (!(digits.length === 10 || (digits.length === 12 && digits.startsWith("91")))) {
    return { ok: true, skipped: true, reason: "invalid_phone" };
  }
  const canonical = toCanonicalIndiaPhone(digits);

  // trial gate
  const trial = job.trial || {};
  if (Array.isArray(trial.numbers) && trial.numbers.length > 0) {
    const last10 = digits.slice(-10);
    if (!trial.numbers.map((n) => digitsOnly(n).slice(-10)).includes(last10)) {
      return { ok: true, skipped: true, reason: "not_in_trial" };
    }
  }
  if (trial.until && Date.now() > new Date(trial.until).getTime()) {
    return { ok: true, skipped: true, reason: "trial_expired" };
  }

  const dk = dedupKey(job, context);
  if (!dk) return { ok: true, skipped: true, reason: "no_dedup_key" };

  const { data: prior } = await supabase
    .from("report_dispatch_logs")
    .select("id")
    .eq("reqid", dk)
    .eq("report_type", key)
    .eq("status", "success")
    .limit(1)
    .maybeSingle();
  if (prior) return { ok: true, skipped: true, reason: "already_sent" };

  const tpl = job.template || {};
  const templateName = String(tpl.name || "").trim();
  if (!templateName) return { ok: false, error: "job has no template.name" };
  const params = (Array.isArray(tpl.params) ? tpl.params : []).map((name) => resolveParam(name, context));
  const header = attachmentLink(job, context);

  const startedAt = Date.now();
  const reqno = String(context?.reqno ?? context?.REQNO ?? "").trim() || null;
  try {
    const sendResult = await sendTemplateMessage({
      labId: lab,
      phone: canonical,
      templateName,
      languageCode: String(tpl.language || "en").trim() || "en",
      templateParams: params,
      ...(header ? { headerDocumentUrl: header.link, headerDocumentFilename: header.filename } : {}),
      sender: { name: `campaign:${key}`, role: "system", userType: "service" }
    });
    const pmid = extractProviderMessageId(sendResult);
    await logReportDispatch({
      labId: lab, actorName: "patient_message_jobs", actorRole: "system",
      sourcePage: "patient_message_jobs", action: "send_whatsapp", targetMode: "single",
      reqid: dk, reqno, phone: canonical, reportType: key, headerMode: "default",
      status: "success", resultCode: "CAMPAIGN_SENT",
      resultMessage: `patient message job ${key} sent`,
      providerMessageId: pmid,
      requestPayload: { key, template_name: templateName, params, attachment: header?.link || null },
      responsePayload: sendResult, durationMs: Date.now() - startedAt
    });
    return { ok: true, sent: true, provider_message_id: pmid || null };
  } catch (err) {
    await logReportDispatch({
      labId: lab, actorName: "patient_message_jobs", actorRole: "system",
      sourcePage: "patient_message_jobs", action: "send_whatsapp", targetMode: "single",
      reqid: dk, reqno, phone: canonical, reportType: key, headerMode: "default",
      status: "failed", resultCode: "CAMPAIGN_FAILED",
      resultMessage: err?.message || "send failed",
      requestPayload: { key, template_name: templateName, params, attachment: header?.link || null },
      durationMs: Date.now() - startedAt
    });
    return { ok: false, error: err?.message || "send failed" };
  }
}
