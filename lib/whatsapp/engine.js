// lib/whatsapp/engine.js

import { getLatestReportUrl, getTrendReportUrl, lookupReports } from "@/lib/neosoft/client";

function normalizePhone(phone) {

  if (!phone) return phone;

  // Remove non-digits
  let p = phone.replace(/\D/g, "");

  // Remove leading 91 if present
  if (p.startsWith("91") && p.length === 12) {
    p = p.substring(2);
  }

  return p;
}

function getFlowText(botFlowConfig, key, fallback) {
  return botFlowConfig?.texts?.[key] || fallback;
}

function isValidDateInput(value) {
  return /^\d{2}-\d{2}-\d{4}$/.test(value);
}

function parseDateInput(rawInput) {
  if (!rawInput) return null;

  if (rawInput.startsWith("DATE_")) {
    const iso = rawInput.replace("DATE_", "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [year, month, day] = iso.split("-");
    return {
      iso,
      display: `${day}-${month}-${year}`
    };
  }

  const trimmed = rawInput.trim();
  if (isValidDateInput(trimmed)) {
    const [day, month, year] = trimmed.split("-");
    return {
      iso: `${year}-${month}-${day}`,
      display: trimmed
    };
  }

  return null;
}

function parseSlotInput(rawInput, context = {}) {
  if (!rawInput) return { slotName: null, slotId: null };

  const slotMap = context.available_slots || {};

  if (rawInput.startsWith("SLOT_")) {
    const slotId = rawInput.replace("SLOT_", "").trim();
    return {
      slotId,
      slotName: slotMap[slotId] || null
    };
  }

  if (slotMap[rawInput]) {
    return {
      slotId: rawInput,
      slotName: slotMap[rawInput]
    };
  }

  return {
    slotId: null,
    slotName: rawInput
  };
}

function parseHmToMinutes(value, fallbackMinutes) {
  const text = String(value || "").trim();
  if (!/^\d{1,2}:\d{2}$/.test(text)) return fallbackMinutes;
  const [h, m] = text.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return fallbackMinutes;
  }
  return h * 60 + m;
}

function parseLocationTextInput(value) {
  const text = String(value || "").trim();
  if (!text) {
    return {
      text: "",
      source: "manual_text",
      areaText: "",
      lat: null,
      lng: null
    };
  }

  const directLatLng = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (directLatLng) {
    return {
      text,
      source: "manual_coordinates",
      areaText: "Location shared on WhatsApp",
      lat: Number(directLatLng[1]),
      lng: Number(directLatLng[2])
    };
  }

  const urlMatch = text.match(/^https?:\/\/\S+/i);
  if (urlMatch) {
    const urlText = urlMatch[0];

    const queryLatLng =
      urlText.match(/[?&](?:q|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i) ||
      urlText.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i) ||
      urlText.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i);

    if (queryLatLng) {
      return {
        text: urlText,
        source: "manual_map_link",
        areaText: "Location shared on WhatsApp",
        lat: Number(queryLatLng[1]),
        lng: Number(queryLatLng[2])
      };
    }

    return {
      text: urlText,
      source: "manual_map_link",
      areaText: "Location shared on WhatsApp",
      lat: null,
      lng: null
    };
  }

  return {
    text,
    source: "manual_text",
    areaText: text,
    lat: null,
    lng: null
  };
}

function formatVisitSummary(visit) {
  if (!visit || typeof visit !== "object") return "";
  const dateText = visit.visit_date
    ? new Date(visit.visit_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "upcoming date";
  const slotText = String(visit?.time_slot?.slot_name || "").trim();
  const codeText = String(visit?.visit_code || visit?.id || "").trim();
  const parts = [
    codeText ? `Visit ${codeText}` : "Scheduled visit",
    `on ${dateText}`,
    slotText ? `at ${slotText}` : null
  ].filter(Boolean);
  return parts.join(" ");
}

function normalizeVisitStatusLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "disabled" || raw === "canceled" || raw === "cancelled") return "CANCELLED";
  return raw.toUpperCase();
}

function formatContactPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+91 ${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+91 ${digits.slice(2)}`;
  return `+${digits}`;
}

function buildExecutiveContactReply({ activeVisit, options }) {
  const hvName = String(activeVisit?.executive?.name || "").trim();
  const hvPhone = formatContactPhone(activeVisit?.executive?.phone || "");
  const labName = String(options?.labName || "our lab").trim();
  const reportNotifyNumber = formatContactPhone(options?.reportNotifyNumber || "");

  const lines = [
    "📞 Contact Details",
    hvName ? `Assigned HV Executive: ${hvName}` : "Assigned HV Executive: Not assigned yet.",
    hvPhone ? `Executive Phone: ${hvPhone}` : null,
    reportNotifyNumber
      ? `For any service issues, contact ${labName} at ${reportNotifyNumber}.`
      : `For any service issues, contact ${labName}.`
  ];

  return lines.filter(Boolean).join("\n");
}

function buildBookingServicesResponse({ options, context }) {
  const activeVisit = options?.activeVisit || null;
  if (!activeVisit) {
    return {
      replyType: "BOOKING_DATE_MENU",
      newState: "BOOKING_DATE",
      context: {
        ...context,
        has_active_visit: false,
        active_visit: null,
        active_visit_summary: null
      }
    };
  }

  return {
    replyType: "BOOKING_SERVICES_MENU",
    newState: "BOOKING_SERVICES_MENU",
    context: {
      ...context,
      has_active_visit: Boolean(activeVisit),
      active_visit: activeVisit
        ? {
            id: activeVisit.id || null,
            visit_code: activeVisit.visit_code || null,
            visit_date: activeVisit.visit_date || null,
            status: activeVisit.status || null,
            address: activeVisit.address || null,
            time_slot: activeVisit.time_slot || null,
            executive: activeVisit.executive || null
          }
        : null,
      active_visit_summary: activeVisit ? formatVisitSummary(activeVisit) : null
    }
  };
}

function getIstTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  return {
    weekday: String(map.weekday || "").toLowerCase().slice(0, 3),
    minutes: Number(map.hour || 0) * 60 + Number(map.minute || 0)
  };
}

function isAgentAvailableNow(botFlowConfig = {}) {
  const config = botFlowConfig?.agent_hours || {};
  const openMinutes = parseHmToMinutes(config.open, 7 * 60);
  const closeMinutes = parseHmToMinutes(config.close, 21 * 60);
  const days = Array.isArray(config.days) && config.days.length > 0
    ? config.days.map((d) => String(d).toLowerCase().slice(0, 3))
    : ["mon", "tue", "wed", "thu", "fri", "sat"];

  const { weekday, minutes } = getIstTimeParts();
  if (!days.includes(weekday)) return false;
  return minutes >= openMinutes && minutes <= closeMinutes;
}

function shouldApplyIntentDetection(state) {
  const safeEntryStates = new Set([
    "START",
    "MORE_SERVICES"
  ]);

  return safeEntryStates.has(String(state || "START"));
}

function appendLabTimings(text, botFlowConfig) {
  const baseText = String(text || "").trim();
  const timingsText = String(getFlowText(botFlowConfig, "lab_timings_text", "") || "").trim();

  if (!timingsText) return baseText;
  if (!baseText) return timingsText;

  return `${baseText}\n\nLab timings:\n${timingsText}`;
}

function handleMoreServicesInput({ input, context, phone, botFlowConfig }) {
  if (input === "TALK_EXECUTIVE") {
    if (isAgentAvailableNow(botFlowConfig)) {
      return {
        replyType: "HANDOFF",
        replyText: appendLabTimings(
          getFlowText(
            botFlowConfig,
            "handoff_open_text",
            "Connecting you to our executive. Please wait..."
          ),
          botFlowConfig
        ),
        newState: "HUMAN_HANDOVER",
        context
      };
    }

    return {
      replyType: "TEXT",
      replyText: appendLabTimings(
        getFlowText(
          botFlowConfig,
          "handoff_closed_text",
          "Our executives are currently offline. Reply YES to request a callback on the next working day."
        ),
        botFlowConfig
      ),
      newState: "HANDOFF_CALLBACK_WAITING",
      context
    };
  }

  if (input === "LAB_TIMINGS") {
    return {
      replyType: "TEXT",
      replyText: getFlowText(
        botFlowConfig,
        "lab_timings_text",
        "🕒 Lab Timings:\n\nMon–Sat: 7:00 AM – 8:00 PM\nSunday: 7:00 AM – 2:00 PM"
      ),
      newState: "MORE_SERVICES",
      context
    };
  }

  if (input === "SEND_LOCATION") {
    return {
      replyType: "LOCATION_OPTIONS_MENU",
      newState: "LOCATION_OPTIONS",
      context
    };
  }

  if (input === "FEEDBACK") {
    return {
      replyType: "FEEDBACK_LINK",
      newState: "START",
      context: {}
    };
  }

  if (input === "EXPLORE_PACKAGES") {
    return {
      replyType: "PACKAGE_MENU",
      newState: "PACKAGE_MENU",
      context: {
        ...context,
        package_page: 1
      }
    };
  }

  if (input === "DOWNLOAD_TREND_REPORTS") {
    return buildTrendReportResponse({
      phone,
      context,
      botFlowConfig
    });
  }

  return null;
}

function normalizeButtonSelection(rawInput) {
  const trimmed = String(rawInput || "").trim();
  if (!trimmed) return "";

  const compact = trimmed
    .replace(/[^\p{L}\p{N}\s_]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  const directMap = {
    REQUEST_REPORTS: "REQUEST_REPORTS",
    "REQUEST REPORTS": "REQUEST_REPORTS",
    "REQUEST REPORT": "REQUEST_REPORTS",
    REPORTS: "REQUEST_REPORTS",
    REPORT: "REQUEST_REPORTS",
    MY_REPORTS: "REQUEST_REPORTS",
    "MY REPORTS": "REQUEST_REPORTS",
    BOOK_HOME_VISIT: "BOOK_HOME_VISIT",
    "BOOK HOME VISIT": "BOOK_HOME_VISIT",
    HOME_VISIT: "BOOK_HOME_VISIT",
    "HOME VISIT": "BOOK_HOME_VISIT",
    BOOK_VISIT: "BOOK_HOME_VISIT",
    "BOOK VISIT": "BOOK_HOME_VISIT",
    BOOKING_NEW_VISIT: "BOOKING_NEW_VISIT",
    BOOKING_VIEW_ACTIVE_VISIT: "BOOKING_VIEW_ACTIVE_VISIT",
    BOOKING_CHANGE_CANCEL_VISIT: "BOOKING_CHANGE_CANCEL_VISIT",
    BOOKING_CONTACT_EXECUTIVE: "BOOKING_CONTACT_EXECUTIVE",
    BOOKING_VIEW_REPORTS: "BOOKING_VIEW_REPORTS",
    FEEDBACK: "FEEDBACK",
    RATE_US: "FEEDBACK",
    "RATE US": "FEEDBACK",
    DOWNLOAD_TREND_REPORTS: "DOWNLOAD_TREND_REPORTS",
    VIEW_TREND_REPORT: "DOWNLOAD_TREND_REPORTS",
    "VIEW TREND REPORT": "DOWNLOAD_TREND_REPORTS",
    TREND_REPORT: "DOWNLOAD_TREND_REPORTS",
    "TREND REPORT": "DOWNLOAD_TREND_REPORTS",
    REPORT_DOWNLOAD_LATEST: "REPORT_DOWNLOAD_LATEST",
    "DOWNLOAD LATEST REPORT": "REPORT_DOWNLOAD_LATEST",
    "LATEST REPORT": "REPORT_DOWNLOAD_LATEST",
    REPORT_PREVIOUS_TRENDS: "REPORT_PREVIOUS_LIST",
    REPORT_PREVIOUS: "REPORT_PREVIOUS_LIST",
    "PREVIOUS": "REPORT_PREVIOUS_LIST",
    "DOWNLOAD PREVIOUS REPORTS": "REPORT_PREVIOUS_LIST",
    "PREVIOUS REPORTS": "REPORT_PREVIOUS_LIST",
    "PREVIOUS TRENDS": "REPORT_PREVIOUS_LIST",
    REPORT_PREVIOUS_LIST: "REPORT_PREVIOUS_LIST",
    "PREVIOUS LIST": "REPORT_PREVIOUS_LIST",
    "SELECT FROM LAST 5 REPORTS": "REPORT_PREVIOUS_LIST",
    "LAST 5 REPORTS": "REPORT_PREVIOUS_LIST",
    REPORT_SELECT_ANOTHER: "REPORT_SELECT_ANOTHER",
    "ANOTHER REPORT": "REPORT_SELECT_ANOTHER",
    "SELECT ANOTHER REPORT": "REPORT_SELECT_ANOTHER",
    ANOTHER: "REPORT_SELECT_ANOTHER",
    TREND_LATEST: "TREND_LATEST",
    "REPORT TRENDS": "TREND_LATEST",
    "TREND REPORTS": "TREND_LATEST",
    "TREND REPORT": "TREND_LATEST",
    MORE_SERVICES: "MORE_SERVICES",
    "MORE SERVICES": "MORE_SERVICES",
    BOOKING_SHARE_CURRENT_LOCATION: "BOOKING_SHARE_CURRENT_LOCATION",
    "SHARE CURRENT LOCATION": "BOOKING_SHARE_CURRENT_LOCATION",
    "CURRENT LOCATION": "BOOKING_SHARE_CURRENT_LOCATION",
    BOOKING_SHARE_MAPS_LINK: "BOOKING_SHARE_MAPS_LINK",
    "SEND MAPS LINK": "BOOKING_SHARE_MAPS_LINK",
    "MAPS LINK": "BOOKING_SHARE_MAPS_LINK",
    "SEND LOCATION LINK": "BOOKING_SHARE_MAPS_LINK",
    BOOKING_SKIP_LOCATION: "BOOKING_SKIP_LOCATION",
    "SKIP FOR NOW": "BOOKING_SKIP_LOCATION",
    "NOT NOW": "BOOKING_SKIP_LOCATION",
    NEVERMIND: "BOOKING_SKIP_LOCATION",
    MAIN_MENU: "MAIN_MENU",
    "MAIN MENU": "MAIN_MENU"
  };

  return directMap[compact] || compact;
}

export function detectIntent(text) {

  if (!text) return null;

  const t = text.toLowerCase();

  const intents = {

    REQUEST_REPORTS: [
      "reports",
      "report",
      "result",
      "results",
      "my report",
      "lab report",
      "blood report",
      "test report",
      "download report",
      "send report",
      "my reports",
      "lab results",
      "test results"
    ],

    BOOK_HOME_VISIT: [
      "book",
      "book test",
      "blood test",
      "home visit",
      "home collection",
      "sample collection"
    ],

    EXPLORE_PACKAGES: [
      "package",
      "health package",
      "checkup",
      "full body checkup",
      "price",
      "packages"
    ],

    SEND_LOCATION: [
      "location",
      "address",
      "map",
      "where are you",
      "directions"
    ],

    LAB_TIMINGS: [
      "timing",
      "timings",
      "open",
      "close",
      "working hours"
    ],

    TALK_EXECUTIVE: [
      "help",
      "support",
      "agent",
      "executive",
      "talk to someone",
      "call me"
    ],

    MORE_SERVICES: [
      "info",
      "information",
      "more info",
      "details",
      "tell me more"
    ]

  };

  for (const [intent, keywords] of Object.entries(intents)) {
    for (const k of keywords) {
      if (t.includes(k)) {
        return intent;
      }
    }
  }

  return null;
}

function buildReportFilenameFromSelection({ reqid, selectedTitle }) {
  const safeReqId = String(reqid || "").trim();
  const title = String(selectedTitle || "").trim();
  if (!title) return `SDRC_Report_${safeReqId}.pdf`;

  const tokens = title.split(/\s+/).filter(Boolean);
  const reqNoToken = (tokens[0] || "").replace(/[^0-9A-Za-z_-]/g, "");
  const nameToken = (tokens[1] || "PATIENT").replace(/[^A-Za-z]/g, "").toUpperCase();

  if (reqNoToken && nameToken) return `SDRC_Report_${reqNoToken}_${nameToken}.pdf`;
  if (reqNoToken) return `SDRC_Report_${reqNoToken}.pdf`;
  return `SDRC_Report_${safeReqId}.pdf`;
}

function extractReqnoFromSelectionTitle(selectedTitle) {
  const title = String(selectedTitle || "").trim();
  if (!title) return null;

  const firstToken = title.split(/\s+/).find(Boolean) || "";
  const reqno = firstToken.replace(/\D/g, "");

  return reqno || null;
}

function formatReportDate(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function buildReportMenuRows(reports = []) {
  return (reports || []).slice(0, 5).map((r) => ({
    ...r,
    display_title: `Req No: ${r.reqno} • ${formatReportDate(r.reqdt)}`
  }));
}

function buildReportOptionsMap(reports = []) {
  return (reports || []).slice(0, 5).reduce((acc, r) => {
    acc[String(r.reqid)] = {
      reqid: String(r.reqid || "").trim(),
      reqno: String(r.reqno || "").trim(),
      patient_name: String(r.patient_name || "").trim(),
      mrno: String(r.mrno || "").trim() || null,
      reqdt: r.reqdt
    };
    return acc;
  }, {});
}

async function buildReportSelectionResponse({ phone, context, botFlowConfig }) {
  try {
    const cleanPhone = normalizePhone(phone);
    const reports = await lookupReports(cleanPhone);
    console.log("Reports returned:", reports);

    if (reports && reports.length > 0) {
      const recentReports = buildReportMenuRows(reports);
      const reportOptions = buildReportOptionsMap(reports);

      return {
        replyType: "REPORT_SELECTION_MENU",
        reports: recentReports,
        newState: "REPORT_SELECTION",
        context: {
          ...context,
          report_options: reportOptions,
          recent_reports: recentReports
        }
      };
    }
  } catch (err) {
    console.error("Report lookup failed:", err);
  }

  return {
    replyType: "INTERNAL_NOTIFY",
    notifyText: `📄 Report Request\nPhone: ${phone}\nInput: WhatsApp number`,
    replyText:
      getFlowText(
        botFlowConfig,
        "report_request_ack",
        "Thank you. Our team will verify and send your report shortly."
      ),
    newState: "HUMAN_HANDOVER",
    context: {}
  };
}

async function buildLatestReportResponse({ phone, context, botFlowConfig }) {
  try {
    const cleanPhone = normalizePhone(phone);
    return {
      replyType: "SEND_DOCUMENT",
      documentUrl: getLatestReportUrl(cleanPhone),
      filename: `SDRC_Latest_Report_${cleanPhone}.pdf`,
      latestReportPhone: cleanPhone,
      fallbackRequestedInput: `Latest report PDF not available for phone ${cleanPhone}`,
      sendReportActionsMenu: true,
      newState: "REPORT_POST_DOWNLOAD_MENU",
      context
    };
  } catch (err) {
    console.error("Latest report lookup failed:", err);
  }

  // Fallback path for safety if latest-report endpoint has issues.
  try {
    const cleanPhone = normalizePhone(phone);
    const reports = await lookupReports(cleanPhone);
    const latest = Array.isArray(reports) ? reports[0] : null;

    if (latest?.reqid) {
      const reportOptions = buildReportOptionsMap(reports);
      const reqid = String(latest.reqid).trim();
      const reqno = String(latest.reqno || reqid).trim();
      const patientName = String(latest.patient_name || "").trim() || null;
      const mrno = String(latest.mrno || "").trim() || null;
      const firstName = (patientName || "Patient")
        .replace(/^(DR\.?|MR\.?|MRS\.?|MS\.?|CAPT\.?|COL\.?|LT\.?|MAJ\.?|PROF\.?)\s+/i, "")
        .split(/\s+/)[0]
        .toUpperCase() || "PATIENT";

      return {
        replyType: "SEND_DOCUMENT",
        documentUrl: `${process.env.NEOSOFT_API_BASE_URL}/report/${reqid}`,
        filename: `SDRC_Report_${reqno}_${firstName}.pdf`,
        reportStatusReqno: reqno,
        fallbackRequestedInput: `Report PDF not available for requisition ${reqno}`,
        sendReportActionsMenu: true,
        newState: "REPORT_POST_DOWNLOAD_MENU",
        context: {
          ...context,
          report_options: reportOptions,
          selected_report_reqid: reqid,
          selected_report_reqno: reqno,
          selected_report_patient_name: patientName,
          selected_report_mrno: mrno
        }
      };
    }
  } catch (fallbackErr) {
    console.error("Latest report fallback lookup failed:", fallbackErr);
  }

  return {
    replyType: "INTERNAL_NOTIFY",
    notifyText: `📄 Report Request\nPhone: ${phone}\nInput: Latest report by WhatsApp number`,
    replyText:
      getFlowText(
        botFlowConfig,
        "report_request_ack",
        "Thank you. Our team will verify and send your report shortly."
      ),
    newState: "HUMAN_HANDOVER",
    context: {}
  };
}

async function buildTrendReportResponse({ phone, context, botFlowConfig }) {
  try {
    const cleanPhone = normalizePhone(phone);
    const reports = await lookupReports(cleanPhone);
    console.log("Reports returned:", reports);

    const latestReport = Array.isArray(reports) ? reports.find((report) => String(report?.mrno || "").trim()) : null;

    if (latestReport) {
      const reqNo = String(latestReport.reqno || latestReport.mrno || "").trim();
      const mrno = String(latestReport.mrno || "").trim();

      return {
        replyType: "SEND_DOCUMENT",
        documentUrl: getTrendReportUrl(mrno),
        filename: `SDRC_Trend_Report_${reqNo || mrno}.pdf`,
        fallbackRequestedInput: `Trend report PDF not available for MR No ${mrno}`,
        newState: "START",
        context: {}
      };
    }
  } catch (err) {
    console.error("Trend report lookup failed:", err);
  }

  return {
    replyType: "INTERNAL_NOTIFY",
    notifyText: `📄 Report Request\nPhone: ${phone}\nInput: Trend report via WhatsApp number`,
    replyText:
      getFlowText(
        botFlowConfig,
        "report_request_ack",
        "Thank you. Our team will verify and send your report shortly."
      ),
    newState: "HUMAN_HANDOVER",
    context: {}
  };
}

export async function processMessage(session, userInput, phone, options = {}) {
  const state = session.current_state || "START";
  const context = session.context || {};
  const botFlowConfig = options.botFlowConfig || {};

  const rawInput = (userInput || "").trim();
  let input = normalizeButtonSelection(rawInput);
  const compactInput = String(rawInput || "")
    .replace(/[^\p{L}\p{N}\s_]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const hasExplicitCommandMapping = input !== compactInput;
  console.log("STATE:", state, "INPUT:", input, "CONTEXT KEYS:", Object.keys(context));

  // ---------------------------------------------------
  // Instagram / URL messages → show Main Menu
  // ---------------------------------------------------

  const allowUrlAsLocation = new Set([
    "BOOKING_AREA",
    "BOOKING_LOCATION_WAITING_TEXT",
    "BOOKING_LOCATION_WAITING_PIN",
    "BOOKING_POST_CONFIRM_LOCATION_WAITING"
  ]);

  if (/instagram\.com|http:\/\/|https:\/\//i.test(rawInput) && !allowUrlAsLocation.has(state)) {
    return {
      replyType: "MAIN_MENU",
      newState: "START",
      context: {}
    };
  }

  // ------------------------------------
  // INTENT DETECTION (AI-like routing)
  // ------------------------------------

  const isStructuredId =
    /^(REPORT_|SLOT_|DATE_|PKG_|PKGV_|BRANCH_|SLOT_PAGE_|PKG_PAGE_)/.test(rawInput.toUpperCase()) ||
    /^[A-Z0-9_]+$/.test(rawInput.trim());

  const detectedIntent =
    !hasExplicitCommandMapping && !isStructuredId && shouldApplyIntentDetection(state)
      ? detectIntent(rawInput)
      : null;

  if (detectedIntent) {
    input = detectedIntent;
  }

  // ---------------------------------------------------
  // GREETING RESET
  // ---------------------------------------------------

  if (/^(hi|hii|hai|hello|hey|menu)/i.test(rawInput)) {
    return {
      replyType: "MAIN_MENU",
      newState: "START",
      context: {}
    };
  }

  if (input === "HELP" || input === "TALK_EXECUTIVE") {
    return {
      replyType: "HANDOFF",
      replyText: appendLabTimings(
        getFlowText(
          botFlowConfig,
          "wait_for_executive_text",
          "Thanks for your message. Please wait, our executive will reach out to help you shortly."
        ),
        botFlowConfig
      ),
      newState: "HUMAN_HANDOVER",
      context
    };
  }

  // ---------------------------------------------------
  // GLOBAL COMMANDS (work from anywhere)
  // ---------------------------------------------------
  if (input === "MAIN_MENU") {
    return {
      replyType: "MAIN_MENU",
      newState: "START",
      context: {}
    };
  }

  if (input === "MORE_SERVICES") {
    return {
      replyType: "MORE_SERVICES_MENU",
      newState: "MORE_SERVICES",
      context
    };
  }

  if (input === "REQUEST_REPORTS") {
    return {
      replyType: "REPORT_INPUT_PROMPT",
      newState: "REPORT_WAITING_INPUT",
      context
    };
  }

  if (input === "REPORT_DOWNLOAD_LATEST") {
    return buildLatestReportResponse({
      phone,
      context,
      botFlowConfig
    });
  }

  if (input === "REPORT_PREVIOUS_TRENDS") {
    return {
      replyType: "REPORT_HISTORY_TREND_MENU",
      newState: "REPORT_HISTORY_TREND_MENU",
      context
    };
  }

  if (input === "REPORT_PREVIOUS_LIST") {
    return buildReportSelectionResponse({
      phone,
      context,
      botFlowConfig
    });
  }

  if (input === "REPORT_SELECT_ANOTHER") {
    return buildReportSelectionResponse({
      phone,
      context,
      botFlowConfig
    });
  }

  if (input === "BOOK_HOME_VISIT") {
    return buildBookingServicesResponse({ options, context });
  }

  if (input === "DOWNLOAD_TREND_REPORTS") {
    return buildTrendReportResponse({
      phone,
      context,
      botFlowConfig
    });
  }

  if (input === "FEEDBACK") {
    return {
      replyType: "FEEDBACK_LINK",
      newState: "START",
      context: {}
    };
  }
  // ---------------------------------------------------
  // STATE MACHINE
  // ---------------------------------------------------
  switch (state) {

    // ===================================================
    // START (Main Menu)
    // ===================================================
    case "START": {

      if (input === "__MEDIA__") {
        const mediaUrl = options?.inboundMedia?.url || null;
        return {
          replyType: "INTERNAL_NOTIFY",
          notifyText: [
            "📄 Report Request",
            `Phone: ${phone}`,
            "Input: Image attachment",
            mediaUrl ? `Attachment: ${mediaUrl}` : null
          ]
            .filter(Boolean)
            .join("\n"),
          replyText:
            getFlowText(
              botFlowConfig,
              "report_request_ack",
              "Thank you. Our team will verify and send your report shortly."
            ),
          newState: "HUMAN_HANDOVER",
          context: {}
        };
      }

      // Resilient fallback: if a report list selection comes in while state got reset,
      // still send the selected report directly instead of looping back to main menu.
      if (input.startsWith("REPORT_")) {
        const reqid = input.replace("REPORT_", "").trim();
        const entry = context.report_options?.[reqid];
        const fallbackReqno = extractReqnoFromSelectionTitle(options?.selectedReportTitle);


        return {
          replyType: "SEND_DOCUMENT",
          documentUrl: `${process.env.NEOSOFT_API_BASE_URL}/report/${reqid}`,
          filename: buildReportFilenameFromSelection({
            reqid,
            selectedTitle: options?.selectedReportTitle
          }),
          reportStatusReqno: entry?.reqno || fallbackReqno,
          fallbackRequestedInput: `Report PDF not available for requisition ${reqid}`,
          sendReportActionsMenu: true,
          newState: "REPORT_POST_DOWNLOAD_MENU",
          context: {
            ...context,
            selected_report_reqid: reqid,
            selected_report_reqno: entry?.reqno || fallbackReqno,
            selected_report_patient_name: entry?.patient_name || null,
            selected_report_mrno: entry?.mrno || null
          }
        };
      }

      if (input === "TREND_LATEST" || input === "TREND_REPORT_LATEST") {
        return buildTrendReportResponse({
          phone,
          context,
          botFlowConfig
        });
      }

      if (input === "REQUEST_REPORTS") {
        return {
          replyType: "REPORT_INPUT_PROMPT",
          newState: "REPORT_WAITING_INPUT",
          context
        };
      }

      if (input === "REPORT_DOWNLOAD_LATEST") {
        return buildLatestReportResponse({
          phone,
          context,
          botFlowConfig
        });
      }

      if (input === "REPORT_PREVIOUS_TRENDS") {
        return {
          replyType: "REPORT_HISTORY_TREND_MENU",
          newState: "REPORT_HISTORY_TREND_MENU",
          context
        };
      }

      if (input === "REPORT_PREVIOUS_LIST") {
        return buildReportSelectionResponse({
          phone,
          context,
          botFlowConfig
        });
      }

      if (input === "BOOK_HOME_VISIT") {
        return buildBookingServicesResponse({ options, context });
      }

      if (input === "BOOKING_CONTACT_EXECUTIVE" && options?.activeVisit) {
        const activeVisit = options.activeVisit;
        return {
          replyType: "TEXT",
          replyText: buildExecutiveContactReply({ activeVisit, options }),
          newState: "BOOKING_SERVICES_MENU",
          context: {
            ...context,
            has_active_visit: true,
            active_visit: {
              id: activeVisit.id || null,
              visit_code: activeVisit.visit_code || null,
              visit_date: activeVisit.visit_date || null,
              status: activeVisit.status || null,
              address: activeVisit.address || null,
              time_slot: activeVisit.time_slot || null,
              executive: activeVisit.executive || null
            },
            active_visit_summary: formatVisitSummary(activeVisit)
          }
        };
      }

      if (input === "MORE_SERVICES") {
        return {
          replyType: "MORE_SERVICES_MENU",
          newState: "MORE_SERVICES",
          context
        };
      }

      return {
        replyType: "MAIN_MENU",
        newState: "START",
        context: {}
      };
    }

    // ===================================================
    // REPORT FLOW
    // ===================================================
    case "REPORT_WAITING_INPUT": {
      if (input === "REPORT_DOWNLOAD_LATEST") {
        return buildLatestReportResponse({
          phone,
          context,
          botFlowConfig
        });
      }

      if (input === "REPORT_PREVIOUS_TRENDS") {
        return {
          replyType: "REPORT_HISTORY_TREND_MENU",
          newState: "REPORT_HISTORY_TREND_MENU",
          context
        };
      }

      if (input === "REPORT_PREVIOUS_LIST") {
        return buildReportSelectionResponse({
          phone,
          context,
          botFlowConfig
        });
      }

      if (input === "REPORT_USE_REGISTERED_NUMBER") {
        return {
          replyType: "INTERNAL_NOTIFY",
          notifyText: `📄 Report Request\nPhone: ${phone}\nInput: Registered number (same WhatsApp)`,
          replyText:
            getFlowText(
              botFlowConfig,
              "report_request_ack",
              "Thank you. Our team will verify and send your report shortly."
            ),
          newState: "HUMAN_HANDOVER",
          context: {}
        };
      }

      {
        const mediaUrl = options?.inboundMedia?.url || null;
        const inputText =
          input === "__MEDIA__" ? "Image attachment" : (userInput || "");
        return {
          replyType: "INTERNAL_NOTIFY",
          notifyText: [
            "📄 Report Request",
            `Phone: ${phone}`,
            `Input: ${inputText}`,
            mediaUrl ? `Attachment: ${mediaUrl}` : null
          ]
            .filter(Boolean)
            .join("\n"),
          replyText:
            getFlowText(
              botFlowConfig,
              "report_request_ack",
              "Thank you. Our team will verify and send your report shortly."
            ),
          newState: "HUMAN_HANDOVER",
          context: {}
        };
      }
    }
    case "REPORT_HISTORY_TREND_MENU": {
      if (input === "TREND_LATEST" || input === "TREND_REPORT_LATEST") {
        return buildTrendReportResponse({
          phone,
          context,
          botFlowConfig
        });
      }

      if (input === "REPORT_PREVIOUS_LIST") {
        return buildReportSelectionResponse({
          phone,
          context,
          botFlowConfig
        });
      }

      if (input === "REPORT_PREVIOUS_TRENDS") {
        return {
          replyType: "REPORT_HISTORY_TREND_MENU",
          newState: "REPORT_HISTORY_TREND_MENU",
          context
        };
      }

      return {
        replyType: "MAIN_MENU",
        newState: "START",
        context: {}
      };
    }

    // ===================================================
    // BOOKING FLOW
    // ===================================================
    case "BOOKING_SERVICES_MENU": {
      if (input === "BOOKING_NEW_VISIT") {
        return {
          replyType: "BOOKING_DATE_MENU",
          newState: "BOOKING_DATE",
          context
        };
      }

      if (input === "BOOKING_VIEW_ACTIVE_VISIT") {
        const activeVisit = context.active_visit || null;
        if (!activeVisit) {
          return {
            replyType: "TEXT",
            replyText: "No active visit found right now. You can book a new home visit.",
            newState: "BOOKING_SERVICES_MENU",
            context
          };
        }

        const detailLines = [
          "📋 Active Visit",
          context.active_visit_summary || formatVisitSummary(activeVisit),
          activeVisit?.address ? `Address: ${activeVisit.address}` : null,
          activeVisit?.status ? `Status: ${normalizeVisitStatusLabel(activeVisit.status)}` : null
        ].filter(Boolean);

        return {
          replyType: "TEXT",
          replyText: detailLines.join("\n"),
          newState: "BOOKING_SERVICES_MENU",
          context
        };
      }

      if (input === "BOOKING_CHANGE_CANCEL_VISIT") {
        return {
          replyType: "HANDOFF",
          replyText: appendLabTimings(
            getFlowText(
              botFlowConfig,
              "wait_for_executive_text",
              "Thanks for your message. Please wait, our executive will reach out to help you shortly."
            ),
            botFlowConfig
          ),
          newState: "HUMAN_HANDOVER",
          context: {
            ...context,
            handoff_reason: "visit_change_cancel"
          }
        };
      }

      if (input === "BOOKING_CONTACT_EXECUTIVE") {
        const activeVisit = context.active_visit || options?.activeVisit || null;

        return {
          replyType: "TEXT",
          replyText: buildExecutiveContactReply({ activeVisit, options }),
          newState: "BOOKING_SERVICES_MENU",
          context
        };
      }

      if (input === "BOOKING_VIEW_REPORTS") {
        return {
          replyType: "REPORT_INPUT_PROMPT",
          newState: "REPORT_WAITING_INPUT",
          context
        };
      }

      return {
        replyType: "MAIN_MENU",
        newState: "START",
        context: {}
      };
    }

    case "BOOKING_AREA": {
      // Backward compatibility: older sessions asked area first.
      // Keep accepting and move to date/time flow.
      if (rawInput) context.area = rawInput;
      return {
        replyType: "BOOKING_DATE_MENU",
        newState: "BOOKING_DATE",
        context
      };
    }
    case "BOOKING_TEST_SELECTION": {
      // Backward compatibility for any in-flight sessions that still land here first.
      context.tests = userInput;
      if (!context.area || !context.selected_date || !context.selected_slot) {
        return {
          replyType: "TEXT",
          replyText: getFlowText(
            botFlowConfig,
            "booking_area_prompt",
            "Please enter your area/location."
          ),
          newState: "BOOKING_AREA",
          context
        };
      }

      return {
        replyType: "CALL_QUICKBOOK",
        replyText: getFlowText(
          botFlowConfig,
          "booking_submitted_ack",
          "Your booking request has been received. Our team will contact you shortly."
        ),
        newState: "START",
        context
      };
    }
    case "BOOKING_DATE":
      {
        const parsedDate = parseDateInput(rawInput);
        if (!parsedDate) {
          return {
            replyType: "TEXT",
            replyText: getFlowText(
              botFlowConfig,
              "booking_date_invalid",
              "Please choose a date from menu or type in DD-MM-YYYY format."
            ),
            newState: "BOOKING_DATE",
            context
          };
        }

        context.selected_date_iso = parsedDate.iso;
        context.selected_date = parsedDate.display;
      }

      return {
        replyType: "BOOKING_SLOT_MENU",
        newState: "BOOKING_SLOT",
        context
      };

    case "REPORT_SELECTION": {

      if (input.startsWith("REPORT_")) {

        const reqid = input.replace("REPORT_", "").trim();

        const entry = context.report_options?.[reqid];

        let firstName = "Patient";

        if (entry?.patient_name) {

          const parts = entry.patient_name.trim().split(/\s+/);

          for (const p of parts) {
            const clean = p.replace(/[^a-z]/gi, "");
            if (clean.length > 4) {
              firstName = clean.toUpperCase();
              firstName = firstName.substring(0,20);
              break;
            }
          }

        }

        const filename =
          `SDRC_Report_${entry?.reqno || reqid}_${firstName}.pdf`;

        return {
          replyType: "SEND_DOCUMENT",
          documentUrl: `${process.env.NEOSOFT_API_BASE_URL}/report/${reqid}`,
          filename,
          reportStatusReqno: entry?.reqno || null,
          fallbackRequestedInput: `Report PDF not available for requisition ${entry?.reqno || reqid}`,
          sendReportActionsMenu: true,
          newState: "REPORT_POST_DOWNLOAD_MENU",
          context: {
            ...context,
            selected_report_reqid: reqid,
            selected_report_reqno: entry?.reqno || reqid,
            selected_report_patient_name: entry?.patient_name || null,
            selected_report_mrno: entry?.mrno || null
          }
        };
      }   
      return {
      replyType: "MAIN_MENU",
      newState: "START",
      context: {}
    };
  }
    case "REPORT_POST_DOWNLOAD_MENU": {
      if (input === "TREND_LATEST" || input === "TREND_REPORT_LATEST") {
        if (!context.selected_report_mrno) {
          return {
            replyType: "TEXT",
            replyText: "Trend report is not available for this patient right now. Please choose another report or go back to the main menu.",
            newState: "REPORT_POST_DOWNLOAD_MENU",
            context
          };
        }

        const reqNo = context.selected_report_reqno || context.selected_report_mrno;

        return {
          replyType: "SEND_DOCUMENT",
          documentUrl: getTrendReportUrl(context.selected_report_mrno),
          filename: `SDRC_Trend_Report_${reqNo}.pdf`,
          fallbackRequestedInput: `Trend report PDF not available for MR No ${context.selected_report_mrno}`,
          sendReportActionsMenu: true,
          newState: "REPORT_POST_DOWNLOAD_MENU",
          context
        };
      }

      if (input === "REPORT_SELECT_ANOTHER") {
        return buildReportSelectionResponse({
          phone,
          context,
          botFlowConfig
        });
      }

      if (input === "REPORT_PREVIOUS_TRENDS") {
        const reports = Array.isArray(context.recent_reports) ? context.recent_reports : [];

        if (reports.length > 0) {
          return {
            replyType: "REPORT_SELECTION_MENU",
            reports,
            newState: "REPORT_SELECTION",
            context
          };
        }

        return buildReportSelectionResponse({
          phone,
          context,
          botFlowConfig
        });
      }

      return {
        replyType: "MAIN_MENU",
        newState: "START",
        context: {}
      };
    }
    case "BOOKING_SLOT": {
      if (input.startsWith("SLOT_PAGE_")) {
        const pageNo = Number(input.replace("SLOT_PAGE_", "").trim());
        context.slot_page = Number.isFinite(pageNo) && pageNo > 0 ? pageNo : 1;

        return {
          replyType: "BOOKING_SLOT_MENU",
          newState: "BOOKING_SLOT",
          context
        };
      }

      {
        const parsedSlot = parseSlotInput(rawInput, context);
        if (input.startsWith("SLOT_") && !parsedSlot.slotName) {
          return {
            replyType: "TEXT",
            replyText: getFlowText(
              botFlowConfig,
              "booking_slot_invalid",
              "Please choose a valid time slot from the menu."
            ),
            newState: "BOOKING_SLOT",
            context
          };
        }

        context.selected_slot = parsedSlot.slotName || userInput;
        context.selected_slot_id = parsedSlot.slotId;
        context.slot_page = 1;
      }

      return {
        replyType: "TEXT",
        replyText: getFlowText(
          botFlowConfig,
          "booking_location_text_prompt",
          "Please enter your area/location. You can paste a Google Maps link or share lat,lng."
        ),
        newState: "BOOKING_LOCATION_WAITING_TEXT",
        context
      };
    }
    case "BOOKING_LOCATION_CHOICE": {
      // Legacy fallback: collapse old location choice into a simple text capture.
      if (input === "SHARE_CURRENT_LOCATION") {
        return {
          replyType: "TEXT",
          replyText: getFlowText(
            botFlowConfig,
            "booking_location_text_prompt",
            "Please enter your area/location."
          ),
          newState: "BOOKING_LOCATION_WAITING_TEXT",
          context
        };
      }
    }
      if (input === "SHARE_CUSTOM_LOCATION") {
        return {
          replyType: "TEXT",
          replyText: getFlowText(
            botFlowConfig,
            "booking_location_text_prompt",
            "Please enter your area/location."
          ),
          newState: "BOOKING_LOCATION_WAITING_TEXT",
          context
        };
      }

      if (input === "SKIP_LOCATION") {
        return {
          replyType: "TEXT",
          replyText: getFlowText(
            botFlowConfig,
            "booking_location_text_prompt",
            "Please enter your area/location."
          ),
          newState: "BOOKING_LOCATION_WAITING_TEXT",
          context
        };
      }

      return {
        replyType: "TEXT",
        replyText: getFlowText(
          botFlowConfig,
          "booking_location_text_prompt",
          "Please enter your area/location."
        ),
        newState: "BOOKING_LOCATION_WAITING_TEXT",
        context
      };

    case "BOOKING_LOCATION_WAITING_PIN":
      // Legacy fallback: accept a location pin but submit immediately.
      if (options?.inboundLocation?.latitude && options?.inboundLocation?.longitude) {
        context.location_source = "current_pin";
        context.location_lat = Number(options.inboundLocation.latitude);
        context.location_lng = Number(options.inboundLocation.longitude);
        context.location_name = options.inboundLocation.name || null;
        context.location_address = options.inboundLocation.address || null;
        context.area = context.area || options.inboundLocation.address || options.inboundLocation.name || "Location shared on WhatsApp";
        return {
          replyType: "CALL_QUICKBOOK",
          replyText: getFlowText(
            botFlowConfig,
            "booking_submitted_ack",
            "Your booking request has been received. Our team will contact you shortly."
          ),
          newState: "START",
          context
        };
      }

      return {
        replyType: "TEXT",
        replyText: getFlowText(
          botFlowConfig,
          "booking_location_text_prompt",
          "Please enter your area/location."
        ),
        newState: "BOOKING_LOCATION_WAITING_TEXT",
        context
      };

    case "BOOKING_LOCATION_WAITING_TEXT":
      if (rawInput) {
        const parsedLocation = parseLocationTextInput(rawInput);
        context.location_source = parsedLocation.source;
        context.location_text = parsedLocation.text;
        context.area = parsedLocation.areaText || context.area || null;
        if (parsedLocation.lat !== null && parsedLocation.lng !== null) {
          context.location_lat = parsedLocation.lat;
          context.location_lng = parsedLocation.lng;
        } else {
          context.location_lat = null;
          context.location_lng = null;
        }
      } else {
        context.location_source = "not_provided";
      }

      return {
        replyType: "CALL_QUICKBOOK",
        replyText: getFlowText(
          botFlowConfig,
          "booking_submitted_ack",
          "Your booking request has been received. Our team will contact you shortly."
        ),
        newState: "START",
        context
      };

    case "BOOKING_POST_CONFIRM_LOCATION_OFFER": {
      if (input === "BOOKING_SKIP_LOCATION") {
        return {
          replyType: "TEXT",
          replyText: getFlowText(
            botFlowConfig,
            "booking_optional_location_skipped",
            "No problem. Your booking is confirmed. Our team will coordinate shortly."
          ),
          newState: "START",
          context: {
            ...context,
            quickbook_awaiting_optional_location: false
          }
        };
      }

      if (input === "BOOKING_SHARE_CURRENT_LOCATION") {
        return {
          replyType: "TEXT",
          replyText: getFlowText(
            botFlowConfig,
            "booking_optional_location_current_prompt",
            "Please use WhatsApp attachment and share Current Location pin."
          ),
          newState: "BOOKING_POST_CONFIRM_LOCATION_WAITING",
          context: {
            ...context,
            quickbook_location_mode: "pin"
          }
        };
      }

      if (input === "BOOKING_SHARE_MAPS_LINK") {
        return {
          replyType: "TEXT",
          replyText: getFlowText(
            botFlowConfig,
            "booking_optional_location_link_prompt",
            "Please paste your Google Maps link or type your area/location."
          ),
          newState: "BOOKING_POST_CONFIRM_LOCATION_WAITING",
          context: {
            ...context,
            quickbook_location_mode: "text"
          }
        };
      }

      return {
        replyType: "MAIN_MENU",
        newState: "START",
        context: {
          ...context,
          quickbook_awaiting_optional_location: false
        }
      };
    }

    case "BOOKING_POST_CONFIRM_LOCATION_WAITING": {
      if (options?.inboundLocation?.latitude && options?.inboundLocation?.longitude) {
        return {
          replyType: "QUICKBOOK_LOCATION_UPDATE",
          replyText: getFlowText(
            botFlowConfig,
            "booking_optional_location_saved",
            "Thanks. We’ve saved your location for the visit team."
          ),
          newState: "START",
          context: {
            ...context,
            quickbook_awaiting_optional_location: false,
            location_source: "current_pin",
            location_lat: Number(options.inboundLocation.latitude),
            location_lng: Number(options.inboundLocation.longitude),
            location_name: options.inboundLocation.name || null,
            location_address: options.inboundLocation.address || null
          }
        };
      }

      if (rawInput) {
        const parsedLocation = parseLocationTextInput(rawInput);
        const looksUseful =
          parsedLocation.source !== "manual_text" ||
          String(parsedLocation.text || "").trim().length >= 4;

        if (!looksUseful) {
          return {
            replyType: "TEXT",
            replyText: getFlowText(
              botFlowConfig,
              "booking_optional_location_prompt",
              "Please share your current pin, Maps link, or area text."
            ),
            newState: "BOOKING_POST_CONFIRM_LOCATION_WAITING",
            context
          };
        }

        return {
          replyType: "QUICKBOOK_LOCATION_UPDATE",
          replyText: getFlowText(
            botFlowConfig,
            "booking_optional_location_saved",
            "Thanks. We’ve saved your location for the visit team."
          ),
          newState: "START",
          context: {
            ...context,
            quickbook_awaiting_optional_location: false,
            location_source: parsedLocation.source,
            location_text: parsedLocation.text,
            location_lat: parsedLocation.lat,
            location_lng: parsedLocation.lng,
            area: parsedLocation.areaText || context.area || null
          }
        };
      }

      return {
        replyType: "TEXT",
        replyText: getFlowText(
          botFlowConfig,
          "booking_optional_location_prompt",
          "Please share your current pin, Maps link, or area text."
        ),
        newState: "BOOKING_POST_CONFIRM_LOCATION_WAITING",
        context
      };
    }

    case "BOOKING_PRESCRIPTION_WAITING":
      // Legacy sessions can still land here; skip straight to submission.
      if (options?.inboundMedia?.url) {
        context.prescription = options.inboundMedia.url;
      }

      return {
        replyType: "CALL_QUICKBOOK",
        replyText: getFlowText(
          botFlowConfig,
          "booking_submitted_ack",
          "Your booking request has been received. Our team will contact you shortly."
        ),
        newState: "START",
        context
      };

    case "BOOKING_TEST_DETAILS":
      // Legacy sessions can still land here; store optional user text and submit.
      if (rawInput) {
        context.tests = userInput;
      }
      return {
        replyType: "CALL_QUICKBOOK",
        replyText: getFlowText(
          botFlowConfig,
          "booking_submitted_ack",
          "Your booking request has been received. Our team will contact you shortly."
        ),
        newState: "START",
        context
      };

    // ===================================================
    // MORE SERVICES
    // ===================================================
    case "MORE_SERVICES":
      {
        const moreServicesResult = handleMoreServicesInput({
          input,
          context,
          phone,
          botFlowConfig
        });

        if (moreServicesResult) {
          return moreServicesResult;
        }
      }

      return {
        replyType: "MORE_SERVICES_MENU",
        newState: "MORE_SERVICES",
        context
      };

    // ===================================================
    // LOCATION OPTIONS
    // ===================================================
    case "LOCATION_OPTIONS":
      {
        const moreServicesResult = handleMoreServicesInput({
          input,
          context,
          phone,
          botFlowConfig
        });

        if (moreServicesResult) {
          return moreServicesResult;
        }
      }

      if (input === "SHARE_LOCATION_PIN") {
        return {
          replyType: "SEND_LOCATION",
          newState: "MORE_SERVICES",
          context
        };
      }

      if (input === "SHARE_ADDRESS") {
        return {
          replyType: "LAB_ADDRESS_TEXT",
          newState: "MORE_SERVICES",
          context
        };
      }

      if (input === "SHARE_TIMINGS") {
        return {
          replyType: "LAB_TIMINGS_TEXT",
          newState: "MORE_SERVICES",
          context
        };
      }

      if (input === "SHARE_BOTH") {
        return {
          replyType: "SEND_LOCATION_AND_ADDRESS",
          newState: "MORE_SERVICES",
          context
        };
      }

      if (input === "SHARE_BRANCH_LOCATIONS") {
        return {
          replyType: "LOCATION_BRANCHES_MENU",
          newState: "LOCATION_BRANCHES",
          context
        };
      }

      return {
        replyType: "LOCATION_OPTIONS_MENU",
        newState: "LOCATION_OPTIONS",
        context
      };

    case "LOCATION_BRANCHES":
      {
        const moreServicesResult = handleMoreServicesInput({
          input,
          context,
          phone,
          botFlowConfig
        });

        if (moreServicesResult) {
          return moreServicesResult;
        }
      }

      if (input.startsWith("BRANCH_")) {
        return {
          replyType: "BRANCH_LOCATION_LINK",
          branchId: input,
          newState: "MORE_SERVICES",
          context
        };
      }

      return {
        replyType: "LOCATION_BRANCHES_MENU",
        newState: "LOCATION_BRANCHES",
        context
      };

    // ===================================================
    // PACKAGE FLOW
    // ===================================================
    case "PACKAGE_MENU": {
      if (input.startsWith("PKG_PAGE_")) {
        const pageNo = Number(input.replace("PKG_PAGE_", "").trim());
        context.package_page = Number.isFinite(pageNo) && pageNo > 0 ? pageNo : 1;
        return {
          replyType: "PACKAGE_MENU",
          newState: "PACKAGE_MENU",
          context
        };
      }

      if (input.startsWith("PKG_")) {
        const idx = Number(input.replace("PKG_", "").trim());
        if (!Number.isFinite(idx) || idx < 0) {
          return {
            replyType: "PACKAGE_MENU",
            newState: "PACKAGE_MENU",
            context
          };
        }

        context.selected_package_index = idx;
        const catalog = options.packageCatalog || [];
        const selectedPackage = catalog.find((pkg) => pkg.packageIndex === idx);
        const variantsCount = Array.isArray(selectedPackage?.variants)
          ? selectedPackage.variants.length
          : 0;

        if (variantsCount <= 1) {
          context.selected_variant_index = 0;
          context.last_explored_package_index = idx;
          context.last_explored_variant_index = 0;
          return {
            replyType: "PACKAGE_DETAILS_TEXT",
            newState: "START",
            context
          };
        }

        return {
          replyType: "PACKAGE_VARIANT_MENU",
          newState: "PACKAGE_VARIANT_MENU",
          context
        };
      }

      return {
        replyType: "PACKAGE_MENU",
        newState: "PACKAGE_MENU",
        context
      };
    }
    case "PACKAGE_VARIANT_MENU": {
      if (input === "PKG_BACK_LIST") {
        return {
          replyType: "PACKAGE_MENU",
          newState: "PACKAGE_MENU",
          context
        };
      }

      if (input.startsWith("PKGV_")) {
        const parts = input.replace("PKGV_", "").split("_");
        const packageIdx = Number(parts[0]);
        const variantIdx = Number(parts[1]);
        if (!Number.isFinite(packageIdx) || !Number.isFinite(variantIdx)) {
          return {
            replyType: "PACKAGE_VARIANT_MENU",
            newState: "PACKAGE_VARIANT_MENU",
            context
          };
        }

        context.selected_package_index = packageIdx;
        context.selected_variant_index = variantIdx;
        context.last_explored_package_index = packageIdx;
        context.last_explored_variant_index = variantIdx;

        return {
          replyType: "PACKAGE_DETAILS_TEXT",
          newState: "START",
          context
        };
      }

      return {
        replyType: "PACKAGE_VARIANT_MENU",
        newState: "PACKAGE_VARIANT_MENU",
        context
      };

    }
    
    // ===================================================
    // CALLBACK FLOW
    // ===================================================
    case "HANDOFF_CALLBACK_WAITING":
      if (["YES", "Y", "CALL", "CALLBACK", "REQUEST_CALLBACK"].includes(input)) {
        return {
          replyType: "INTERNAL_NOTIFY",
          notifyText: `📞 Callback Request\nPhone: ${phone}\nSource: WhatsApp`,
          replyText: getFlowText(
            botFlowConfig,
            "handoff_callback_saved_text",
            "Thank you. Our team will call you on the next working day."
          ),
          newState: "START",
          context: {}
        };
      }

      if (["NO", "N", "MAIN_MENU"].includes(input)) {
        return {
          replyType: "MAIN_MENU",
          newState: "START",
          context: {}
        };
      }

      return {
        replyType: "TEXT",
        replyText: getFlowText(
          botFlowConfig,
          "handoff_callback_prompt",
          "Reply YES to request a callback, or MAIN_MENU to return."
        ),
        newState: "HANDOFF_CALLBACK_WAITING",
        context
      };


    // ===================================================
    // FEEDBACK FLOW
    // ===================================================
    case "FEEDBACK_WAITING":

      return {
        replyType: "INTERNAL_NOTIFY",
        notifyText: `⭐ New Feedback\nPhone: ${phone}\nFeedback: ${userInput}`,
        replyText:
          getFlowText(
            botFlowConfig,
            "feedback_ack",
            "Thank you for your feedback! We truly appreciate it."
          ),
        newState: "START",
        context: {}
      };


    // ===================================================
    // HUMAN HANDOVER
    // ===================================================
    case "HUMAN_HANDOVER":
      return {
        replyType: "TEXT",
        replyText:
          getFlowText(
            botFlowConfig,
            "handoff_waiting_text",
            "Our executive will respond shortly. Thank you for your patience."
          ),
        newState: "HUMAN_HANDOVER",
        context
      };


    // ===================================================
    // DEFAULT FALLBACK
    // ===================================================
    default:
      return {
        replyType: "MAIN_MENU",
        newState: "START",
        context: {}
      };
  }
}
