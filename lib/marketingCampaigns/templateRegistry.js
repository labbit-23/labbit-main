// WhatsApp template registry for marketing campaigns (Mtalkz / Meta Cloud API).
//
// `params` are variable NAMES from lib/patientMessageJobs/variables.js, in {{1}}..{{n}} order.
// URL-button suffixes are NOT body params: they are filled per recipient from
// config.template.buttons (e.g. {summary_token}); see lib/marketingCampaigns/index.js.
// `status: 'draft'` = wording proposed here, NOT yet submitted/approved in Mtalkz.
// ALL clinical wording is conservative on purpose and needs PATHOLOGIST REVIEW before submission.
// Lab number is never hardcoded: it is {{lab_contact}} -> env MARKETING_CONTACT_PHONE.

const HEADER_URL = "https://lab.sdrc.in/marketing/trend-header.png"; // public/marketing/trend-header.png (1200x628)
const HEALTH_SUMMARY_HEADER_URL = "https://lab.sdrc.in/marketing/health-summary-header.jpg"; // public/marketing/health-summary-header.jpg (1200x675, "Your Health At a Glance")

export const TEMPLATES = [
  {
    key: "trend_reports",
    name: "trend_reports",
    language: "en",
    category: "UTILITY", // CONFIRM the category actually shown in Mtalkz/Meta
    status: "approved",
    header: { type: "image", sample_url: HEADER_URL },
    // The "..." is elided in our records: paste the exact approved wording from Mtalkz before relying on this text (used for previews only).
    body: "Dear {{1}}, your health records of ({{2}} on {{3}}) are available with us. You can get your Trend Report or Latest Report using the buttons below, or contact {{4}} or reply Hi.\n\nTeam SDRC",
    params: ["first_name", "records_label", "last_visit_date", "lab_contact"],
    buttons: [
      { type: "quick_reply", text: "Trend Report" },
      { type: "quick_reply", text: "Latest Report" },
      { type: "quick_reply", text: "Hi" },
    ],
    purpose: "Tell a past patient their records are on file and let them pull the trend/latest report by tapping a button. Header image is mandatory on every send.",
    notes: "Approved. Header image is mandatory. A promotional banner on this template risks Meta re-categorising it to Marketing: keep the image neutral (public/marketing/trend-header.png). A very old visit date makes 'records are available' look non-transactional.",
  },
  {
    key: "package_results",
    name: "package_patients",
    language: "en",
    category: "UTILITY", // CONFIRM
    status: "approved",
    header: { type: "image", sample_url: HEADER_URL },
    body: "Dear {{1}}, results for your last health checkup are now available by clicking {{2}} (Package {{3}} done on date {{4}}).\n\nFor any queries or follow-up appointments, you may contact us on {{5}}.\n\nReply with Hi to chat with our Whatsapp Bot for further assistance. Thank you.\nTeam SDRC",
    params: ["first_name", "trend_link", "last_package", "last_visit_date", "lab_contact"],
    buttons: [{ type: "quick_reply", text: "Hi" }],
    purpose: "Link a package buyer to their results/trend page.",
    notes: "Mtalkz name package_patients (image header, per director 2026-10-28); body pasted from the approved template by the director 2026-10-28. Category still to confirm in Mtalkz. {{2}} is a link inside the text, so each patient needs a real per-patient link before this is used.",
  },

  // ---------------------------------------------------------------- NEW, to submit (all status: draft)
  {
    key: "health_summary_link",
    name: "sdrc_health_summary_link",
    language: "en",
    category: "UTILITY",
    status: "approved", // submitted to Meta 2026-10-28, approved per director the same day; CONFIRM the category shown in Mtalkz
    header: { type: "image", sample_url: HEALTH_SUMMARY_HEADER_URL },
    body: "Dear {{1}}, your health records of ({{2}} on {{3}}) are available with us.\n\nYour reports now include a one-page summary with trend-based insights to help track changes in key health markers over time.\n\nTap the button below to view your summary.\n\nFor assistance, or to book a follow-up appointment, contact {{4}} or reply Hi.\nTeam SDRC",
    params: ["first_name", "records_label", "last_visit_date", "lab_contact"],
    buttons: [
      { type: "url", text: "View my summary", url: "https://app.sdrc.in/s/{{1}}" },
      { type: "quick_reply", text: "Hi" },
    ],
    purpose: "One-tap link to the patient's one-page health summary (signed per-patient token, labit-core /public/s/<token>). Any offer is shown inside the landing page, never in the message, so the message stays Utility.",
    category_rationale: "Utility = information about records the patient already has with us. No offer, discount, price or urgency in the message or header.",
    reclassification_risk: "Meta may move it to Marketing if the visit is a year or more old, the header image becomes promotional, or the body gains offer/booking wording. A small pilot shows the category actually applied.",
    notes: "Needs the nginx rule for app.sdrc.in/s/ (to labit-core /public/s/) before any send. URL suffix {{1}} = per-patient token, same mechanism as {summary_token}.",
    samples: { body: ["Rahul", "General Health Checkup", "12 Mar 2025", "+91 98490 25601"], button: ["Kq7Zx2mPa9LdW4tRbN8vYcE1sH"] },
  },
  {
    key: "festival_offer",
    name: "sdrc_festival_offer_2026", // rename per festival/year, e.g. sdrc_diwali_offer_2026
    language: "en",
    category: "MARKETING",
    status: "draft",
    header: { type: "image", sample_url: HEADER_URL }, // replace with the festival banner for the real submission
    body: "Hi {{1}}, warm festive wishes from SDRC Diagnostics! \u{1FA94}\n\nThis season, look after your family's health with our special checkup: [OFFER: package name and what it includes, price or % off], valid till [DATE].\n\nHome sample collection available. Tap below to book.",
    footer: "Reply STOP to opt out",
    params: ["first_name"],
    buttons: [
      { type: "url", text: "Book now", url: "https://sdrc.in/[offer-page]" },
      { type: "quick_reply", text: "STOP" },
    ],
    purpose: "Seasonal offer to lapsed package buyers. Offer text is fixed in the template (only the first name varies) so each festival is one new submission and review is quick.",
    category_rationale: "Promotional offer, price and a booking CTA: Marketing, no argument.",
    reclassification_risk: "None expected. Do NOT submit as Utility: mis-categorisation is penalised. Fill the [bracketed] offer details before submission; Meta rejects bodies with unfilled placeholders and templates that make health claims ('prevent', 'cure', 'detect disease').",
    notes: "Wording avoids any claim about disease. Pathologist review the package description you paste into [OFFER].",
    samples: { body: ["Rahul"] },
  },
  {
    key: "annual_checkup_reminder",
    name: "sdrc_annual_checkup_reminder",
    language: "en",
    category: "MARKETING",
    status: "draft",
    header: { type: "image", sample_url: HEADER_URL },
    body: "Hi {{1}}, your last {{2}} with SDRC Diagnostics was on {{3}}. Many people review their health every year, so it may be a good time to plan your next checkup. Home sample collection is available. To book or ask a question, reply Hi or call {{4}}.",
    footer: "Reply STOP to opt out",
    params: ["first_name", "records_label", "last_visit_date", "lab_contact"],
    buttons: [
      { type: "quick_reply", text: "Hi" },
      { type: "quick_reply", text: "STOP" },
    ],
    purpose: "Yearly checkup-due reminder for patients whose last visit/package was ~11-13 months ago. No price, so it works year-round.",
    category_rationale: "Encourages a new purchase, even without a discount: Marketing. Meta treats 'time to book again' reminders as promotional.",
    reclassification_risk: "None (already Marketing). Keep 'every year' wording soft ('many people'); do not state medical necessity or imply a result was abnormal.",
    notes: "records_label falls back to 'lab tests' when no package on file ('your last lab tests ...' reads fine). Pathologist review of the 'review their health every year' sentence.",
    samples: { body: ["Rahul", "Full Body Checkup", "12 Mar 2025", "04000000000"] },
  },
  {
    key: "reengage_we_miss_you",
    name: "sdrc_we_miss_you",
    language: "en",
    category: "MARKETING",
    status: "draft",
    header: { type: "none" },
    body: "Hi {{1}}, we have not seen you at SDRC Diagnostics since {{2}} and we would love to help again. If you would like to book a test or have any question, just reply Hi and our team will get back to you, or call {{3}}.",
    footer: "Reply STOP to opt out",
    params: ["first_name", "last_visit_date", "lab_contact"],
    buttons: [
      { type: "quick_reply", text: "Hi" },
      { type: "quick_reply", text: "STOP" },
    ],
    purpose: "Low-key re-engagement for inactive patients (no package on file, so annual_checkup_reminder does not fit). Cheap to review, no image needed.",
    category_rationale: "Solicits future business: Marketing.",
    reclassification_risk: "None (already Marketing).",
    notes: "Text-only so no creative is needed. 'STOP' button must be honoured: the campaign engine's opt-out handling already treats a STOP reply as opt-out.",
    samples: { body: ["Rahul", "12 Mar 2025", "04000000000"] },
  },
];

// Meta limits enforced by tests/marketingTemplates.test.mjs
export const META_LIMITS = {
  bodyMax: 1024, headerTextMax: 60, footerMax: 60,
  quickReplyTextMax: 25, urlTextMax: 25, maxQuickReplies: 3, maxUrlButtons: 2, maxButtons: 10,
};

export function getTemplate(key) {
  return TEMPLATES.find((t) => t.key === key) || null;
}
