// Patient-message-jobs RECIPIENT registry — Shivam's "SMS Recipient Master".
//
// job.recipient names who gets the message; each entry pulls the phone off
// the source `context` row. New audience (referrer, org contact, ...) = one
// entry.

function s(v) {
  return String(v ?? "").trim();
}

export const RECIPIENTS = {
  patient: (ctx) =>
    s(ctx?.phoneno ?? ctx?.PHONENO ?? ctx?.MOBILENO ?? ctx?.mobileno ?? ctx?.phone ?? ctx?.patient_phone),
  // referrer:    (ctx) => s(ctx?.referrer_phone),
  // org_contact: (ctx) => s(ctx?.org_contact_phone),
};

export function resolveRecipientPhone(recipient, ctx) {
  const fn = RECIPIENTS[String(recipient || "patient").trim()];
  if (!fn) throw new Error(`Unknown recipient type: ${recipient}`);
  return fn(ctx);
}
