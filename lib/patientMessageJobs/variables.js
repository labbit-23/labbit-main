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
  // Amount still due on the bill, without the rupee sign (the template prints it): "1,450". Filled in by the bill_variants step.
  amount_due: (ctx) => s(ctx?.amount_due),

  // Marketing campaigns (lib/marketingCampaigns): the audience row carries last_package ("Executive Health Checkup") and last_visit (ISO date).
  last_package: (ctx) => s(ctx?.last_package),
  last_visit_year: (ctx) => s(ctx?.last_visit).slice(0, 4),
  // "12 Mar 2025" for the trend_reports template's "(<test> on <date>)"; the raw string if it is not a date.
  last_visit_date: (ctx) => {
    const raw = s(ctx?.last_visit);
    const d = new Date(raw);
    return raw && !Number.isNaN(d.getTime())
      ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
      : raw;
  },
  // What the records were: the package name, or a plain phrase for a patient with no package on file.
  records_label: (ctx) => s(ctx?.last_package) || "lab tests",
  // The lab number printed in the message; deliberately no default, so a campaign that needs it fails the dry run rather than send a blank.
  lab_contact: () => {
    const v = s(process.env.MARKETING_CONTACT_PHONE);
    if (!v) throw new Error("MARKETING_CONTACT_PHONE is not set");
    return v;
  },

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
