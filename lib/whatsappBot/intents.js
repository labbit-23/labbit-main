// Pure intent classifier for inbound patient messages / button replies. No I/O.
// Order matters: safety intents (complaint, medical advice) are checked before anything that mentions "report".
import { INTENTS } from "./constants.js";

const norm = (s) => String(s || "").toLowerCase().replace(/[_]+/g, " ").replace(/[^\p{L}\p{N}\s/.-]/gu, " ").replace(/\s+/g, " ").trim();

const COMPLAINT = /\b(complain|complaint|worst|rude|cheat|fraud|refund|overcharg|wrong report|wrong result|not happy|unhappy|disappoint|angry|useless|pathetic|bad service|poor service|escalat|consumer court|legal action|negligen)/;
const MEDICAL = /\b(serious|dangerous|worried|worry|scared|cancer|tumou?r|diabet|should i (take|worry|see|stop|start)|what medicine|which medicine|medicine|tablet|dose|diagnos|treatment|prescri|interpret|explain (my|the|this) (result|report)|what does (my|this|the) .*(mean|show)|is (my|this|the) (result|report|value|level|count).*(ok|okay|normal|abnormal|high|low|bad|fine|serious|good)|(high|low|abnormal|critical) (result|value|level|count))/;
const REPORT_WORD = /\b(report|reports|result|results|pdf|test report|lab report)\b/;
const RESEND_VERB = /\b(send|resend|share|forward|download|give|need|want|get|whatsapp|pdf|copy)\b/;
const STATUS_Q = /\b(where|status|ready|when|pending|waiting|received|not received|didn.?t get|yet|still|kab|milega|aayega|enduku|ravatledu)\b/;
const BOOK = /(follow[\s-]?up|home visit|home collection|sample collection|book(ing)?\b|appointment|schedule|collect sample|blood test at home|visit me|come home)/;
const PACKAGE = /\b(package|packages|price|prices|cost|rate|rates|charges?|how much|checkup|check up|health check|full body|offer|discount|fees?)\b/;
const GREETING = /^(hi+|hello+|hey+|hai|hlo|namaste|good (morning|afternoon|evening)|menu|main menu|help)$/;
const OPT_IN = /^\s*(start|subscribe|resume|opt[\s-]?in|start promotions?)\s*[.!]?\s*$/i;

// Button ids / template quick-reply payloads we know about (case/underscore-insensitive).
const BUTTON_MAP = new Map([
  ["book follow up", INTENTS.BOOK_FOLLOWUP],
  ["book followup", INTENTS.BOOK_FOLLOWUP],
  ["book home visit", INTENTS.BOOK_FOLLOWUP],
  ["latest report", INTENTS.REPORT_RESEND],
  ["report download latest", INTENTS.REPORT_RESEND],
  ["view packages", INTENTS.PACKAGE_ENQUIRY],
  ["explore packages", INTENTS.PACKAGE_ENQUIRY]
]);
// Buttons the existing bot already serves; the router only records them (never intercepts).
const PASSTHROUGH_BUTTONS = new Set(["report previous trends", "previous trends", "previous reports", "trend report", "trend reports", "request reports"]);

export function extractReqno(text) {
  const m = String(text || "").match(/\b(R20\d{10,11}|20\d{9,10})\b/i);
  return m ? m[1].toUpperCase() : null;
}

const STOPWORDS = new Set(["what", "is", "the", "of", "for", "a", "an", "my", "me", "do", "you", "have", "price", "prices", "cost", "rate", "rates", "charges", "charge", "how", "much", "does", "it", "tell", "about", "package", "packages", "test", "tests", "please", "pls", "and", "need", "want", "to", "book", "check", "checkup", "details", "info", "any", "offer", "offers", "discount", "fees", "fee", "are", "there", "can", "i", "get", "know", "s"]);
export function extractCatalogTerm(text) {
  const words = norm(text).split(" ").filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return words.slice(0, 4).join(" ");
}

/**
 * @param {string} text  button id/title or free text
 * @param {{ isButton?: boolean }} opts
 * @returns {{ intent: string, confidence: number, reason?: string, entities: object, passthrough?: boolean }}
 */
export function classifyIntent(text, { isButton = false } = {}) {
  const raw = String(text || "").trim();
  const t = norm(raw);
  const entities = {};
  if (!t) return { intent: INTENTS.UNKNOWN, confidence: 0, entities };

  if (OPT_IN.test(raw)) return { intent: INTENTS.OPT_IN, confidence: 1, entities };

  if (isButton || BUTTON_MAP.has(t) || PASSTHROUGH_BUTTONS.has(t)) {
    if (PASSTHROUGH_BUTTONS.has(t)) return { intent: INTENTS.UNKNOWN, confidence: 0, entities, passthrough: true };
    const hit = BUTTON_MAP.get(t);
    if (hit) return { intent: hit, confidence: 1, entities };
  }

  if (GREETING.test(t)) return { intent: INTENTS.GREETING, confidence: 1, entities, passthrough: true };

  if (COMPLAINT.test(t)) return { intent: INTENTS.COMPLAINT, confidence: 0.9, reason: "complaint", entities };
  if (MEDICAL.test(t)) return { intent: INTENTS.MEDICAL_ADVICE, confidence: 0.9, reason: "medical_advice", entities };

  const reqno = extractReqno(raw);
  if (reqno) entities.reqno = reqno;

  if (REPORT_WORD.test(t)) {
    if (RESEND_VERB.test(t) && !/\b(where|when|status|kab)\b/.test(t)) return { intent: INTENTS.REPORT_RESEND, confidence: 0.85, entities };
    if (STATUS_Q.test(t) || /\bmy (report|result)/.test(t)) return { intent: INTENTS.REPORT_STATUS, confidence: 0.85, entities };
    return { intent: INTENTS.REPORT_STATUS, confidence: 0.6, entities };
  }
  if (reqno) return { intent: INTENTS.REPORT_STATUS, confidence: 0.65, entities };

  if (BOOK.test(t)) {
    const term = extractCatalogTerm(t.replace(/follow[\s-]?up|home visit|home collection|sample collection|appointment|schedule/g, " "));
    if (term) entities.item = term;
    return { intent: INTENTS.BOOK_FOLLOWUP, confidence: 0.85, entities };
  }
  if (PACKAGE.test(t)) {
    entities.term = extractCatalogTerm(t);
    return { intent: INTENTS.PACKAGE_ENQUIRY, confidence: 0.8, entities };
  }

  return { intent: INTENTS.UNKNOWN, confidence: 0.2, entities };
}
