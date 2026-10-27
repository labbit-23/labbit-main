// WhatsApp bot automations — shared constants. Everything defaults OFF (fail closed).

export const PERMISSIONS = {
  botView: "marketing.bot.view",
  botManage: "marketing.bot.manage",
  inboxView: "marketing.inbox.view",
  inboxReply: "marketing.inbox.reply",
  trackerView: "marketing.tracker.view"
};

// One row per automation. All false by default; `global_enabled` is the kill switch (false = nothing below runs).
export const DEFAULT_FLAGS = {
  global_enabled: false,
  tracker_enabled: false,      // record the per-patient interaction timeline
  inbox_enabled: false,        // capture handed-off chats into the staff inbox
  report_status: false,        // "where is my report"
  report_resend: false,        // "send my report" (phone-verified)
  book_followup: false,        // "Book follow-up" button / free-text home-visit requests -> enquiry for staff
  package_enquiry: false,      // package / test price questions answered from the live catalogue
  human_handoff: false,        // unrecognised / complaint / medical-advice -> staff queue + holding reply
  start_optin: false,          // START re-subscribes a number that sent STOP
  campaign_attribution: false  // carry campaign/offer id into enquiries and handoffs when replying to a campaign
};
export const FLAG_KEYS = Object.keys(DEFAULT_FLAGS);

export const FLAG_LABELS = {
  global_enabled: "Global switch (off = all bot automations stop)",
  tracker_enabled: "Interaction tracker",
  inbox_enabled: "Staff inbox capture",
  report_status: "Report status answers",
  report_resend: "Report resend (phone-verified)",
  book_followup: "Book follow-up / home visit",
  package_enquiry: "Package and price enquiries",
  human_handoff: "Human handoff queue",
  start_optin: "START opt-in",
  campaign_attribution: "Campaign attribution"
};

export const DEFAULT_PARAMS = {
  min_confidence: 0.6,            // below this the message goes to a human
  report_resend_max_per_day: 3,   // per phone
  booking_dedupe_hours: 24,
  catalog_max_results: 3,
  campaign_attribution_days: 7,
  // Templates staff may use to reopen a closed 24 h window from the inbox. Only names already approved in Meta/Mtalkz;
  // empty by default so no template is ever invented. Shape: [{ name, language, params: ["staff_note"|...] , label }]
  window_reopen_templates: []
};
export const PARAM_KEYS = Object.keys(DEFAULT_PARAMS);

export const INTENTS = {
  REPORT_STATUS: "report_status",
  REPORT_RESEND: "report_resend",
  BOOK_FOLLOWUP: "book_followup",
  PACKAGE_ENQUIRY: "package_enquiry",
  COMPLAINT: "complaint",
  MEDICAL_ADVICE: "medical_advice",
  OPT_IN: "opt_in",
  GREETING: "greeting",
  UNKNOWN: "unknown"
};

export const EVENT_TYPES = [
  "campaign_sent", "campaign_delivered", "campaign_read", "campaign_failed",
  "button_tap", "inbound_message", "bot_reply", "report_status_sent", "report_resent",
  "package_info_sent", "handoff_created", "booking_created", "staff_reply", "staff_assigned",
  "staff_resolved", "opt_out", "opt_in", "window_closed_skip"
];

export const THREAD_STATUSES = ["open", "assigned", "resolved"];
export const HANDOFF_REASONS = ["unrecognised", "low_confidence", "complaint", "medical_advice", "phone_mismatch", "report_not_found", "booking_failed", "resend_limit", "catalogue_miss", "patient_requested", "bot_error"];

export const WINDOW_MS = 24 * 60 * 60 * 1000;
