// Patient-message-jobs VARIABLE registry — Shivam's "SMS Variables Master".
//
// A job's template.params is a list of NAMES; each resolves here against the
// source row (`ctx`). A new derived value = one entry. Keep them pure and
// small — real logic that grows belongs in its own tested helper.
//
// ctx keys come from the trigger's source feed. The requisitions-by-date
// feed gives: reqno, reqid, patient_name, phoneno, mrno, org_id, org_name.

// Walk-in / rapid MRN series (labit-core order_service._is_rapid_mrn):
// a placeholder identity, not trend-tracked. Suppress MRN + trends copy.
export function isRapidMrn(mrn) {
  const n = Number(String(mrn ?? "").trim());
  return Number.isFinite(n) && n >= 500000001 && n < 900000000;
}

function s(v) {
  return String(v ?? "").trim();
}
function mrnOf(ctx) {
  return s(ctx?.mrno ?? ctx?.MRNO ?? ctx?.mrn);
}

export const VARIABLES = {
  patient_name: (ctx) => s(ctx?.patient_name ?? ctx?.PATIENTNM ?? ctx?.name) || "Patient",
  first_name: (ctx) => (s(ctx?.patient_name ?? ctx?.PATIENTNM ?? "").split(/\s+/)[0] || "Patient"),
  reqno: (ctx) => s(ctx?.reqno ?? ctx?.REQNO ?? ctx?.reqid),
  reqid: (ctx) => s(ctx?.reqid ?? ctx?.REQID),
  mrn: (ctx) => mrnOf(ctx),
  org_name: (ctx) => s(ctx?.org_name ?? ctx?.ORG_NAME),

  // "MRN: 27554 and"  — suppressed for the rapid series (placeholder MRN).
  mrn_label: (ctx) => {
    const m = mrnOf(ctx);
    return m && !isRapidMrn(m) ? `MRN: ${m} and` : "";
  },
  // "historical trends,"  — suppressed for the rapid series (not trend-tracked).
  trends_phrase: (ctx) => (isRapidMrn(mrnOf(ctx)) || !mrnOf(ctx) ? "" : "historical trends,"),
};

export function resolveParam(name, ctx) {
  const fn = VARIABLES[String(name || "").trim()];
  if (!fn) throw new Error(`Unknown template variable: ${name}`);
  return String(fn(ctx) ?? "");
}
