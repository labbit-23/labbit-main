// Session (free-form, inside the 24 h window) reply texts for the bot. ONE place to edit; staff can override any key from the
// panel (whatsapp_bot_settings.texts) without a deploy. Languages: en is complete; te / hi are intentionally empty for now and
// fall back to en key by key. Placeholders are {name} style; only the ones listed per key are substituted.
//
// Rules for anything added here: no clinical interpretation, no promises about results, no prices that are not passed in.

export const DEFAULT_TEXTS = {
  en: {
    holding_reply: "Thank you for your message. Our team has received it and will reply here shortly.",
    holding_after_hours: "Thank you for your message. Our team is offline right now and will reply here when we open at 7 AM.",
    complaint_ack: "We are sorry to hear this. Your message has been passed to our senior team and they will contact you shortly.",
    medical_advice_ack: "We cannot interpret results over chat. Our team will arrange for a doctor to guide you, and will reply here shortly. For anything urgent please call us or visit the nearest hospital.",
    report_not_found: "We could not find a report linked to this WhatsApp number. Our team will check and reply here.",
    report_phone_mismatch: "For your privacy we can only share reports with the phone number registered on the requisition. Our team will help you here.",
    report_ready_status: "Your report is ready. Reply SEND REPORT and we will send it here.",
    report_status_line: "Status of your latest report: {status_message}",
    report_sending: "Sending your report now.",
    report_not_complete: "Your report is not fully ready yet. {status_message}\nWe will send it automatically as soon as it is complete.",
    report_resend_limit: "We have already sent your report a few times today. Our team will help you from here.",
    report_resend_caption: "Your SDRC report",
    booking_ack: "Thank you. We have noted your request and our team will call you shortly to confirm the home visit time.",
    booking_ack_with_item: "Thank you. We have noted your request for {item} and our team will call you shortly to confirm the home visit time.",
    booking_already: "We already have your request and our team will call you shortly.",
    package_intro: "Here is what we offer:",
    package_line: "{name} - Rs {price}",
    package_outro: "Reply BOOK to arrange a home sample collection, or tell us which one you prefer.",
    package_no_match: "We could not find that exact test or package. Our team will share the details shortly.",
    opt_in_ack: "You are subscribed again to SDRC updates. Reply STOP anytime to unsubscribe.",
    window_closed_staff_note: "The 24 hour reply window is closed for this patient. Use an approved template or call the patient."
  },
  te: {},
  hi: {}
};

export const TEXT_KEYS = Object.keys(DEFAULT_TEXTS.en);
export const LANGS = Object.keys(DEFAULT_TEXTS);
export const MAX_TEXT_LEN = 900;

const PLACEHOLDERS = {
  report_status_line: ["status_message"],
  report_not_complete: ["status_message"],
  booking_ack_with_item: ["item"],
  package_line: ["name", "price"]
};
export function allowedPlaceholders(key) {
  return PLACEHOLDERS[key] || [];
}

// overrides: { en: {key: text}, te: {...}, hi: {...} } from the settings table (already validated on write).
export function resolveText(key, { lang = "en", vars = {}, overrides = null } = {}) {
  const pick = (l) => (overrides?.[l]?.[key] ?? DEFAULT_TEXTS[l]?.[key]);
  let text = pick(lang);
  if (typeof text !== "string" || !text.trim()) text = pick("en");
  if (typeof text !== "string") return "";
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ""));
}

// Validates an override map before it is stored. Returns { ok, errors, clean }.
export function validateTextOverrides(input) {
  const errors = [];
  const clean = {};
  if (!input || typeof input !== "object") return { ok: false, errors: ["texts must be an object"], clean };
  for (const [lang, map] of Object.entries(input)) {
    if (!LANGS.includes(lang)) { errors.push(`unknown language: ${lang}`); continue; }
    if (!map || typeof map !== "object") { errors.push(`${lang} must be an object`); continue; }
    for (const [key, value] of Object.entries(map)) {
      if (!TEXT_KEYS.includes(key)) { errors.push(`unknown text key: ${key}`); continue; }
      if (value === null || value === "") continue; // empty = revert to default
      if (typeof value !== "string") { errors.push(`${lang}.${key} must be a string`); continue; }
      if (value.length > MAX_TEXT_LEN) { errors.push(`${lang}.${key} is longer than ${MAX_TEXT_LEN} characters`); continue; }
      const allowed = allowedPlaceholders(key);
      const bad = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((p) => !allowed.includes(p));
      if (bad.length) { errors.push(`${lang}.${key} uses unsupported placeholder(s): ${bad.join(", ")}`); continue; }
      (clean[lang] ||= {})[key] = value;
    }
  }
  return { ok: errors.length === 0, errors, clean };
}
