"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useSearchParams } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import ShortcutBar from "@/components/ShortcutBar";

const APP_LOGO = process.env.NEXT_PUBLIC_LABBIT_LOGO || "/logo.png";
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Labit";
const IST_TIMEZONE = "Asia/Kolkata";
const HEADER_WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
  process.env.NEXT_PUBLIC_BUSINESS_WHATSAPP_NUMBER ||
  "";
const WHATSAPP_THEME_STORAGE_KEY = "labbit-whatsapp-theme";
const REPORT_TEMPLATE_TEXT =
  "Dear {{1}}, please find attached your {{2}} reports for the test/s done at SDRC.\n\nPlease reply with *Hi* for any queries, appointment booking, trend reports or other information. Our Whatsapp Bot will be available to help you.";

const DEFAULT_CHAT_SETTINGS = {
  shortcuts: [
    {
      key: "/r",
      label: "Report reply",
      type: "template",
      message:
        "Please find your report attached. If you need any clarification, reply here and our team will help you."
    },
    { key: "/hv", label: "Home visit bot flow", type: "handover", flow: "home_visit" },
    { key: "/menu", label: "Main menu bot flow", type: "handover", flow: "main_menu" },
    { key: "/reports", label: "Report bot flow", type: "handover", flow: "reports" }
  ]
};
const RESOLVE_REASON_OPTIONS = [
  { value: "query_resolved", label: "Query resolved" },
  { value: "report_shared", label: "Report shared with patient" },
  { value: "followup_completed", label: "Follow-up completed" },
  { value: "duplicate_chat", label: "Duplicate chat" },
  { value: "no_response", label: "No response from patient" },
  { value: "other", label: "Other" }
];

function parseServerDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "string") return new Date(value);

  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(value);
  const normalized = hasTimezone ? value : `${value.replace(" ", "T")}Z`;
  return new Date(normalized);
}

function formatDateTime(value) {
  if (!value) return "";
  const parsed = parseServerDate(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return "";

  return parsed.toLocaleString([], {
    timeZone: IST_TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatMessageTime(value) {
  if (!value) return "";
  const parsed = parseServerDate(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return "";

  return parsed.toLocaleString([], {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

function istTodayYmd() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

function isWithin24(session, lastInboundAtOverride = null) {
  const sourceTs =
    lastInboundAtOverride ||
    session?.last_user_message_at ||
    session?.last_message_at ||
    null;
  if (!sourceTs) return false;
  const parsed = parseServerDate(sourceTs);
  if (!parsed || Number.isNaN(parsed.getTime())) return false;
  const diff = Date.now() - parsed.getTime();
  return diff < 24 * 60 * 60 * 1000;
}

function isPendingSession(session) {
  const status = String(session?.status || "").toLowerCase();
  return status === "pending" || status === "handoff" || status === "human_handover";
}

function hasAgentIntervention(session) {
  const status = String(session?.status || "").toLowerCase();
  if (["pending", "handoff", "human_handover", "resolved", "closed"].includes(status)) return true;
  return Boolean(session?.context?.ever_agent_intervened);
}

function getSessionSignals(session) {
  const status = String(session?.status || "").toLowerCase();
  const items = [];
  if ((session?.unread_count || 0) > 0) {
    items.push({
      key: "unread",
      label: `${session.unread_count} unread`,
      className: "is-unread"
    });
  }
  if (isPendingSession(session)) {
    items.push({
      key: "pending",
      label: "Pending",
      className: "is-pending"
    });
  }
  if (status === "resolved") {
    items.push({
      key: "resolved",
      label: "Resolved",
      className: "is-resolved"
    });
  }
  if (status === "closed") {
    items.push({
      key: "closed",
      label: "Closed",
      className: "is-closed"
    });
  }
  if (status === "active" && items.length === 0) {
    items.push({
      key: "active",
      label: "Active",
      className: "is-active"
    });
  }
  if (!isWithin24(session)) {
    items.push({
      key: "expired",
      label: "24h expired",
      className: "is-expired"
    });
  }
  return items;
}

function getSenderLabel(msg, currentUserId, patientName = "") {
  if (msg.direction === "status") {
    const sender = msg?.payload?.sender;
    return sender?.name ? `Internal Note (${sender.name})` : "Internal Note";
  }

  if (msg.direction !== "outbound") {
    const name = String(patientName || "").trim();
    return name || "User";
  }

  const sender = msg?.payload?.sender;
  if (sender?.name) {
    const isMe = currentUserId && sender.id === currentUserId;
    return isMe ? `You (${sender.name})` : `Agent (${sender.name})`;
  }

  return "Bot";
}

function isSimulatedMessage(msg, sessionContext = null) {
  if (msg?.payload?.simulated) return true;
  if (msg?.payload?.sender?.simulated) return true;

  const isOutbound = msg?.direction === "outbound" || msg?.direction === "status";
  const sender = msg?.payload?.sender;
  const isBotOutbound = isOutbound && !sender?.id && !sender?.name;
  if (isBotOutbound && sessionContext?.__simulation) return true;

  return false;
}

function extractStatusProviderMessageId(msg) {
  return (
    String(
      msg?.payload?.provider_message_id ||
      msg?.payload?.message_id ||
      msg?.message_id ||
      ""
    ).trim() || null
  );
}

function extractOutboundProviderMessageId(msg) {
  const response = msg?.payload?.response || {};
  return (
    String(
      response?.id ||
      response?.message_id ||
      response?.messages?.[0]?.id ||
      response?.result?.id ||
      msg?.message_id ||
      ""
    ).trim() || null
  );
}

function deliveryStatusRank(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "failed") return 0;
  if (normalized === "sent") return 1;
  if (normalized === "delivered") return 2;
  if (normalized === "read") return 3;
  return -1;
}

function getInitial(text) {
  return (text || "?").trim().charAt(0).toUpperCase() || "?";
}

function getContactActionMeta(session) {
  const isPatient = String(session?.contact_type || "").toLowerCase() === "patient";
  return {
    isPatient,
    label: isPatient ? "Update contact" : "Add contact",
    className: isPatient ? "is-saved" : "is-add"
  };
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function canonicalPhone(value) {
  const digits = digitsOnly(value);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function canonicalIndiaPhone(value) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length > 12) return `91${digits.slice(-10)}`;
  return digits;
}

function formatWhatsappNumberDisplay(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = digitsOnly(raw);
  if (!digits) return raw;
  return raw.startsWith("+") ? `+${digits}` : `+${digits}`;
}

function decodeMessageEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "");
}

function toPlainComposerText(value) {
  return decodeMessageEntities(String(value || ""))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .trimStart();
}

function extractBusinessNumberFromPayload(payload) {
  const candidates = [
    payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number,
    payload?.raw_body?.value?.metadata?.display_phone_number,
    payload?.raw_body?.metadata?.display_phone_number,
    payload?.raw_message?.metadata?.display_phone_number
  ];
  return candidates.find((value) => typeof value === "string" && value.trim()) || null;
}

function humanizeMachineToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function looksLikeMachineToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/\s/.test(raw)) return false;
  return /^[A-Za-z0-9_-]{3,}$/.test(raw);
}

function extractTemplateTextParams(template = {}) {
  const components = Array.isArray(template?.components) ? template.components : [];
  const bodyComponent = components.find((item) => String(item?.type || "").toLowerCase() === "body");
  const parameters = Array.isArray(bodyComponent?.parameters) ? bodyComponent.parameters : [];
  return parameters
    .map((param) => {
      if (!param || typeof param !== "object") return null;
      if (String(param.type || "").toLowerCase() === "text") return String(param.text || "").trim();
      if (typeof param.text === "string") return String(param.text || "").trim();
      return null;
    })
    .filter(Boolean);
}

function inferReqnoFromFilename(name) {
  const text = String(name || "").trim();
  if (!text) return "";
  const m = text.match(/SDRC_Report_(\d{8,})_/i) || text.match(/(\d{8,})/);
  return m?.[1] || "";
}

function getDisplayMessageText(msg, botLabelMap) {
  if (!msg) return "";

  const sender = msg?.payload?.sender;
  const isBotOutbound = msg.direction === "outbound" && !sender?.id && !sender?.name;
  const rawMessage = msg.message || "";

  if (msg.direction === "inbound") {
    const inboundInteractive =
      msg?.payload?.raw_message?.interactive ||
      msg?.payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.interactive ||
      null;

    const listReplyTitle = inboundInteractive?.list_reply?.title;
    const buttonReplyTitle = inboundInteractive?.button_reply?.title;
    if (listReplyTitle || buttonReplyTitle) {
      return decodeMessageEntities(listReplyTitle || buttonReplyTitle);
    }

    if (rawMessage === "__MEDIA__") {
      const mediaType = msg?.payload?.media?.type;
      if (mediaType === "image") return "Shared image";
      if (mediaType === "document") return "Shared document";
      return "Shared attachment";
    }

    if (rawMessage.startsWith("SLOT_PAGE_")) {
      const pageNo = rawMessage.replace("SLOT_PAGE_", "").trim();
      return decodeMessageEntities(`Viewed more time slots${pageNo ? ` (page ${pageNo})` : ""}`);
    }

    if (rawMessage.startsWith("DATE_")) {
      const iso = rawMessage.replace("DATE_", "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        const [year, month, day] = iso.split("-");
        return decodeMessageEntities(`Selected date: ${day}-${month}-${year}`);
      }
    }

    if (rawMessage.startsWith("SLOT_")) {
      const slotId = rawMessage.replace("SLOT_", "").trim();
      const slotMap = msg?.sessionContext?.available_slots || {};
      const slotName = slotMap?.[slotId];
      return decodeMessageEntities(slotName ? `Selected time slot: ${slotName}` : "Selected slot");
    }

    const slotMap = msg?.sessionContext?.available_slots || {};
    if (slotMap?.[rawMessage]) {
      return decodeMessageEntities(`Selected time slot: ${slotMap[rawMessage]}`);
    }
    return decodeMessageEntities(rawMessage);
  }

  if (!isBotOutbound) return decodeMessageEntities(rawMessage);

  const requestPayload = msg?.payload?.request;
  if (requestPayload && typeof requestPayload === "object") {
    if (requestPayload.type === "text" && requestPayload.text?.body) {
      return decodeMessageEntities(requestPayload.text.body);
    }

    if (requestPayload.type === "document" && requestPayload.document) {
      const caption = String(requestPayload.document.caption || "").trim();
      const filename = String(requestPayload.document.filename || "").trim();
      if (caption) return decodeMessageEntities(caption);
      if (filename) return decodeMessageEntities(`Document sent: ${filename}`);
      return "Document sent";
    }

    if (requestPayload.type === "template") {
      const templateName =
        requestPayload?.template?.name ||
        requestPayload?.template_name ||
        rawMessage;
      const templateParams = extractTemplateTextParams(requestPayload?.template || {});
      const normalizedTemplateName = String(templateName || "").trim().toLowerCase();
      if (normalizedTemplateName === "reports_pdf") {
        const patient = String(templateParams?.[0] || "").trim();
        const reportKind = String(templateParams?.[1] || "Report").trim() || "Report";
        const headerDoc = requestPayload?.template?.components?.find?.((c) => String(c?.type || "").toLowerCase() === "header");
        const docParam = Array.isArray(headerDoc?.parameters)
          ? headerDoc.parameters.find((p) => String(p?.type || "").toLowerCase() === "document")
          : null;
        const filename =
          String(docParam?.document?.filename || "").trim() ||
          String(requestPayload?.document?.filename || "").trim();
        const reqno = inferReqnoFromFilename(filename);
        const recipient = String(requestPayload?.to || msg?.phone || "").replace(/\D/g, "").slice(-10);
        const lines = ["Report template sent"];
        if (patient) lines.push(`Patient: ${patient}`);
        if (reportKind) lines.push(`Status sent: ${reportKind}`);
        if (reqno) lines.push(`Req No: ${reqno}`);
        if (recipient) lines.push(`Phone: ${recipient}`);
        return decodeMessageEntities(lines.join("\n"));
      }
      const pretty = humanizeMachineToken(templateName);
      if (templateParams.length > 0) {
        const paramText = templateParams.map((item) => `- ${item}`).join("\n");
        return decodeMessageEntities(`${pretty || "Template message sent"}\n${paramText}`);
      }
      return decodeMessageEntities(pretty || "Template message sent");
    }

    if (requestPayload.type === "interactive" && requestPayload.interactive) {
      const interactive = requestPayload.interactive;
      const baseText = interactive?.body?.text || "";

      if (interactive.type === "button") {
        const options = (interactive?.action?.buttons || [])
          .map((b) => b?.reply?.title)
          .filter(Boolean);
        if (options.length > 0) {
          return decodeMessageEntities(`${baseText}\n\nOptions:\n${options.map((o) => `- ${o}`).join("\n")}`.trim());
        }
        return decodeMessageEntities(baseText || msg.message);
      }

      if (interactive.type === "list") {
        const rows = (interactive?.action?.sections || [])
          .flatMap((section) => section?.rows || [])
          .map((row) => row?.title)
          .filter(Boolean);
        if (rows.length > 0) {
          return decodeMessageEntities(`${baseText}\n\nOptions:\n${rows.map((r) => `- ${r}`).join("\n")}`.trim());
        }
        return decodeMessageEntities(baseText || msg.message);
      }
    }

    if (requestPayload.type === "location" && requestPayload.location) {
      const loc = requestPayload.location;
      const parts = [loc.name, loc.address].filter(Boolean);
      return decodeMessageEntities(parts.length ? `Shared location:\n${parts.join("\n")}` : "Shared location");
    }
  }

  const mapped = botLabelMap?.[rawMessage];
  if (mapped) return decodeMessageEntities(mapped);
  if (looksLikeMachineToken(rawMessage)) {
    return decodeMessageEntities(humanizeMachineToken(rawMessage));
  }
  return decodeMessageEntities(rawMessage);
}

function shouldUpdateSelectedSession(currentSession, nextSession) {
  if (!currentSession && !nextSession) return false;
  if (!currentSession || !nextSession) return true;

  return [
    "id",
    "phone",
    "patient_name",
    "status",
    "unread_count",
    "last_message_at",
    "contact_type",
    "matched_patient_count"
  ].some((key) => String(currentSession?.[key] ?? "") !== String(nextSession?.[key] ?? ""));
}

function getMessageMedia(msg) {
  const media = msg?.payload?.media;
  const templateComponents = Array.isArray(msg?.payload?.request?.template?.components)
    ? msg.payload.request.template.components
    : [];
  const headerComponent = templateComponents.find(
    (component) => String(component?.type || "").toLowerCase() === "header"
  );
  const headerParameters = Array.isArray(headerComponent?.parameters) ? headerComponent.parameters : [];
  const headerDocumentParameter = headerParameters.find(
    (param) => String(param?.type || "").toLowerCase() === "document"
  );
  const templateHeaderDocumentLink =
    headerDocumentParameter?.document?.link ||
    headerDocumentParameter?.document?.url ||
    null;
  const templateHeaderDocumentName =
    headerDocumentParameter?.document?.filename ||
    null;
  const canonicalFilename =
    String(msg?.payload?.request?.document?.filename || "").trim() ||
    String(templateHeaderDocumentName || "").trim() ||
    String(media?.filename || "").trim() ||
    String(msg?.payload?.raw_message?.document?.filename || "").trim() ||
    String(msg?.payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.document?.filename || "").trim() ||
    null;
  const fallbackUrl =
    media?.url ||
    media?.link ||
    msg?.payload?.raw_message?.image?.link ||
    msg?.payload?.raw_message?.image?.url ||
    msg?.payload?.raw_message?.image?.image_url ||
    msg?.payload?.raw_message?.document?.link ||
    msg?.payload?.raw_message?.document?.url ||
    msg?.payload?.raw_message?.document?.document_url ||
    templateHeaderDocumentLink ||
    msg?.payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.image?.link ||
    msg?.payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.image?.url ||
    msg?.payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.document?.link ||
    msg?.payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.document?.url;

  if (fallbackUrl) {
    return {
      type: media?.type || "file",
      url: fallbackUrl,
      filename: canonicalFilename
    };
  }

  const doc = msg?.payload?.request?.document;
  if (doc?.link) {
    return {
      type: "document",
      url: doc.link,
      filename: canonicalFilename || doc.filename || null
    };
  }
// InstaAlerts media extractor
let filedata = null;
let rawMsg = null;

try {
  rawMsg =
    msg?.payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  filedata =
    rawMsg?.image?.id ||
    rawMsg?.document?.id ||
    msg?.payload?.media?.id ||
    msg?.payload?.raw_message?.image?.id ||
    msg?.payload?.raw_message?.document?.id;
} catch (e) {}

if (filedata) {
  const fileType = rawMsg?.document?.id ? "document" : "image";
  const fallbackName = canonicalFilename;
  const query = new URLSearchParams({
    filedata: String(filedata),
    kind: fileType
  });
  if (fallbackName) query.set("filename", fallbackName);
  return {
    type: fileType,
    url: `/api/admin/whatsapp/media?${query.toString()}`,
    filename: fallbackName
  };
}
  return null;
}

function getInboundLocationPin(msg) {
  if (!msg || msg.direction !== "inbound") return null;
  if (String(msg.message || "").trim() !== "__LOCATION_PIN__") return null;

  const rawLocation =
    msg?.payload?.raw_message?.location ||
    msg?.payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.location ||
    msg?.payload?.raw_body?.value?.messages?.[0]?.location ||
    null;

  const lat = Number(rawLocation?.latitude);
  const lng = Number(rawLocation?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const name = String(rawLocation?.name || "").trim() || null;
  const address = String(rawLocation?.address || "").trim() || null;
  const mapsLink = `https://maps.google.com/?q=${lat},${lng}`;
  const label = [name, address].filter(Boolean).join("\n");
  const copyText = [
    "Location Pin Shared",
    label ? `Label: ${label}` : null,
    `Coordinates: ${lat},${lng}`,
    `Google Maps: ${mapsLink}`
  ]
    .filter(Boolean)
    .join("\n");

  return {
    lat,
    lng,
    name,
    address,
    mapsLink,
    copyText
  };
}

function buildVisitLocationAddress(pin) {
  if (!pin) return "";
  const label = [pin.name, pin.address].filter(Boolean).join(" - ");
  return [
    "Location Pin Shared",
    label || null,
    `Coordinates: ${pin.lat},${pin.lng}`,
    `Google Maps: ${pin.mapsLink}`
  ]
    .filter(Boolean)
    .join("\n");
}

function toSortableVisitDate(visit) {
  const value = String(visit?.visit_date || "").trim();
  if (!value) return 0;
  const parsed = new Date(`${value}T00:00:00`);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : 0;
}

function isAttachableVisitStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return !["disabled", "cancelled", "canceled", "completed"].includes(normalized);
}

async function fetchJsonWithRetry(url, options = {}, retries = 1) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const text = await response.text();
        if (response.status === 401 || response.status === 403) {
          if (typeof window !== "undefined") {
            const next = `${window.location.pathname}${window.location.search || ""}`;
            const loginUrl = `/login?next=${encodeURIComponent(next)}`;
            window.location.replace(loginUrl);
          }
          const authError = new Error(`Session expired (${response.status})`);
          authError.status = response.status;
          authError.url = url;
          throw authError;
        }
        const detail = String(text || "").slice(0, 500);
        const error = new Error(
          `Request failed (${response.status}) ${url}${detail ? ` :: ${detail}` : ""}`
        );
        error.status = response.status;
        error.url = url;
        throw error;
      }
      return await response.json();
    } catch (err) {
      lastError = err;
      if (attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError || new Error("Request failed");
}

function normalizeChatSettings(raw) {
  const shortcuts = Array.isArray(raw?.shortcuts) ? raw.shortcuts : DEFAULT_CHAT_SETTINGS.shortcuts;
  return {
    shortcuts: shortcuts
      .map((item) => ({
        key: String(item?.key || "").trim().toLowerCase(),
        label: String(item?.label || "").trim(),
        type: String(item?.type || "").trim().toLowerCase(),
        message: String(item?.message || "").trim(),
        flow: String(item?.flow || "").trim().toLowerCase()
      }))
      .filter((item) => item.key.startsWith("/") && (item.type === "template" || item.type === "handover"))
  };
}

function buildShortcutHelp(settings) {
  const parts = (settings?.shortcuts || [])
    .slice(0, 6)
    .map((item) => `${item.key} ${item.label || item.type}`);
  return parts.join(", ");
}

function parseShortcutCommand(text, settings) {
  const value = String(text || "").trim();
  if (!value.startsWith("/") && !value.startsWith("\\")) return null;

  const [rawCmd, ...rest] = value.split(/\s+/);
  const command = rawCmd.replace(/^\\/, "/").toLowerCase();
  const notes = rest.join(" ").trim();
  const shortcut = (settings?.shortcuts || []).find((item) => item.key === command);
  if (shortcut?.type === "template") {
    return { type: "template", command, message: shortcut.message || "", notes };
  }
  if (shortcut?.type === "handover") {
    return { type: "handover", command, flow: shortcut.flow || "main_menu", notes };
  }
  return { type: "unknown", command };
}

function buildSessionsSignature(list = []) {
  return (Array.isArray(list) ? list : [])
    .map((session) => [
      session?.id || "",
      session?.phone || "",
      session?.status || "",
      session?.last_message_at || "",
      session?.last_user_message_at || "",
      Number(session?.unread_count || 0)
    ].join("|"))
    .join("||");
}

export default function WhatsAppDashboard() {
  const { user, isLoading: isUserLoading } = useUser();
  const searchParams = useSearchParams();

  const [sessions, setSessions] = useState([]);
  const [serverTabCounts, setServerTabCounts] = useState({ unread: 0, unresolved: 0, resolved: 0 });
  const [hasMoreSessions, setHasMoreSessions] = useState(false);
  const [olderSessionsOffset, setOlderSessionsOffset] = useState(0);
  const [messages, setMessages] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [labMeta, setLabMeta] = useState(null);
  const [botLabelMap, setBotLabelMap] = useState({});
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [senderFilter, setSenderFilter] = useState("all");
  const [conversationOwnerFilter, setConversationOwnerFilter] = useState("all");
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingOlderSessions, setIsLoadingOlderSessions] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [oldestCursor, setOldestCursor] = useState(null);
  const [historyWindowDays, setHistoryWindowDays] = useState(2);
  const [latestCursor, setLatestCursor] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [isSendingAttachment, setIsSendingAttachment] = useState(false);
  const [isSendingReportTool, setIsSendingReportTool] = useState(false);
  const [isSendingReportTemplate, setIsSendingReportTemplate] = useState(false);
  const [attachingLocationMessageId, setAttachingLocationMessageId] = useState(null);
  const [showBotFlowMenu, setShowBotFlowMenu] = useState(false);
  const [showResolveMenu, setShowResolveMenu] = useState(false);
  const [resolveReason, setResolveReason] = useState("");
  const [resolveDetail, setResolveDetail] = useState("");
  const [openInfoSessionId, setOpenInfoSessionId] = useState(null);
  const [error, setError] = useState("");
  const [messageError, setMessageError] = useState("");
  const [hint, setHint] = useState("");
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [agentPresence, setAgentPresence] = useState([]);
  const [sessionLock, setSessionLock] = useState(null);
  const [chatSettings, setChatSettings] = useState(DEFAULT_CHAT_SETTINGS);
  const [composerText, setComposerText] = useState("");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobilePanel, setMobilePanel] = useState("list");
  const [showSidebarMeta, setShowSidebarMeta] = useState(false);
  const [showSearchBox, setShowSearchBox] = useState(false);
  const [pendingTaskAction, setPendingTaskAction] = useState("followup");
  const [themeMode, setThemeMode] = useState("dark");
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [showReportTemplateModal, setShowReportTemplateModal] = useState(false);
  const [reportTemplatePhone, setReportTemplatePhone] = useState("");
  const [reportTemplatePatientName, setReportTemplatePatientName] = useState("");
  const [reportTemplateLabel, setReportTemplateLabel] = useState("");
  const [reportTemplateSource, setReportTemplateSource] = useState("latest_report");
  const [reportTemplateRegisteredPhone, setReportTemplateRegisteredPhone] = useState("");
  const [reportTemplateReqno, setReportTemplateReqno] = useState("");
  const [reportTemplateMrno, setReportTemplateMrno] = useState("");
  const [reportAuthConfirmed, setReportAuthConfirmed] = useState(false);
  const [reportAuthType, setReportAuthType] = useState("");
  const [reportAuthEvidence, setReportAuthEvidence] = useState("");
  const [isLookingUpRegisteredPhone, setIsLookingUpRegisteredPhone] = useState(false);
  const [registeredLookupResolvedPhone, setRegisteredLookupResolvedPhone] = useState("");
  const [registeredLookupSummary, setRegisteredLookupSummary] = useState("");
  const [reportModalError, setReportModalError] = useState("");
  const [showSentReportsModal, setShowSentReportsModal] = useState(false);
  const [sentReportsDate, setSentReportsDate] = useState(istTodayYmd());
  const [sentReportsRows, setSentReportsRows] = useState([]);
  const [isLoadingSentReports, setIsLoadingSentReports] = useState(false);
  const [sentReportsError, setSentReportsError] = useState("");
  const webhookWhatsappNumber = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const number = extractBusinessNumberFromPayload(messages[i]?.payload);
      if (number) return number;
    }
    return null;
  }, [messages]);
  const displayWhatsappNumber = formatWhatsappNumberDisplay(
    webhookWhatsappNumber || labMeta?.whatsapp_number || HEADER_WHATSAPP_NUMBER
  );

  const messageEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isPrependingRef = useRef(false);
  const attachInputRef = useRef(null);
  const botMenuWrapRef = useRef(null);
  const resolveMenuRef = useRef(null);
  const initialBottomReadyRef = useRef(false);
  const autoRefreshInFlightRef = useRef(false);
  const selectedSessionRef = useRef(null);
  const messagesRef = useRef([]);
  const sessionsRef = useRef([]);
  const sessionsSignatureRef = useRef("");
  const hasBootstrappedSessionsRef = useRef(false);
  const previousUnreadBySessionRef = useRef(new Map());
  const typingHeartbeatRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);

  const scrollSelectedConversationIntoView = () => {
    if (typeof document === "undefined") return;
    requestAnimationFrame(() => {
      const activeRow = document.querySelector(".wa-conversation.is-active");
      if (activeRow && typeof activeRow.scrollIntoView === "function") {
        activeRow.scrollIntoView({ block: "nearest" });
      }
    });
  };

  const isExecutiveAttentionAutoReply = (msg) => {
    const text = String(msg?.message || "").toLowerCase();
    return text.includes("please wait, our executive will reach out");
  };

  const isBotOutboundMessage = (msg) =>
    msg?.direction === "outbound" &&
    !msg?.payload?.sender?.id &&
    !msg?.payload?.sender?.name &&
    !isExecutiveAttentionAutoReply(msg);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission || "default");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined" || !("Notification" in window)) {
      return undefined;
    }

    const syncPermission = () => {
      setNotificationPermission(Notification.permission || "default");
    };

    syncPermission();
    window.addEventListener("focus", syncPermission);
    document.addEventListener("visibilitychange", syncPermission);

    return () => {
      window.removeEventListener("focus", syncPermission);
      document.removeEventListener("visibilitychange", syncPermission);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;

    const syncVisibility = () => {
      setIsPageVisible(!document.hidden);
    };

    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("focus", syncVisibility);
    window.addEventListener("blur", syncVisibility);

    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("focus", syncVisibility);
      window.removeEventListener("blur", syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const shouldWarnLeave = Boolean(selectedSession?.id) || Boolean(toPlainComposerText(composerText).trim());

    const onPopState = () => {
      if (isMobileViewport && mobilePanel === "chat") {
        setMobilePanel("list");
        const nextState = { ...(window.history.state || {}), waMobilePanel: "list" };
        window.history.pushState(nextState, "", window.location.href);
        return;
      }

      if (shouldWarnLeave) {
        const allowLeave = window.confirm("Leave WhatsApp Inbox? Unsent work may be lost.");
        if (!allowLeave) {
          window.history.pushState({ ...(window.history.state || {}), waStayOnInbox: true }, "", window.location.href);
        }
      }
    };

    if (isMobileViewport) {
      const baseState = { ...(window.history.state || {}), waMobilePanel: mobilePanel };
      window.history.replaceState(baseState, "", window.location.href);
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isMobileViewport, mobilePanel, selectedSession?.id, composerText]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const shouldWarnLeave = Boolean(selectedSession?.id) || Boolean(toPlainComposerText(composerText).trim());
    if (!shouldWarnLeave) return undefined;

    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [selectedSession?.id, composerText]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(WHATSAPP_THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      setThemeMode(saved);
      return;
    }
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    setThemeMode(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WHATSAPP_THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const media = window.matchMedia("(max-width: 900px)");
    const syncViewport = () => {
      const mobile = media.matches;
      setIsMobileViewport(mobile);
      if (!mobile) {
        setMobilePanel("chat");
      } else if (!selectedSession) {
        setMobilePanel("list");
      }
    };

    syncViewport();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", syncViewport);
      return () => media.removeEventListener("change", syncViewport);
    }

    media.addListener(syncViewport);
    return () => media.removeListener(syncViewport);
  }, [selectedSession]);

  useEffect(() => {
    if (isUserLoading || !user) return;
    fetchSessions();
    fetchAgentPresence();
    fetchChatSettings();
  }, [isUserLoading, user]);

  useEffect(() => {
    if (isPrependingRef.current) {
      isPrependingRef.current = false;
      return;
    }
    if (!selectedSession || messages.length === 0) return;
    if (!shouldStickToBottomRef.current && initialBottomReadyRef.current) return;
    scrollToBottom();
  }, [messages, selectedSession]);

  useEffect(() => {
    setOpenInfoSessionId(null);
    setShowBotFlowMenu(false);
    setShowResolveMenu(false);
    setResolveReason("");
    setResolveDetail("");
  }, [selectedSession?.id]);

  useEffect(() => {
    if (!showBotFlowMenu) return undefined;
    if (typeof window === "undefined") return undefined;

    const handleOutsideClick = (event) => {
      if (!botMenuWrapRef.current) return;
      if (!botMenuWrapRef.current.contains(event.target)) {
        setShowBotFlowMenu(false);
      }
    };

    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [showBotFlowMenu]);

  useEffect(() => {
    if (!showResolveMenu) return undefined;
    if (typeof window === "undefined") return undefined;

    const handleOutsideClick = (event) => {
      if (!resolveMenuRef.current) return;
      if (!resolveMenuRef.current.contains(event.target)) {
        setShowResolveMenu(false);
      }
    };

    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [showResolveMenu]);

  useEffect(() => {
    selectedSessionRef.current = selectedSession || null;
  }, [selectedSession]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setSelectedSession(null);
    setMessages([]);
    messagesRef.current = [];
    setMessageError("");
    setHasOlderMessages(false);
    setOldestCursor(null);
    setLatestCursor(null);
    setHasMoreSessions(false);
    setOlderSessionsOffset(0);
    if (isMobileViewport) {
      setMobilePanel("list");
    }
    setSessionLock(null);
  }, [tab, isMobileViewport]);

  useEffect(() => {
    if (isUserLoading || !user) return;
    fetchSessions({ offset: 0 });
  }, [tab]);


  const getMessageScrollElement = () => chatContainerRef.current || null;
  const scrollToBottom = () => {
    const doScroll = () => {
      const scrollEl = getMessageScrollElement();
      if (scrollEl) {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      }
    };
    requestAnimationFrame(doScroll);
  };

  const getFirstSessionForTab = (list = []) => {
    if (!Array.isArray(list) || list.length === 0) return null;
    if (tab === "unread") {
      return list.find((row) => {
        return Number(row?.unread_count || 0) > 0 && isPendingSession(row);
      }) || null;
    }
    if (tab === "unresolved") {
      return list.find((row) => isPendingSession(row) && Number(row?.unread_count || 0) <= 0) || null;
    }
    if (tab === "resolved") return list.find((row) => String(row?.status || "").toLowerCase() === "resolved") || null;
    return list[0] || null;
  };

  const fetchSessionLock = async (session = selectedSessionRef.current, { silent = false } = {}) => {
    const sessionId = session?.id || null;
    if (!sessionId) {
      setSessionLock(null);
      return null;
    }

    try {
      const body = await fetchJsonWithRetry(`/api/admin/whatsapp/agent-lock?sessionId=${encodeURIComponent(sessionId)}`, {
        credentials: "include",
        cache: "no-store"
      }, 1);
      setSessionLock(body?.lock || null);
      return body?.lock || null;
    } catch {
      if (!silent) setSessionLock(null);
      return null;
    }
  };

  const releaseTypingLock = async (session = selectedSessionRef.current) => {
    const sessionId = session?.id || null;
    if (!sessionId) return;

    try {
      await fetch("/api/admin/whatsapp/agent-lock", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
        body: JSON.stringify({ sessionId })
      });
    } catch {
      // Best effort cleanup only.
    }
  };

  const fetchSessions = async (options = {}) => {
    const { silent = false, append = false, offset = 0, searchOverride = null } = options;
    setError("");
    if (!silent && append) {
      setIsLoadingOlderSessions(true);
    } else if (!silent) {
      setIsLoadingSessions(true);
    }

    try {
      const query = new URLSearchParams({ lite: "1" });
      const searchTerm = typeof searchOverride === "string" ? searchOverride : search;
      const normalizedSearch = String(searchTerm || "").trim();
      const view = String(tab || "all").toLowerCase();
      query.set("offset", String(offset));
      query.set("limit", "20");
      query.set("view", view);
      if (normalizedSearch) {
        query.set("search", normalizedSearch);
      }
      const body = await fetchJsonWithRetry(`/api/admin/whatsapp/sessions?${query.toString()}`, {
        credentials: "include",
        cache: "no-store"
      }, 1);
      const nextSessions = body.sessions || [];
      if (!append && body?.counts && typeof body.counts === "object") {
        setServerTabCounts({
          unread: Number(body.counts.unread || 0),
          unresolved: Number(body.counts.unresolved || 0),
          resolved: Number(body.counts.resolved || 0)
        });
      }
      const pagination = body.pagination || {};
      const unreadNow = new Map(nextSessions.map((row) => [row.id, Number(row?.unread_count || 0)]));
      if (!append && hasBootstrappedSessionsRef.current && notificationPermission === "granted" && typeof window !== "undefined") {
        nextSessions.forEach((row) => {
          const prev = Number(previousUnreadBySessionRef.current.get(row.id) || 0);
          const now = Number(row?.unread_count || 0);
          const delta = now - prev;
          if (delta > 0) {
            const title = row?.patient_name || row?.phone || "New WhatsApp Message";
            const bodyText = delta > 1
              ? `${delta} new messages`
              : "New message received";
            const note = new Notification(title, { body: bodyText, tag: `wa-${row.id}` });
            note.onclick = () => {
              window.focus();
              handleSelect(row);
            };
          }
        });
      }
      if (!append) {
        previousUnreadBySessionRef.current = unreadNow;
        hasBootstrappedSessionsRef.current = true;
      }

      const mergeSessionLists = (primaryRows, extraRows) => {
        const byId = new Map();
        for (const row of [...primaryRows, ...extraRows]) {
          if (!row?.id || byId.has(row.id)) continue;
          byId.set(row.id, row);
        }
        return [...byId.values()].sort(
          (a, b) =>
            new Date(b.last_message_at || b.created_at || 0).getTime() -
            new Date(a.last_message_at || a.created_at || 0).getTime()
        );
      };

      const currentSessions = sessionsRef.current || [];
      const mergedSessions = append
        ? mergeSessionLists(currentSessions, nextSessions)
        : silent
          ? mergeSessionLists(nextSessions, currentSessions)
          : nextSessions;

      const nextSignature = buildSessionsSignature(mergedSessions);
      const hasSessionListChanged = nextSignature !== sessionsSignatureRef.current;
      sessionsSignatureRef.current = nextSignature;
      if (!silent || hasSessionListChanged) {
        setSessions(mergedSessions);
      }
      const totalCount = Number(pagination?.total_count || mergedSessions.length);
      setHasMoreSessions(Boolean(pagination?.has_more) || mergedSessions.length < totalCount);
      setOlderSessionsOffset(Number(pagination?.next_offset || mergedSessions.length));

      if (append) {
        return mergedSessions;
      }

      if (selectedSession) {
        const freshSelected = mergedSessions.find((s) => s.id === selectedSession.id);
        if (freshSelected) {
          const mergedSelected = {
            ...freshSelected,
            patient_name:
              freshSelected.patient_name ||
              selectedSession.patient_name ||
              freshSelected.phone ||
              "Unknown"
          };
          if (shouldUpdateSelectedSession(selectedSessionRef.current, mergedSelected)) {
            setSelectedSession(mergedSelected);
          }
          setSessions((prev) =>
            prev.map((row) => (row.id === mergedSelected.id ? { ...row, patient_name: mergedSelected.patient_name } : row))
          );
        } else {
          const selectedPhone = canonicalPhone(selectedSession.phone);
          const matchedByPhone = selectedPhone
            ? mergedSessions.find((s) => canonicalPhone(s?.phone) === selectedPhone)
            : null;

          if (matchedByPhone) {
            const mergedSelected = {
              ...matchedByPhone,
              patient_name:
                matchedByPhone.patient_name ||
                selectedSession.patient_name ||
                matchedByPhone.phone ||
                "Unknown"
            };
            if (shouldUpdateSelectedSession(selectedSessionRef.current, mergedSelected)) {
              setSelectedSession(mergedSelected);
            }
          } else if (!silent) {
            // Only clear on explicit (non-silent) refreshes; keep selection stable during background polling.
            setSelectedSession(null);
            setMessages([]);
            setHasOlderMessages(false);
            setOldestCursor(null);
          }
        }
      } else if (mergedSessions.length > 0) {
        const requestedPhone = searchParams.get("phone");
        const matchedByPhone = requestedPhone
          ? mergedSessions.find((s) => String(s.phone || "").includes(String(requestedPhone)))
          : null;
        if (matchedByPhone) {
          setSelectedSession(matchedByPhone);
          if (isMobileViewport) {
            setMobilePanel("chat");
          }
          await fetchMessages(matchedByPhone.phone);
        } else {
          setSelectedSession(null);
          setMessages([]);
          setHasOlderMessages(false);
          setOldestCursor(null);
          setLatestCursor(null);
        }
      } else {
        setSelectedSession(null);
        setMessages([]);
        setHasOlderMessages(false);
        setOldestCursor(null);
        setLatestCursor(null);
      }
      return mergedSessions;
    } catch {
      if (!silent) {
        setError("Failed to load conversations. Please refresh.");
      }
      return [];
    } finally {
      if (!silent && append) {
        setIsLoadingOlderSessions(false);
      } else if (!silent) {
        setIsLoadingSessions(false);
      }
    }
  };

  useEffect(() => {
    if (isUserLoading || !user) return undefined;
    const handle = setTimeout(() => {
      setOlderSessionsOffset(0);
      setHasMoreSessions(false);
      fetchSessions({ searchOverride: search });
    }, 250);
    return () => clearTimeout(handle);
  }, [search, isUserLoading, user]);

  const fetchAgentPresence = async ({ silent = false } = {}) => {
    try {
      const body = await fetchJsonWithRetry("/api/admin/whatsapp/agent-presence", {
        credentials: "include",
        cache: "no-store"
      }, 1);
      setAgentPresence(Array.isArray(body?.agents) ? body.agents : []);
    } catch {
      if (!silent) setAgentPresence([]);
    }
  };

  const fetchChatSettings = async () => {
    try {
      const body = await fetchJsonWithRetry("/api/admin/whatsapp/settings", {
        credentials: "include",
        cache: "no-store"
      }, 1);
      setChatSettings(normalizeChatSettings(body?.settings || DEFAULT_CHAT_SETTINGS));
    } catch {
      setChatSettings(DEFAULT_CHAT_SETTINGS);
    }
  };

  const fetchMessages = async (phone, options = {}) => {
    if (!phone) return;
    const { before = null, appendOlder = false, silent = false, since = null } = options;

    if (!silent) setError("");
    if (!appendOlder && !since && !silent) {
      setMessageError("");
    }
    if (appendOlder && !silent) {
      setIsLoadingOlder(true);
    } else if (!silent) {
      setIsLoadingMessages(true);
    }

    try {
      const query = new URLSearchParams({ phone, limit: before ? "60" : since ? "40" : "60" });
      if (before) query.set("before", before);
      if (since) query.set("since", since);
      const body = await fetchJsonWithRetry(`/api/admin/whatsapp/messages?${query.toString()}`, {
        credentials: "include",
        cache: "no-store"
      }, 1);
      const incoming = body.messages || [];
      if (appendOlder) {
        let appendedCount = 0;
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const dedupedOlder = incoming.filter((m) => !existingIds.has(m.id));
          appendedCount = dedupedOlder.length;
          return [...dedupedOlder, ...prev];
        });
        // Safety: if backend returned only overlapping rows, force cursor to move backward.
        if (appendedCount === 0 && oldestCursor) {
          const fallbackMs = new Date(oldestCursor).getTime() - 1000;
          if (Number.isFinite(fallbackMs)) {
            setOldestCursor(new Date(fallbackMs).toISOString());
          }
        }
      } else if (since) {
        if (incoming.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const dedupedNew = incoming.filter((m) => !existingIds.has(m.id));
            if (
              dedupedNew.length > 0 &&
              silent &&
              notificationPermission === "granted" &&
              typeof window !== "undefined"
            ) {
              const inboundNew = dedupedNew.filter((m) => m.direction !== "outbound");
              if (inboundNew.length > 0) {
                const title = selectedSessionRef.current?.patient_name || phone || "New WhatsApp Message";
                const bodyText =
                  inboundNew.length > 1
                    ? `${inboundNew.length} new messages`
                    : String(inboundNew[0]?.message || "New message received").slice(0, 120);
                const note = new Notification(title, { body: bodyText, tag: `wa-live-${phone}` });
                note.onclick = () => {
                  window.focus();
                };
              }
            }
            return dedupedNew.length > 0 ? [...prev, ...dedupedNew] : prev;
          });
        }
      } else {
        setMessages(incoming);
      }
      if (!appendOlder && !since) {
        setMessageError("");
      }
      if (body.session) {
        const selectedPhone = canonicalPhone(body.session.phone);
        const matchedRow = selectedPhone
          ? (sessionsRef.current || []).find((row) => canonicalPhone(row?.phone) === selectedPhone)
          : null;
        const normalizedSession = matchedRow
          ? {
              ...matchedRow,
              ...body.session,
              id: matchedRow.id,
              patient_name:
                body.session.patient_name ||
                matchedRow.patient_name ||
                body.session.phone ||
                matchedRow.phone ||
                "Unknown"
            }
          : body.session;

        if (shouldUpdateSelectedSession(selectedSessionRef.current, normalizedSession)) {
          setSelectedSession(normalizedSession);
        }
        setSessions((prev) =>
          prev.map((row) => {
            if (canonicalPhone(row.phone) !== canonicalPhone(body.session.phone)) return row;
            return {
              ...row,
              patient_name: body.session.patient_name || row.patient_name || row.phone || "Unknown"
            };
          })
        );
      }
      setLabMeta(body.lab || null);
      setBotLabelMap(body.botLabelMap || {});
      if (!since) {
        setHasOlderMessages(Boolean(body.pagination?.has_older));
        setOldestCursor(body.pagination?.next_before || null);
        setHistoryWindowDays(body.pagination?.initial_window_days || 2);
      }
      const newestLoaded = (incoming[incoming.length - 1] || body.messages?.[body.messages.length - 1] || null)?.created_at || null;
      if (newestLoaded) {
        setLatestCursor(newestLoaded);
      } else if (!appendOlder && !since) {
        setLatestCursor(incoming[incoming.length - 1]?.created_at || null);
      }
      if (!appendOlder && !since) {
        scrollToBottom();
        initialBottomReadyRef.current = true;
        shouldStickToBottomRef.current = true;
      }
    } catch (err) {
      const errorDetail = {
        phone: phone || null,
        before: before || null,
        since: since || null,
        appendOlder: Boolean(appendOlder),
        error: err?.message || String(err),
        status: err?.status || null,
        url: err?.url || null
      };
      console.error(`[whatsapp-ui] fetchMessages failed ${JSON.stringify(errorDetail)}`);
      if (!silent && !appendOlder && !since && messagesRef.current.length === 0) {
        const userFacing = err?.message
          ? `Failed to load messages. ${err.message}`
          : "Failed to load messages. Please retry.";
        setMessageError(userFacing);
      }
    } finally {
      if (appendOlder && !silent) {
        setIsLoadingOlder(false);
      } else if (!silent) {
        setIsLoadingMessages(false);
      }
    }
  };

  useEffect(() => {
    if (!selectedSession?.id) {
      setSessionLock(null);
      return;
    }

    fetchSessionLock(selectedSession, { silent: true });
  }, [selectedSession?.id]);

  useEffect(() => {
    const typingText = toPlainComposerText(composerText).trim();
    const session = selectedSessionRef.current;
    const lockOwnedByOther = Boolean(
      sessionLock?.active &&
      sessionLock.agent_id &&
      sessionLock.agent_id !== user?.id
    );

    if (!session?.id || !typingText || lockOwnedByOther) {
      if (typingHeartbeatRef.current) {
        clearInterval(typingHeartbeatRef.current);
        typingHeartbeatRef.current = null;
      }
      releaseTypingLock(session);
      return undefined;
    }

    let cancelled = false;
    const heartbeat = async () => {
      try {
        const response = await fetch("/api/admin/whatsapp/agent-lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            sessionId: session.id,
            typing: true
          })
        });

        const body = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (response.status === 409) {
          setSessionLock(body?.lock || null);
          return;
        }

        if (response.ok) {
          setSessionLock(body?.lock || null);
        }
      } catch {
        // Heartbeats are best effort; the chat remains usable if this fails.
      }
    };

    heartbeat();
    typingHeartbeatRef.current = window.setInterval(heartbeat, 8000);

    return () => {
      cancelled = true;
      if (typingHeartbeatRef.current) {
        clearInterval(typingHeartbeatRef.current);
        typingHeartbeatRef.current = null;
      }
      releaseTypingLock(session);
    };
  }, [selectedSession?.id, Boolean(toPlainComposerText(composerText).trim()), sessionLock?.active, sessionLock?.agent_id, user?.id]);

  useEffect(() => {
    if (isUserLoading || !user) return undefined;

    const refreshTick = async () => {
      if (document.visibilityState !== "visible") return;
      if (autoRefreshInFlightRef.current) return;
      autoRefreshInFlightRef.current = true;
      try {
        const beforeRefreshSelected = selectedSessionRef.current;
        const nextSessions = await fetchSessions({ silent: true });
        await fetchAgentPresence({ silent: true });
        await fetchSessionLock(beforeRefreshSelected, { silent: true });

        if (beforeRefreshSelected?.phone) {
          const beforePhone = canonicalPhone(beforeRefreshSelected.phone);
          const afterRefreshSelected = nextSessions.find(
            (s) => canonicalPhone(s?.phone) === beforePhone
          );
          const shouldRefreshMessages =
            !afterRefreshSelected ||
            String(afterRefreshSelected.last_message_at || "") !==
              String(beforeRefreshSelected.last_message_at || "") ||
            Number(afterRefreshSelected.unread_count || 0) !==
              Number(beforeRefreshSelected.unread_count || 0);

          if (afterRefreshSelected?.phone && shouldRefreshMessages) {
            const cursor = latestCursor || null;
            await fetchMessages(afterRefreshSelected.phone, {
              silent: true,
              since: cursor
            });
          }
        }
      } finally {
        autoRefreshInFlightRef.current = false;
      }
    };

    refreshTick();
    const interval = setInterval(refreshTick, 10000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshTick();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isUserLoading, user, selectedSession?.id, latestCursor]);

  const handleSelect = async (session) => {
    if (selectedSessionRef.current?.id && selectedSessionRef.current.id !== session?.id) {
      await releaseTypingLock(selectedSessionRef.current);
    }
    setSelectedSession(session);
    if (isMobileViewport) {
      setMobilePanel("chat");
    }
    setMessages([]);
    messagesRef.current = [];
    setSenderFilter("all");
    setMessageError("");
    setHasOlderMessages(false);
    setOldestCursor(null);
    setLatestCursor(null);
    initialBottomReadyRef.current = false;
    shouldStickToBottomRef.current = true;
    await fetchMessages(session.phone);
  };

  const handleLoadOlder = async () => {
    const oldestLoadedAt = messagesRef.current?.[0]?.created_at || null;
    const effectiveBefore = oldestLoadedAt || oldestCursor;
    if (!selectedSession?.phone || !effectiveBefore || !hasOlderMessages || isLoadingOlder || isLoadingMessages) {
      return;
    }

    const scrollEl = getMessageScrollElement();
    const previousHeight = scrollEl?.scrollHeight || 0;
    const previousTop = scrollEl?.scrollTop || 0;
    shouldStickToBottomRef.current = false;
    isPrependingRef.current = true;
    await fetchMessages(selectedSession.phone, { before: effectiveBefore, appendOlder: true });
    requestAnimationFrame(() => {
      const nextEl = getMessageScrollElement();
      if (!nextEl) return;
      const delta = (nextEl.scrollHeight || 0) - previousHeight;
      nextEl.scrollTop = previousTop + Math.max(delta, 0);
    });
  };

  const handleRunTaskAction = async () => {
    if (!pendingTaskAction) return;
    await handleCreateClickupTask(pendingTaskAction);
  };

  const handleLoadOlderSessions = async () => {
    if (!hasMoreSessions || isLoadingOlderSessions || isLoadingSessions) {
      return;
    }
    await fetchSessions({ append: true, offset: olderSessionsOffset });
  };

  const handleConversationListScroll = async (event) => {
    const el = event?.currentTarget;
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
    if (!nearBottom) return;
    await handleLoadOlderSessions();
  };

  const handleCreateClickupTask = async (action = "followup") => {
    if (!selectedSession?.phone || isCreatingTask) return;
    const notes = window.prompt("Add notes for this task (optional):", "") || "";
    setIsCreatingTask(true);
    try {
      const response = await fetch("/api/admin/whatsapp/clickup-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phone: selectedSession.phone,
          action,
          notes
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to create ClickUp task");
      }
    } catch (err) {
      setError(err?.message || "Failed to create ClickUp task.");
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleSaveContact = async (sessionOverride = null) => {
    const targetSession = sessionOverride || selectedSession;
    if (!targetSession?.phone || isSavingContact) return;

    setError("");
    setHint("");
    setIsSavingContact(true);

    try {
      const response = await fetch("/api/admin/whatsapp/save-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId: targetSession.id,
          phone: targetSession.phone
        })
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || "Failed to save contact");
      }

      if (body?.session) {
        const nextSession = {
          ...targetSession,
          ...body.session
        };
        setSelectedSession(nextSession);
      }

      const patientName = body?.patient?.name || body?.session?.patient_name || targetSession.patient_name || targetSession.phone;
      const mrn = String(body?.patient?.mrn || "").trim();
      const externalKey = String(body?.patient?.external_key || "").trim();
      const meta = [mrn ? `MRN ${mrn}` : "", externalKey ? `Key ${externalKey}` : ""].filter(Boolean).join(" • ");
      setHint(meta ? `Saved ${patientName}. ${meta}` : `Saved ${patientName} to patients.`);
      await Promise.all([fetchSessions(), fetchMessages(targetSession.phone)]);
    } catch (err) {
      setError(err?.message || "Failed to save contact.");
    } finally {
      setIsSavingContact(false);
    }
  };

  const renderContactActionButton = (session, compact = false) => {
    if (!session?.phone) return null;
    const meta = getContactActionMeta(session);
    const isSavingThisSession = isSavingContact && selectedSession?.id === session.id;

    return (
      <button
        type="button"
        className={`wa-contactIconBtn ${meta.className} ${compact ? "is-compact" : ""}`}
        onClick={async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (selectedSession?.id !== session.id) {
            setSelectedSession(session);
          }
          await handleSaveContact(session);
        }}
        disabled={isSavingContact}
        title={meta.label}
        aria-label={meta.label}
      >
        {isSavingThisSession ? (
          "..."
        ) : (
          <span className="wa-contactIconVisual" aria-hidden="true">
            <span className="wa-contactIconRing">
              <span className="wa-contactIconHead" />
              <span className="wa-contactIconBody" />
            </span>
            <span className={`wa-contactIconBadge ${meta.className}`}>
              {meta.isPatient ? "E" : "+"}
            </span>
          </span>
        )}
      </button>
    );
  };

  const handleAttachmentChoose = () => {
    const input = attachInputRef.current;
    if (!input) return;
    // Allow re-selecting the same file; otherwise onChange won't fire.
    input.value = "";
    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
    } catch {
      // Fallback to click for browsers that block showPicker.
    }
    input.click();
  };

  const handleAttachmentUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!selectedSession?.phone || !file) return;
    if (!selectedSessionWithin24) {
      setError("Cannot send attachments after the 24-hour window has expired.");
      return;
    }

    const maxAttachmentBytes = Number(process.env.NEXT_PUBLIC_WHATSAPP_ATTACHMENT_MAX_BYTES || 10 * 1024 * 1024);
    if (Number(file.size || 0) > maxAttachmentBytes) {
      const maxMb = Math.max(1, Math.round(maxAttachmentBytes / (1024 * 1024)));
      setError(`Attachment is too large. Please keep file size under ${maxMb} MB.`);
      return;
    }

    const caption = window.prompt("Add caption (optional):", "") || "";
    const form = new FormData();
    form.append("phone", selectedSession.phone);
    form.append("file", file);
    form.append("caption", caption);

    setIsSendingAttachment(true);
    try {
      const response = await fetch("/api/admin/whatsapp/reply-attachment", {
        method: "POST",
        credentials: "include",
        body: form
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to send attachment");
      }
      await releaseTypingLock(selectedSession);
      await Promise.all([fetchMessages(selectedSession.phone), fetchSessions()]);
    } catch (err) {
      setError(err?.message || "Failed to send attachment.");
    } finally {
      setIsSendingAttachment(false);
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  };

  const handleSendLatestReport = async () => {
    if (!selectedSession?.phone) {
      setError("Select a conversation first.");
      return;
    }

    if (!selectedSessionWithin24) {
      setError("Cannot send reports after the 24-hour window has expired.");
      return;
    }

    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`Send latest report to ${selectedSession.patient_name || selectedSession.phone}?`);
    if (!confirmed) {
      setHint("Latest report send cancelled.");
      return;
    }

    setError("");
    setHint("");
    setIsSendingReportTool(true);

    try {
      const response = await fetch("/api/admin/whatsapp/report-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "send_latest_report",
          phone: selectedSession.phone
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to send latest report.");
      }

      setHint("Latest report sent to the patient.");
      await releaseTypingLock(selectedSession);
      await Promise.all([fetchMessages(selectedSession.phone), fetchSessions()]);
    } catch (err) {
      setError(err?.message || "Failed to send latest report.");
    } finally {
      setIsSendingReportTool(false);
    }
  };

  const handleSendLatestTrendReport = async () => {
    if (!selectedSession?.phone) {
      setError("Select a conversation first.");
      return;
    }

    if (!selectedSessionWithin24) {
      setError("Cannot send reports after the 24-hour window has expired.");
      return;
    }

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(`Send latest trend report to ${selectedSession.patient_name || selectedSession.phone}?`);
    if (!confirmed) {
      setHint("Trend report send cancelled.");
      return;
    }

    setError("");
    setHint("");
    setIsSendingReportTool(true);

    try {
      const response = await fetch("/api/admin/whatsapp/report-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "send_latest_trend_report",
          phone: selectedSession.phone
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to send latest trend report.");
      }

      setHint("Latest trend report sent to the patient.");
      await releaseTypingLock(selectedSession);
      await Promise.all([fetchMessages(selectedSession.phone), fetchSessions()]);
    } catch (err) {
      setError(err?.message || "Failed to send latest trend report.");
    } finally {
      setIsSendingReportTool(false);
    }
  };

  const openReportTemplateModal = ({ phone = "", patientName = "" } = {}) => {
    setError("");
    setHint("");
    const normalizedPhone = String(phone || selectedSession?.phone || "").trim();
    setReportTemplatePhone(normalizedPhone);
    const defaultName =
      String(patientName || selectedSession?.patient_name || "").trim() &&
      String(patientName || selectedSession?.patient_name || "").trim() !== String(normalizedPhone || "").trim()
        ? String(patientName || selectedSession?.patient_name || "").trim()
        : "";
    setReportTemplatePatientName(defaultName);
    setReportTemplateLabel("Latest");
    setReportTemplateSource("latest_report");
    setReportTemplateRegisteredPhone(normalizedPhone);
    setReportTemplateReqno("");
    setReportTemplateMrno("");
    setReportAuthConfirmed(false);
    setReportAuthType("");
    setReportAuthEvidence("");
    setRegisteredLookupResolvedPhone("");
    setRegisteredLookupSummary("");
    setReportModalError("");
    setShowReportTemplateModal(true);
  };

  const loadSentReports = async (dateValue = sentReportsDate) => {
    setSentReportsError("");
    setIsLoadingSentReports(true);
    try {
      const query = new URLSearchParams({
        status: "sent",
        selected_date: String(dateValue || istTodayYmd()),
        limit: "300"
      });
      const response = await fetch(`/api/admin/reports/auto-dispatch-logs?${query.toString()}`, {
        credentials: "include",
        cache: "no-store"
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load sent reports");
      }
      const json = await response.json();
      setSentReportsRows(Array.isArray(json?.jobs) ? json.jobs : []);
    } catch (err) {
      setSentReportsRows([]);
      setSentReportsError(err?.message || "Failed to load sent reports");
    } finally {
      setIsLoadingSentReports(false);
    }
  };

  const openSentReportsModal = async () => {
    setShowSentReportsModal(true);
    await loadSentReports(sentReportsDate);
  };

  const handleSendReportTemplate = async () => {
    const phoneRaw = String(reportTemplatePhone || "").trim();
    const phoneDigits = digitsOnly(phoneRaw);
    if (!(phoneDigits.length === 10 || phoneDigits.length === 12)) {
      setReportModalError("Phone must be 10 digits or 12 digits (with country code).");
      return;
    }
    if (phoneDigits.length === 12 && !phoneDigits.startsWith("91")) {
      setReportModalError("12-digit phone must start with 91.");
      return;
    }

    const canonicalTargetPhone = canonicalIndiaPhone(phoneRaw);
    const selectedCanonicalPhone = canonicalIndiaPhone(selectedSession?.phone || "");
    if (selectedSessionWithin24 && canonicalTargetPhone && canonicalTargetPhone === selectedCanonicalPhone) {
      setReportModalError("This chat is already in 24-hour live window. Send free text here instead of template.");
      return;
    }

    const patientName = String(reportTemplatePatientName || "").trim();
    if (!patientName) {
      setReportModalError("Patient name is required.");
      return;
    }
    const source = String(reportTemplateSource || "latest_report").trim();
    const reportLabel =
      source === "trend_report"
        ? "Trend"
        : source === "requisition_report"
          ? "Test"
          : "Latest";
    const registeredPhone = String(reportTemplateRegisteredPhone || "").trim();
    const reqno = String(reportTemplateReqno || "").trim();
    const mrno = String(reportTemplateMrno || "").trim();
    if (source === "latest_report") {
      const regDigits = digitsOnly(registeredPhone);
      if (!(regDigits.length === 10 || regDigits.length === 12)) {
        setReportModalError("Registered phone must be 10 digits or 12 digits.");
        return;
      }
      const canonicalRegisteredPhone = canonicalIndiaPhone(registeredPhone);
      if (!canonicalRegisteredPhone || registeredLookupResolvedPhone !== canonicalRegisteredPhone) {
        setReportModalError("Run registered phone lookup before sending latest report.");
        return;
      }
    }
    if (source === "requisition_report" && !reqno) {
      setReportModalError("Requisition No is required for report PDF.");
      return;
    }
    if (source === "trend_report" && !mrno) {
      setReportModalError("MRNO is required for trend report PDF.");
      return;
    }
    if (reportAuthorizationRequired) {
      if (!reportAuthConfirmed) {
        setReportModalError("Please confirm recipient authorization before sending.");
        return;
      }
      if (!String(reportAuthType || "").trim()) {
        setReportModalError("Please select confirmation type.");
        return;
      }
      if (!String(reportAuthEvidence || "").trim()) {
        setReportModalError("Please enter confirmation evidence details.");
        return;
      }
    }
    if (!reportSourceLookupOk) {
      setReportModalError("Run lookup for the selected attachment source before sending.");
      return;
    }

    setReportModalError("");
    setHint("");
    setIsSendingReportTemplate(true);

    try {
      const response = await fetch("/api/admin/whatsapp/report-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "send_report_template",
          phone: phoneRaw,
          patient_name: patientName,
          report_label: reportLabel,
          report_source: source,
          registered_phone: registeredPhone,
          reqno,
          mrno,
          authorization_confirmed: reportAuthConfirmed,
          authorization_type: reportAuthType,
          authorization_evidence: reportAuthEvidence
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to send report template.");
      }

      setShowReportTemplateModal(false);
      setHint("Latest report + template sent.");
      const refreshedSessions = await fetchSessions();
      const target = (refreshedSessions || []).find(
        (row) => canonicalIndiaPhone(row?.phone || "") === canonicalTargetPhone
      );
      if (target?.phone) {
        await handleSelect(target);
      }
    } catch (err) {
      setReportModalError(err?.message || "Failed to send report template.");
    } finally {
      setIsSendingReportTemplate(false);
    }
  };

  const handleLookupRegisteredPhone = async () => {
    const targetPhone = String(reportTemplatePhone || "").trim();
    const source = String(reportTemplateSource || "latest_report").trim().toLowerCase();
    const registeredPhone = String(reportTemplateRegisteredPhone || "").trim();
    const reqno = String(reportTemplateReqno || "").trim();
    const mrno = String(reportTemplateMrno || "").trim();
    const destinationDigits = digitsOnly(targetPhone);
    if (!(destinationDigits.length === 10 || destinationDigits.length === 12)) {
      setReportModalError("Enter a valid destination WhatsApp number first.");
      return;
    }

    if (source === "latest_report") {
      const regDigits = digitsOnly(registeredPhone);
      if (!(regDigits.length === 10 || regDigits.length === 12)) {
        setReportModalError("Registered phone must be 10 digits or 12 digits.");
        return;
      }
      if (regDigits.length === 12 && !regDigits.startsWith("91")) {
        setReportModalError("12-digit registered phone must start with 91.");
        return;
      }
    }
    if (source === "requisition_report" && !reqno) {
      setReportModalError("Enter requisition number first.");
      return;
    }
    if (source === "trend_report" && !mrno) {
      setReportModalError("Enter MRNO first.");
      return;
    }

    setReportModalError("");
    setHint("");
    setRegisteredLookupSummary("");
    setIsLookingUpRegisteredPhone(true);

    try {
      const response = await fetch("/api/admin/whatsapp/report-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "send_report_template",
          dry_run: true,
          phone: targetPhone,
          report_source: source,
          registered_phone: registeredPhone,
          reqno,
          mrno
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Lookup failed.");
      }
      const body = await response.json().catch(() => ({}));
      const resolved = body?.resolved || {};
      const lookedPatientName = String(resolved?.patient_name || "").trim();
      const lookedReqno = String(resolved?.reqno || reqno || "").trim();
      const lookedMrno = String(resolved?.mrno || mrno || "").trim();
      if (lookedPatientName) {
        setReportTemplatePatientName(lookedPatientName);
      }
      if (lookedReqno) {
        setReportTemplateReqno(lookedReqno);
      }
      if (lookedMrno) {
        setReportTemplateMrno(lookedMrno);
      }
      const canonicalKey =
        source === "latest_report"
          ? canonicalIndiaPhone(registeredPhone)
          : source === "requisition_report"
            ? `REQNO:${lookedReqno || reqno}`
            : `MRNO:${lookedMrno || mrno}`;
      setRegisteredLookupResolvedPhone(canonicalKey);
      setRegisteredLookupSummary(
        [
          lookedPatientName || String(reportTemplatePatientName || "").trim() || "Patient",
          lookedReqno ? `Req ${lookedReqno}` : "",
          lookedMrno ? `MRNO ${lookedMrno}` : "",
          source === "trend_report" ? "Trend validated" : "Report validated"
        ]
          .filter(Boolean)
          .join(" • ")
      );
    } catch (err) {
      setRegisteredLookupResolvedPhone("");
      setRegisteredLookupSummary("");
      setReportModalError(err?.message || "Lookup failed.");
    } finally {
      setIsLookingUpRegisteredPhone(false);
    }
  };

  useEffect(() => {
    if (!showReportTemplateModal) return;
    if (String(reportTemplateSource || "").trim().toLowerCase() !== "latest_report") return;
    if (isSendingReportTemplate || isLookingUpRegisteredPhone) return;

    const destinationDigits = digitsOnly(reportTemplatePhone);
    const registeredDigits = digitsOnly(reportTemplateRegisteredPhone);
    if (!(destinationDigits.length === 10 || destinationDigits.length === 12)) return;
    if (!(registeredDigits.length === 10 || registeredDigits.length === 12)) return;

    const lookupKey = canonicalIndiaPhone(reportTemplateRegisteredPhone);
    if (!lookupKey) return;
    if (registeredLookupResolvedPhone === lookupKey && registeredLookupSummary) return;

    void handleLookupRegisteredPhone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showReportTemplateModal,
    reportTemplateSource,
    reportTemplatePhone,
    reportTemplateRegisteredPhone,
    isSendingReportTemplate,
    isLookingUpRegisteredPhone,
    registeredLookupResolvedPhone,
    registeredLookupSummary
  ]);

  const handleSend = async (text) => {
    const content = toPlainComposerText(String(text ?? composerText ?? ""));
    if (!selectedSession || !content || isSending) return;
    if (!selectedSessionWithin24) {
      setError("Cannot send messages after the 24-hour window has expired.");
      return;
    }

    setError("");
    setHint("");
    setIsSending(true);

    try {
      const shortcut = parseShortcutCommand(content, chatSettings);
      const shortcutHelp = buildShortcutHelp(chatSettings) || "No shortcuts configured";
      if (shortcut?.type === "unknown") {
        throw new Error(`Unknown shortcut: ${shortcut.command}. Use ${shortcutHelp}`);
      }

      if (shortcut?.type === "template") {
        const templateText = `${shortcut.message || ""}${shortcut.notes ? `\n${shortcut.notes}` : ""}`.trim();
        if (!templateText) {
          throw new Error(`Shortcut has empty template. Configure it in WhatsApp Settings.`);
        }
        setComposerText(templateText);
        setHint("Preset inserted. Review/edit and press Enter to send.");
        return;
      }

      if (shortcut?.type === "handover") {
        const response = await fetch("/api/admin/whatsapp/handover-bot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            phone: selectedSession.phone,
            flow: shortcut.flow,
            notes: shortcut.notes || ""
          })
        });
        if (!response.ok) {
          const textResponse = await response.text();
          throw new Error(textResponse || "Bot handover failed");
        }

        setComposerText("");
        await releaseTypingLock(selectedSession);
        await Promise.all([fetchMessages(selectedSession.phone), fetchSessions()]);
        return;
      }

      const response = await fetch("/api/admin/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phone: selectedSession.phone,
          message: content
        })
      });

      if (!response.ok) {
        const textResponse = await response.text();
        throw new Error(textResponse || "Reply failed");
      }

      setComposerText("");
      await releaseTypingLock(selectedSession);
      await Promise.all([fetchMessages(selectedSession.phone), fetchSessions()]);
    } catch (err) {
      setError(err?.message || "Message could not be sent. Please retry.");
    } finally {
      setIsSending(false);
    }
  };

  const handleSessionAction = async (action, noteOverride = "", resolutionReasonOverride = "") => {
    if (!selectedSession?.id || isUpdatingStatus) return;
    const note = String(noteOverride || "").trim();
    const resolutionReason = String(resolutionReasonOverride || "").trim();
    if (action === "resolve" && !note) {
      setError("Please choose a resolution reason.");
      return;
    }

    setError("");
    setHint("");
    setIsUpdatingStatus(true);

    try {
      const response = await fetch("/api/admin/whatsapp/session-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId: selectedSession.id,
          action,
          note,
          resolution_reason: resolutionReason || null
        })
      });

      if (!response.ok) {
        const textResponse = await response.text();
        throw new Error(textResponse || "Failed to update chat status");
      }

      if (action === "resolve") {
        setShowResolveMenu(false);
        setResolveReason("");
        setResolveDetail("");
        setHint("Chat resolved and closure note saved.");
      }

      await releaseTypingLock(selectedSession);
      await Promise.all([fetchSessions(), fetchMessages(selectedSession.phone)]);
      if (isMobileViewport) {
        setMobilePanel("list");
        scrollSelectedConversationIntoView();
      }
    } catch (err) {
      setError(err?.message || "Failed to update chat status.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleResolveWithReason = async () => {
    const selected = RESOLVE_REASON_OPTIONS.find((item) => item.value === resolveReason);
    const reasonLabel = selected?.label || "";
    const detail = String(resolveDetail || "").trim();
    if (!reasonLabel) {
      setError("Select a resolution reason first.");
      return;
    }
    if (resolveReason === "other" && !detail) {
      setError("Please add details for 'Other' resolution.");
      return;
    }
    const note = detail ? `${reasonLabel} — ${detail}` : reasonLabel;
    await handleSessionAction("resolve", note, resolveReason);
  };

  const filteredSessions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return sessions.filter((session) => {
      const status = String(session?.status || "").toLowerCase();
      const unreadCount = Number(session?.unread_count || 0);
      const isAgentOwned = hasAgentIntervention(session);

      if (tab === "unread" && (unreadCount <= 0 || !isPendingSession(session))) return false;
      if (tab === "unresolved" && (!isPendingSession(session) || unreadCount > 0)) return false;
      if (tab === "resolved" && status !== "resolved") return false;
      if (conversationOwnerFilter === "bot" && isAgentOwned) return false;
      if (conversationOwnerFilter === "agent" && !isAgentOwned) return false;

      if (!normalizedSearch) return true;

      const name = (session.patient_name || "").toLowerCase();
      const phone = (session.phone || "").toLowerCase();
      return name.includes(normalizedSearch) || phone.includes(normalizedSearch);
    });
  }, [search, sessions, tab, conversationOwnerFilter]);

  const tabCounts = useMemo(() => {
    const fallbackUnread = sessions.filter((session) => Number(session?.unread_count || 0) > 0 && isPendingSession(session)).length;
    const fallbackUnresolved = sessions.filter((session) => isPendingSession(session) && Number(session?.unread_count || 0) <= 0).length;
    return {
      unread: Number(serverTabCounts?.unread ?? fallbackUnread),
      unresolved: Number(serverTabCounts?.unresolved ?? fallbackUnresolved)
    };
  }, [sessions, serverTabCounts]);

  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      // Keep only resolution internal notes visible from status stream.
      if (msg?.direction === "status") {
        const isInternal = Boolean(msg?.payload?.internal);
        const action = String(msg?.payload?.action || "").toLowerCase();
        return isInternal && action === "resolve";
      }

      if (senderFilter === "all") return true;

      // Always keep inbound (patient/user) messages visible for context.
      if (msg?.direction !== "outbound") return true;

      const hasAgent = Boolean(msg?.payload?.sender?.id || msg?.payload?.sender?.name);
      if (senderFilter === "agent") return hasAgent;
      if (senderFilter === "bot") return !hasAgent;
      return true;
    });
  }, [messages, senderFilter]);

  const hasOnlyStatusInWindow = useMemo(
    () => messages.length > 0 && messages.every((msg) => msg?.direction === "status"),
    [messages]
  );

  const deliveryStatusByProviderMessageId = useMemo(() => {
    const map = new Map();
    const statusRows = messages.filter((msg) => msg?.direction === "status");
    for (const row of statusRows) {
      const providerId = extractStatusProviderMessageId(row);
      const status = String(row?.payload?.status || "").toLowerCase();
      if (!providerId || !status) continue;
      const prev = map.get(providerId);
      if (!prev || deliveryStatusRank(status) >= deliveryStatusRank(prev)) {
        map.set(providerId, status);
      }
    }
    return map;
  }, [messages]);

  const effectiveAgentPresence = useMemo(() => {
    const base = Array.isArray(agentPresence) ? [...agentPresence] : [];
    const currentUserId = user?.id || null;
    const currentRole = String(user?.executiveType || "").toLowerCase();
    const canAppear = Boolean(currentUserId) && ["admin", "manager", "director"].includes(currentRole);
    if (!canAppear) return base;

    const ownIndex = base.findIndex((a) => a?.id && a.id === currentUserId);
    const ownBase = ownIndex >= 0 ? base[ownIndex] : null;
    const ownPresence = isPageVisible ? "online" : ownBase?.presence || "away";
    const ownRow = {
      id: currentUserId,
      name: user?.name || ownBase?.name || "You",
      role: currentRole || ownBase?.role || "admin",
      active: true,
      last_active_at: new Date().toISOString(),
      last_lock_seen_at: ownBase?.last_lock_seen_at || null,
      last_message_at: ownBase?.last_message_at || null,
      presence: ownPresence
    };

    if (ownIndex >= 0) {
      base[ownIndex] = { ...ownBase, ...ownRow };
      return base;
    }

    return [ownRow, ...base];
  }, [agentPresence, isPageVisible, user?.executiveType, user?.id, user?.name]);

  const agentPresenceSummary = useMemo(() => {
    return {
      online: effectiveAgentPresence.filter((a) => a.presence === "online").length,
      away: effectiveAgentPresence.filter((a) => a.presence === "away").length,
      offline: effectiveAgentPresence.filter((a) => a.presence === "offline").length
    };
  }, [effectiveAgentPresence]);

  const agentPresenceHover = useMemo(() => {
    const toNames = (presence) =>
      effectiveAgentPresence
        .filter((a) => a.presence === presence)
        .map((a) => a.name)
        .filter(Boolean);

    const onlineNames = toNames("online");
    const awayNames = toNames("away");
    const offlineNames = toNames("offline");

    return {
      online: onlineNames.length ? `Active: ${onlineNames.join(", ")}` : "No active agents",
      away: awayNames.length ? `Away: ${awayNames.join(", ")}` : "No away agents",
      offline: offlineNames.length ? `Logged out: ${offlineNames.join(", ")}` : "No logged out agents"
    };
  }, [effectiveAgentPresence]);

  const draftShortcut = useMemo(
    () => parseShortcutCommand(toPlainComposerText(composerText), chatSettings),
    [composerText, chatSettings]
  );

  const insertTemplateFromDraftShortcut = () => {
    if (!draftShortcut || draftShortcut.type !== "template") return false;
    const templateText = `${draftShortcut.message || ""}${draftShortcut.notes ? `\n${draftShortcut.notes}` : ""}`.trim();
    if (!templateText) return false;
    setComposerText(templateText);
    setHint("Preset inserted. Review/edit and press Enter to send.");
    return true;
  };

  const handleComposerKeyDown = (event) => {
    if (event?.key !== "Tab") return;
    if (!draftShortcut || draftShortcut.type !== "template") return;
    event.preventDefault();
    insertTemplateFromDraftShortcut();
  };

  const handleComposerChange = (nextValue) => {
    if (typeof nextValue === "string") {
      setComposerText(nextValue);
      return;
    }
    const derived =
      nextValue?.target?.value ??
      nextValue?.currentTarget?.value ??
      "";
    setComposerText(String(derived));
  };

  const handleBotFlowInsert = async (flow) => {
    if (!selectedSession?.phone) {
      setError("Select a conversation first.");
      return;
    }
    if (!selectedSessionWithin24) {
      setError("Cannot insert bot flow after the 24-hour window has expired.");
      setShowBotFlowMenu(false);
      return;
    }
    const flowLabel =
      flow === "reports"
        ? "Reports flow"
        : flow === "home_visit"
          ? "Home Visit flow"
          : flow === "feedback"
            ? "Feedback flow"
            : "Main Menu";
    const shouldSend = window.confirm(
      `Send ${flowLabel} to ${selectedSession.patient_name || selectedSession.phone}?`
    );
    if (!shouldSend) {
      setShowBotFlowMenu(false);
      return;
    }

    setError("");
    setHint("");
    setIsSending(true);
    setShowBotFlowMenu(false);

    try {
      const response = await fetch("/api/admin/whatsapp/handover-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phone: selectedSession.phone,
          flow,
          notes: toPlainComposerText(composerText)
        })
      });

      if (!response.ok) {
        const textResponse = await response.text();
        throw new Error(textResponse || "Bot flow handover failed");
      }

      setHint(
        flow === "reports"
          ? "Reports bot flow inserted into this chat."
          : flow === "home_visit"
          ? "Home visit bot flow inserted into this chat."
          : flow === "feedback"
          ? "Feedback flow inserted into this chat."
          : "Main menu bot flow inserted into this chat."
      );
      setComposerText("");
      await releaseTypingLock(selectedSession);
      await Promise.all([fetchMessages(selectedSession.phone), fetchSessions()]);
    } catch (err) {
      setError(err?.message || "Failed to insert bot flow into chat.");
    } finally {
      setIsSending(false);
    }
  };

  const selectedLatestInboundAt = useMemo(() => {
    if (!selectedSession?.phone) return null;
    const newestInbound = [...messages]
      .filter((m) => m?.direction === "inbound")
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())[0];
    return newestInbound?.created_at || null;
  }, [messages, selectedSession?.phone]);

  const selectedSessionWithin24 = selectedSession
    ? isWithin24(selectedSession, selectedLatestInboundAt)
    : false;

  const canReply = Boolean(
    selectedSession &&
    selectedSessionWithin24 &&
    !isSending &&
    !isUpdatingStatus &&
    !(sessionLock?.active && sessionLock.agent_id && sessionLock.agent_id !== user?.id)
  );
  const isExpiredWindow = Boolean(selectedSession && !selectedSessionWithin24);
  const shouldRecommendClose = Boolean(selectedSession && isExpiredWindow && selectedSession.status !== "closed");
  const isLockedByAnotherAgent = Boolean(
    selectedSession &&
    sessionLock?.active &&
    sessionLock.agent_id &&
    sessionLock.agent_id !== user?.id
  );

  const hasManyPatients = (session) => Number(session?.matched_patient_count || 0) > 1;
  const currentSessionPhone = String(selectedSession?.phone || "").trim();
  const searchDigits = digitsOnly(search);
  const searchIsPhoneCandidate = searchDigits.length === 10 || searchDigits.length === 12;
  const searchCanonicalPhone = searchIsPhoneCandidate ? canonicalIndiaPhone(searchDigits) : "";
  const searchExactMatch = searchCanonicalPhone
    ? (sessions || []).find((row) => canonicalIndiaPhone(row?.phone || "") === searchCanonicalPhone) || null
    : null;
  const searchPartialMatches =
    !searchExactMatch && searchDigits.length >= 3
      ? (sessions || []).filter((row) => digitsOnly(row?.phone || "").includes(searchDigits))
      : [];
  const searchHasAmbiguousPartialMatches = !searchExactMatch && searchPartialMatches.length > 1;
  const searchMatchedSession = searchExactMatch || (searchPartialMatches.length === 1 ? searchPartialMatches[0] : null);
  const searchCanOpenReportTemplate =
    !searchHasAmbiguousPartialMatches && (Boolean(searchMatchedSession) || searchIsPhoneCandidate);
  const searchMatchedWithin24 = Boolean(
    searchMatchedSession && isWithin24(searchMatchedSession)
  );
  const searchCanSendTemplateNow = searchCanOpenReportTemplate && !searchMatchedWithin24;
  const reportTemplatePreviewText = REPORT_TEMPLATE_TEXT
    .replace("{{1}}", String(reportTemplatePatientName || "[Patient Name]").trim() || "[Patient Name]")
    .replace("{{2}}", String(reportTemplateLabel || "Report").trim() || "Report");
  const reportDestinationDigits = digitsOnly(reportTemplatePhone);
  const reportDestinationPhoneValid =
    (reportDestinationDigits.length === 10 || reportDestinationDigits.length === 12) &&
    !(reportDestinationDigits.length === 12 && !reportDestinationDigits.startsWith("91"));
  const reportSourceKey =
    reportTemplateSource === "latest_report"
      ? canonicalIndiaPhone(reportTemplateRegisteredPhone)
      : reportTemplateSource === "requisition_report"
        ? `REQNO:${String(reportTemplateReqno || "").trim()}`
        : `MRNO:${String(reportTemplateMrno || "").trim()}`;
  const reportSourceLookupOk = Boolean(
    registeredLookupResolvedPhone &&
    reportSourceKey &&
    registeredLookupResolvedPhone === reportSourceKey
  );
  const reportAuthorizationRequired =
    reportTemplateSource === "latest_report" &&
    Boolean(canonicalIndiaPhone(reportTemplatePhone || "")) &&
    Boolean(canonicalIndiaPhone(reportTemplateRegisteredPhone || "")) &&
    canonicalIndiaPhone(reportTemplatePhone || "") !== canonicalIndiaPhone(reportTemplateRegisteredPhone || "");
  const reportAuthReady =
    !reportAuthorizationRequired ||
    (reportAuthConfirmed &&
      Boolean(String(reportAuthType || "").trim()) &&
      Boolean(String(reportAuthEvidence || "").trim()));
  const reportTemplateReadyToSend =
    reportDestinationPhoneValid &&
    Boolean(String(reportTemplatePatientName || "").trim()) &&
    reportSourceLookupOk &&
    reportAuthReady;

  const handleCopyPhone = async (phoneValue) => {
    const cleanPhone = String(phoneValue || "").trim();
    if (!cleanPhone) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(cleanPhone);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = cleanPhone;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setError("");
      setHint(`Copied: ${cleanPhone}`);
      window.setTimeout(() => setHint(""), 1400);
    } catch {
      setError("Could not copy phone. Please copy manually.");
    }
  };

  const handleCopyText = async (textValue, successLabel = "Copied") => {
    const text = String(textValue || "").trim();
    if (!text) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setError("");
      setHint(successLabel);
      window.setTimeout(() => setHint(""), 1400);
    } catch {
      setError("Could not copy. Please copy manually.");
    }
  };

  const handleAttachLocationToVisit = async (locationPin, messageId) => {
    if (!locationPin) return;
    if (!selectedSession?.patient_id) {
      setError("No linked patient found for this chat yet. Save/link contact first.");
      return;
    }

    setError("");
    setHint("");
    setAttachingLocationMessageId(messageId || "__location__");

    try {
      const visitsResponse = await fetchJsonWithRetry(
        `/api/visits?patient_id=${encodeURIComponent(String(selectedSession.patient_id))}`,
        { credentials: "include" },
        1
      );

      const attachableVisits = (Array.isArray(visitsResponse) ? visitsResponse : [])
        .filter((visit) => isAttachableVisitStatus(visit?.status))
        .sort((a, b) => toSortableVisitDate(b) - toSortableVisitDate(a));

      if (attachableVisits.length === 0) {
        throw new Error("No active visit found for this patient.");
      }

      let targetVisit = attachableVisits[0];
      if (attachableVisits.length > 1 && typeof window !== "undefined") {
        const choices = attachableVisits
          .slice(0, 8)
          .map((visit, index) => {
            const label = `${index + 1}. ${visit.visit_date || "Unknown date"} | ${visit.status || "NA"} | ${visit.time_slot?.slot_name || "No slot"}`;
            return `${label} (${visit.id})`;
          })
          .join("\n");
        const picked = window.prompt(
          `Multiple active visits found.\nEnter number to attach location:\n${choices}`,
          "1"
        );
        const pickedIndex = Number(picked);
        if (!Number.isFinite(pickedIndex) || pickedIndex < 1 || pickedIndex > attachableVisits.length) {
          setHint("Attach location cancelled.");
          return;
        }
        targetVisit = attachableVisits[pickedIndex - 1];
      }

      const payload = {
        id: targetVisit.id,
        lat: Number(locationPin.lat),
        lng: Number(locationPin.lng),
        address: buildVisitLocationAddress(locationPin),
        location_text: buildVisitLocationAddress(locationPin)
      };

      const updateResponse = await fetch("/api/visits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      const updateBody = await updateResponse.json().catch(() => null);
      if (!updateResponse.ok) {
        throw new Error(updateBody?.error || "Failed to attach location to visit.");
      }

      const dateLabel = String(targetVisit.visit_date || "").trim() || "selected visit";
      setHint(`Location attached to visit (${dateLabel}).`);
      window.setTimeout(() => setHint(""), 1800);
    } catch (err) {
      setError(err?.message || "Failed to attach location.");
    } finally {
      setAttachingLocationMessageId(null);
    }
  };

  const renderDbNamesPopover = (session, compact = false) => {
    if (!hasManyPatients(session)) return null;
    const rows = Array.isArray(session?.matched_patients) ? session.matched_patients : [];
    const isOpen = openInfoSessionId === session?.id;

    return (
      <span className="wa-identityWrap">
        <button
          type="button"
          className="wa-identityIcon"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpenInfoSessionId((prev) => (prev === session?.id ? null : session?.id));
          }}
          aria-label="Show matching DB patient names"
          title="Show matching DB patient names"
        >
          i
        </button>
        <span className={`wa-namePopover ${isOpen ? "is-open" : ""} ${compact ? "is-compact" : ""}`}>
          <strong>Patient DB names</strong>
          {rows.map((row) => (
            <span
              key={`${row.id || row.name}-${row.name}`}
              className={`wa-nameRow ${row.is_lead ? "is-lead" : "is-patient"}`}
            >
              {row.name}
            </span>
          ))}
        </span>
      </span>
    );
  };

  if (isUserLoading) {
    return <div className="wa-loading">Loading...</div>;
  }

  return (
    <div className={`wa-root with-shortcut theme-${themeMode}`}>
      <ShortcutBar
        themeMode={themeMode}
        onToggleTheme={() => setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))}
        centerContent={
          <div className="wa-shortActions">
            <div className="wa-shortPresence">
              <span className="wa-agentSummaryChip is-online" title={agentPresenceHover.online}>
                Active {agentPresenceSummary.online}
              </span>
              <span className="wa-agentSummaryChip is-away" title={agentPresenceHover.away}>
                Away {agentPresenceSummary.away}
              </span>
              <span className="wa-agentSummaryChip is-offline" title={agentPresenceHover.offline}>
                Logged Out {agentPresenceSummary.offline}
              </span>
            </div>
            <a href="/admin/whatsapp/settings" className="wa-shortBtn" title="WhatsApp Settings">
              ⚙
            </a>
            <button type="button" className="wa-shortBtn" onClick={fetchSessions} title="Refresh chats">
              ↻
            </button>
          </div>
        }
      />
      <div className={`wa-frame is-no-header ${isMobileViewport ? `is-mobile-${mobilePanel}` : ""}`}>
        <div className={`wa-main ${isMobileViewport ? `is-mobile-${mobilePanel}` : ""}`}>
            <div className={`wa-sidebar ${isMobileViewport && mobilePanel !== "list" ? "is-mobile-hidden" : ""}`}>
              <div className="wa-leftPanelTools">
              <div className="wa-leftHeaderCompact">
                <span className="wa-leftTitleMini">Inbox</span>
                {displayWhatsappNumber && (
                  <span className="wa-leftNumberMini">{displayWhatsappNumber}</span>
                )}
                <div className="wa-leftQuickTools">
                  <button
                    type="button"
                    className={`wa-iconToolBtn ${showSearchBox ? "is-active" : ""}`}
                    onClick={() => setShowSearchBox((prev) => !prev)}
                    title={showSearchBox ? "Hide search" : "Search"}
                    aria-label={showSearchBox ? "Hide search" : "Show search"}
                  >
                    🔎
                  </button>
                  <button
                    type="button"
                    className={`wa-iconToolBtn ${showSidebarMeta ? "is-active" : ""}`}
                    onClick={() => setShowSidebarMeta((prev) => !prev)}
                    title={showSidebarMeta ? "Hide legend" : "Show legend"}
                    aria-label={showSidebarMeta ? "Hide legend" : "Show legend"}
                  >
                    ⓘ
                  </button>
                </div>
              </div>
              <div className="wa-tabs">
                {[
                  { key: "unread", label: "Unread", count: tabCounts.unread, countClass: "is-red" },
                  { key: "unresolved", label: "Unresolved", count: tabCounts.unresolved, countClass: "is-yellow" },
                  { key: "resolved", label: "Resolved" },
                  { key: "all", label: "All" }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={tab === item.key ? "is-active" : ""}
                    onClick={() => setTab(item.key)}
                  >
                    <span>{item.label}</span>
                    {Number(item.count || 0) > 0 && (
                      <span className={`wa-tabCount ${item.countClass || ""}`}>{item.count}</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="wa-ownerSearchRow">
                <div className="wa-tabs wa-ownerTabs">
                  {[
                    { key: "all", label: "All" },
                    { key: "bot", label: "Bot" },
                    { key: "agent", label: "Agent" }
                  ].map((item) => (
                    <button
                      key={`owner-${item.key}`}
                      type="button"
                      className={conversationOwnerFilter === item.key ? "is-active" : ""}
                      onClick={() => setConversationOwnerFilter(item.key)}
                    >
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
                {(showSearchBox || search) && (
                  <div className="wa-ownerSearchTools">
                    <input
                      className="wa-ownerSearchInput"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search patient or phone"
                    />
                    <button
                      type="button"
                      className={`wa-ownerSearchAddBtn ${searchCanSendTemplateNow ? "is-ready" : ""}`}
                      title={
                        searchHasAmbiguousPartialMatches
                          ? "Multiple matches found. Type full number to continue."
                          : !searchCanOpenReportTemplate
                          ? "Search patient/phone or enter a 10/12 digit phone"
                          : searchMatchedWithin24
                            ? "This number is in 24h window. Send free text in chat."
                            : "Send Reports to this number"
                      }
                      onClick={() =>
                        openReportTemplateModal({
                          phone: searchMatchedSession?.phone || search,
                          patientName: searchMatchedSession?.patient_name || ""
                        })
                      }
                      disabled={!searchCanSendTemplateNow}
                    >
                      +
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="wa-ownerSearchOpenBtn"
                  onClick={openSentReportsModal}
                  title="View sent reports for selected date"
                >
                  Sent Reports
                </button>
              </div>

              <div className={`wa-leftMeta ${showSidebarMeta ? "is-open" : ""}`}>
                <div className="wa-stateLegend" aria-label="Chat state legend">
                  <span className="wa-stateLegendTitle">Legend</span>
                  <span className="wa-stateFlag is-unread">Unread</span>
                  <span className="wa-stateFlag is-pending">Pending</span>
                  <span className="wa-stateFlag is-resolved">Resolved</span>
                  <span className="wa-stateFlag is-closed">Closed</span>
                  <span className="wa-stateFlag is-expired">24h</span>
                </div>
              </div>
            </div>
            <div className="wa-conversationList" onScroll={handleConversationListScroll}>
              {isLoadingSessions ? (
                <div className="wa-empty">Loading conversations...</div>
              ) : filteredSessions.length === 0 ? (
                <div className="wa-empty">No conversations found.</div>
              ) : (
                <>
                {filteredSessions.map((session) => {
                  const signals = getSessionSignals(session);
                  const signalClasses = signals.map((s) => `cs-state-${s.key}`).join(" ");
                  const suffix = formatDateTime(session.last_message_at);
                  const contactTypeClass = session.contact_type === "lead" ? "is-lead" : "is-patient";
                  const isActivePhoneMatch =
                    selectedSession &&
                    canonicalPhone(selectedSession.phone) === canonicalPhone(session.phone);
                  const displayName =
                    (isActivePhoneMatch ? selectedSession?.patient_name : null) ||
                    session.patient_name ||
                    session.phone ||
                    "Unknown";

                  return (
                    <div
                      key={session.id}
                      className={`wa-conversation ${selectedSession?.id === session.id ? "is-active" : ""}`}
                      onClick={() => handleSelect(session)}
                    >
                    <div className="wa-conversationNameWrap">
                      <span className={`wa-conversationNameText ${contactTypeClass}`}>
                        {displayName}
                      </span>

                      <span className="wa-conversationNameFlags">
                        {renderContactActionButton(session, true)}
                        {session.unread_count > 0 && (
                          <span className="wa-unread" title={`${session.unread_count} unread`}>
                            {session.unread_count}
                          </span>
                        )}
                        {signals.map((s) => (
                          <span key={s.key} className={`wa-stateDot ${s.className}`} title={s.label}></span>
                        ))}
                      </span>
                    </div>

                        <div className="wa-conversationInfoText">
                          <span className={`wa-contactMiniTag ${session.contact_type === "patient" ? "is-patient" : "is-lead"}`}>
                            {session.contact_type === "patient" ? "Patient" : "Lead"}
                          </span>
                          {session.phone}
                        {suffix ? ` • ${suffix}` : ""}
                      </div>
                    </div>
                  );
                })}
                </>
              )}
              {isLoadingOlderSessions && (
                <div className="wa-empty">Loading older chats...</div>
              )}
            </div>
          </div>

          <div className={`wa-chatCol ${isMobileViewport && mobilePanel !== "chat" ? "is-mobile-hidden" : ""}`}>
            <div className="wa-chatTop">
            {selectedSession && (
              <div className="wa-sessionActionBar">
                <div className="wa-sessionActionInfo">
                  {isMobileViewport && (
                    <button
                      type="button"
                      className="wa-mobileBackBtn"
                      aria-label="Back to chats"
                      title="Back to chats"
                      onClick={() => setMobilePanel("list")}
                    >
                      ←
                    </button>
                  )}
                  <span className="wa-sessionName">
                    {selectedSession.patient_name || selectedSession.phone}
                  </span>
                  {currentSessionPhone && (
                    <button
                      type="button"
                      className="wa-sessionPhone"
                      onClick={() => handleCopyPhone(currentSessionPhone)}
                      title="Tap to copy phone number"
                      aria-label={`Copy phone number ${currentSessionPhone}`}
                    >
                      {currentSessionPhone}
                    </button>
                  )}
                  {!isMobileViewport && renderDbNamesPopover(selectedSession, true)}
                  {!isMobileViewport && (
                    <span
                      className={`wa-status ${
                        selectedSession.contact_type === "lead"
                          ? "is-lead"
                          : "is-patient"
                      }`}
                    >
                      {selectedSession.contact_type === "lead"
                        ? "Lead"
                        : "Patient"}
                    </span>
                  )}
                  <span className={`wa-status ${selectedSessionWithin24 ? "is-live" : "is-expired"}`}>
                    {selectedSessionWithin24 ? "24h live" : "24h expired"}
                  </span>
                  <span
                    className={`wa-status ${
                      selectedSession.status === "resolved"
                        ? "is-resolved"
                        : selectedSession.status === "closed"
                          ? "is-closed"
                          : "is-pending"
                    }`}
                  >
                    {selectedSession.status || "pending"}
                  </span>
                  {isLockedByAnotherAgent && (
                    <span className="wa-status is-locked">
                      {sessionLock?.agent_name || "Another agent"} is typing
                    </span>
                  )}
                </div>

                {!isMobileViewport && (
                <div className="wa-messageFilterBar">
                  {[
                    { key: "all", label: "All" },
                    { key: "agent", label: "Agents" },
                    { key: "bot", label: "Bot" }
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={senderFilter === item.key ? "is-active" : ""}
                      onClick={() => setSenderFilter(item.key)}
                      title={`Show ${item.label}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                )}

                <div className="wa-actionBtns">
                  {!isMobileViewport && (
                    <>
                      <select
                        value={pendingTaskAction}
                        onChange={(e) => setPendingTaskAction(e.target.value)}
                        className="wa-inlineSelect"
                        disabled={isCreatingTask}
                        title="Choose task action"
                      >
                        <option value="followup">Follow-up</option>
                        <option value="report_request">Report task</option>
                        <option value="doctors_connect">Doctor connect</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleRunTaskAction}
                        disabled={isCreatingTask}
                        className="wa-inlineBtn"
                        title="Run selected task action"
                      >
                        {isCreatingTask ? "..." : "Run task"}
                      </button>
                    </>
                  )}
                    <button
                      type="button"
                      disabled={isUpdatingStatus || isLockedByAnotherAgent}
                      onClick={() => handleSessionAction("pending")}
                      className={selectedSession.status === "pending" ? "is-active" : ""}
                    >
                    Pending
                  </button>
                    <button
                      type="button"
                      disabled={isUpdatingStatus || isLockedByAnotherAgent}
                      onClick={() => setShowResolveMenu((prev) => !prev)}
                      className={selectedSession.status === "resolved" ? "is-active" : ""}
                    >
                    Resolve
                  </button>
                    <button
                      type="button"
                      disabled={isUpdatingStatus || isLockedByAnotherAgent}
                      onClick={() => handleSessionAction("close")}
                      className={selectedSession.status === "closed" ? "is-active danger" : "danger"}
                    >
                    Close
                  </button>
                </div>
              </div>
            )}

            {shouldRecommendClose && (
              <div className="wa-expiredBanner">
                <div className="wa-expiredText">
                  24-hour reply window is expired. Move this chat to <strong>Closed</strong> for queue hygiene?
                </div>
                <div className="wa-expiredActions">
                  <button
                    type="button"
                    disabled={isUpdatingStatus}
                    onClick={() => handleSessionAction("close")}
                    className="danger"
                  >
                    Close Chat
                  </button>
                  <button
                    type="button"
                    disabled={isUpdatingStatus}
                    onClick={() => setShowResolveMenu(true)}
                  >
                    Mark Resolved
                  </button>
                  <button
                    type="button"
                    disabled={isUpdatingStatus}
                    onClick={() => handleSessionAction("pending")}
                  >
                    Keep Pending
                  </button>
                </div>
              </div>
            )}

            {error && <div className="wa-error">{error}</div>}
            {selectedSession && messageError && !isLoadingMessages && filteredMessages.length === 0 && (
              <div className="wa-error">
                <span>{messageError}</span>
                <button
                  type="button"
                  className="wa-historyLoadBtn"
                  onClick={async () => {
                    setMessageError("");
                    setMessages([]);
                    messagesRef.current = [];
                    setHasOlderMessages(false);
                    setOldestCursor(null);
                    setLatestCursor(null);
                    await fetchMessages(selectedSession.phone);
                  }}
                  disabled={isLoadingMessages}
                >
                  Retry
                </button>
              </div>
            )}
            {!error && isLockedByAnotherAgent && (
              <div className="wa-inlineHint is-soft">
                {sessionLock?.agent_name || "Another agent"} is actively typing in this chat. Reply tools stay locked until the typing claim expires.
              </div>
            )}
            {showResolveMenu && selectedSession && (
              <div className="wa-resolveMenu" ref={resolveMenuRef}>
                <div className="wa-resolveMenuTitle">Resolve Chat</div>
                <select
                  value={resolveReason}
                  onChange={(e) => setResolveReason(e.target.value)}
                  disabled={isUpdatingStatus}
                >
                  <option value="">Select reason</option>
                  {RESOLVE_REASON_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <textarea
                  value={resolveDetail}
                  onChange={(e) => setResolveDetail(e.target.value)}
                  placeholder={resolveReason === "other" ? "Details required" : "Optional detail"}
                  disabled={isUpdatingStatus}
                />
                <div className="wa-resolveMenuActions">
                  <button type="button" onClick={() => setShowResolveMenu(false)} disabled={isUpdatingStatus}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleResolveWithReason}
                    disabled={!resolveReason || (resolveReason === "other" && !String(resolveDetail || "").trim()) || isUpdatingStatus}
                  >
                    Confirm Resolve
                  </button>
                </div>
              </div>
            )}
            </div>

                <div className="wa-chatBody">
                <div
                    className="wa-messageList"
                    ref={chatContainerRef}
                    onScroll={(e) => {
                      const scrollTop = e.currentTarget?.scrollTop ?? 0;
                      const scrollHeight = e.currentTarget?.scrollHeight ?? 0;
                      const clientHeight = e.currentTarget?.clientHeight ?? 0;
                      const nearBottom = scrollTop + clientHeight >= scrollHeight - 80;
                      shouldStickToBottomRef.current = nearBottom;
                      if (scrollTop <= 60) {
                        handleLoadOlder();
                      }
                    }}
                  >
                {!selectedSession ? (
                  <div className="wa-empty">Select a conversation to view messages.</div>
                ) : isLoadingMessages ? (
                  <div className="wa-empty">Loading messages...</div>
                ) : filteredMessages.length === 0 ? (
                  <>
                    <div className="wa-historyHint">
                      {isLoadingOlder
                        ? "Loading older messages..."
                        : hasOlderMessages
                          ? `Showing last ${historyWindowDays} days. Scroll up to load older history.`
                          : "No older messages available yet for this chat."}
                      <button
                        type="button"
                        className="wa-historyLoadBtn"
                        onClick={handleLoadOlder}
                        disabled={!hasOlderMessages || isLoadingOlder || isLoadingMessages}
                      >
                        Load older history
                      </button>
                    </div>
                    <div className="wa-empty">
                      {hasOnlyStatusInWindow
                        ? "Recent activity is delivery status only. Load older history to see chat messages."
                        : "No messages for this filter."}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="wa-historyHint">
                      {isLoadingOlder
                        ? "Loading older messages..."
                        : hasOlderMessages
                          ? `Showing last ${historyWindowDays} days. Scroll up to load older history.`
                          : "No older messages available yet for this chat."}
                      <button
                        type="button"
                        className="wa-historyLoadBtn"
                        onClick={handleLoadOlder}
                        disabled={!hasOlderMessages || isLoadingOlder || isLoadingMessages}
                      >
                        Load older history
                      </button>
                    </div>
                    {filteredMessages.map((msg) => {
                      const outgoing = msg.direction === "outbound" || msg.direction === "status";
                      const isStatusNote = msg.direction === "status";
                      const senderLabel = getSenderLabel(msg, user?.id, selectedSession?.patient_name);
                      const simulated = isSimulatedMessage(msg, selectedSession?.context || {});
                      const isBotMessage = isBotOutboundMessage(msg);
                      const providerMessageId = extractOutboundProviderMessageId(msg);
                      const deliveryState =
                        !isStatusNote && providerMessageId
                          ? deliveryStatusByProviderMessageId.get(providerMessageId) || null
                          : null;
                      const media = getMessageMedia(msg);
                      const msgWithContext = {
                        ...msg,
                        sessionContext: selectedSession?.context || {}
                      };
                      const inboundLocationPin = getInboundLocationPin(msgWithContext);

                      return (
                        <div
                          key={msg.id}
                          className={`wa-msgRow ${isStatusNote ? "is-status" : outgoing ? "is-out" : "is-in"}`}
                        >
                          {!outgoing && (
                            <div className="wa-avatar wa-avatarPatient">
                              {getInitial(selectedSession?.patient_name || "P")}
                            </div>
                          )}

                          <div
                            className={`wa-msgBubble ${isStatusNote ? "is-status" : outgoing ? "is-out" : "is-in"} ${isBotMessage ? "is-bot" : ""}`}
                          >
                            <div className="wa-msgMeta">
                              <span className="wa-msgSender">{senderLabel}</span>
                              {simulated && (
                                <span
                                  className="wa-msgSimFlag"
                                  title="Simulator message (sent via dev endpoint)"
                                >
                                  🧪
                                </span>
                              )}
                              <span className="wa-msgTime">{formatMessageTime(msg.created_at)} IST</span>
                              {!isStatusNote && deliveryState && (
                                <span
                                  className={`wa-msgDelivery is-${deliveryState}`}
                                  title={`Delivery ${deliveryState}`}
                                  aria-label={`Delivery ${deliveryState}`}
                                >
                                  {deliveryState === "sent" && "Sent"}
                                  {deliveryState === "delivered" && "Delivered"}
                                  {deliveryState === "read" && "Read"}
                                  {deliveryState === "failed" && "Failed"}
                                </span>
                              )}
                            </div>
                            {inboundLocationPin ? (
                              <div className="wa-msgText wa-locationInline">
                                <div className="wa-locationInlineHeader">
                                  <span className="wa-locationInlineTitle">Location Pin Shared</span>
                                  <span className="wa-locationInlineTools">
                                    <button
                                      type="button"
                                      className="wa-locationInlineIconBtn"
                                      aria-label="Attach location to active visit"
                                      title={
                                        selectedSession?.patient_id
                                          ? "Attach to visit"
                                          : "Link this chat to a patient first"
                                      }
                                      disabled={!selectedSession?.patient_id || attachingLocationMessageId === msg.id}
                                      onClick={() => handleAttachLocationToVisit(inboundLocationPin, msg.id)}
                                    >
                                      {attachingLocationMessageId === msg.id ? "..." : "📎"}
                                    </button>
                                    <button
                                      type="button"
                                      className="wa-locationInlineIconBtn"
                                      aria-label="Copy location details"
                                      title="Copy location details"
                                      onClick={() =>
                                        handleCopyText(
                                          inboundLocationPin.copyText,
                                          "Location details copied"
                                        )
                                      }
                                    >
                                      📋
                                    </button>
                                    <a
                                      href={inboundLocationPin.mapsLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="wa-locationInlineIconBtn is-link"
                                      aria-label="Open location in maps"
                                      title="Open location in maps"
                                    >
                                      ↗
                                    </a>
                                  </span>
                                </div>
                                <div className="wa-locationInlineBody">
                                  {(inboundLocationPin.name || inboundLocationPin.address) && (
                                    <div>
                                      {[inboundLocationPin.name, inboundLocationPin.address].filter(Boolean).join(" - ")}
                                    </div>
                                  )}
                                  <div>Coordinates: {inboundLocationPin.lat},{inboundLocationPin.lng}</div>
                                  <div>Google Maps: {inboundLocationPin.mapsLink}</div>
                                </div>
                              </div>
                            ) : (
                              <div className="wa-msgText">{getDisplayMessageText(msgWithContext, botLabelMap)}</div>
                            )}
                            {media?.url && (
                              <div className="wa-msgAttachment">
                                {media.type === "image" ? (
                                  <a href={media.url} target="_blank" rel="noreferrer">
                                    <img src={media.url} alt="Attachment" className="wa-msgAttachmentImage" />
                                  </a>
                                ) : (
                                  <a href={media.url} target="_blank" rel="noreferrer" className="wa-msgAttachmentLink">
                                    {media.filename || "Open attachment"}
                                  </a>
                                )}
                              </div>
                            )}
                          </div>

                          {outgoing && !isStatusNote && (
                            <div className="wa-avatar wa-avatarLab">
                              <img src={labMeta?.logo_url || APP_LOGO} alt="Lab logo" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
                <div ref={messageEndRef} />
              {/*
              <div className="wa-shortcutHintBar">
                Shortcuts: {buildShortcutHelp(chatSettings) || "No shortcuts configured"}
              </div>
              {hint && <div className="wa-inlineHint">{hint}</div>}
              {draftShortcut?.type === "template" && (
                <div className="wa-inlineHint is-soft">
                  Preset detected ({draftShortcut.command}). Press Tab to insert preset message.
                </div>
              )}

              <MessageInput
                placeholder={
                  !selectedSession
                    ? "Select a conversation to start replying"
                    : !selectedSessionWithin24
                      ? "Reply window expired. Use a template message to reopen."
                      : isSending
                        ? "Sending..."
                        : "Type a message"
                }
                onSend={handleSend}
                disabled={!canReply}
                value={composerText}
                onChange={handleComposerChange}
                onKeyDown={handleComposerKeyDown}
                attachButton={true}
                sendButton={true}
              />
              */}
              </div>
              
              <input
                ref={attachInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                className="wa-hiddenFileInput"
                onChange={handleAttachmentUpload}
              />

              <div className="wa-customComposer">
                <div className="wa-botMenuWrap" ref={botMenuWrapRef}>
                  <button
                    type="button"
                    className="wa-attachBtn"
                    onClick={() => setShowBotFlowMenu((prev) => !prev)}
                    disabled={!selectedSession || !selectedSessionWithin24 || isSending || isUpdatingStatus || isLockedByAnotherAgent}
                    title={selectedSession && !selectedSessionWithin24 ? "Reply window expired" : "Insert bot flow into chat"}
                  >
                    🤖
                  </button>
                  {showBotFlowMenu && (
                    <div className="wa-botMenu">
                      <button
                        type="button"
                        className="wa-botMenuItem"
                        onClick={() => handleBotFlowInsert("main_menu")}
                      >
                        Main Menu
                      </button>
                      <button
                        type="button"
                        className="wa-botMenuItem"
                        onClick={() => handleBotFlowInsert("reports")}
                      >
                        Reports Flow
                      </button>
                      <button
                        type="button"
                        className="wa-botMenuItem"
                        onClick={() => handleBotFlowInsert("home_visit")}
                      >
                        Home Visit Flow
                      </button>
                      <button
                        type="button"
                        className="wa-botMenuItem"
                        onClick={() => handleBotFlowInsert("feedback")}
                      >
                        Feedback Flow
                      </button>
                    </div>
                  )}
                </div>
                <div className="wa-botMenuWrap">
                  <button
                    type="button"
                    className="wa-attachBtn"
                    onClick={handleAttachmentChoose}
                    disabled={!canReply || isSendingAttachment || isSendingReportTool || isLockedByAnotherAgent}
                    title="Upload attachment"
                  >
                    📎
                  </button>
                </div>
                <button
                  type="button"
                  className="wa-attachBtn"
                  onClick={handleSendLatestTrendReport}
                  disabled={!canReply || isSending || isUpdatingStatus || isSendingReportTool || isLockedByAnotherAgent}
                  title="Send latest trend report"
                >
                  📈
                </button>
                <button
                  type="button"
                  className="wa-attachBtn"
                  onClick={handleSendLatestReport}
                  disabled={!canReply || isSending || isUpdatingStatus || isSendingReportTool || isLockedByAnotherAgent}
                  title="Send latest report"
                >
                  🧾
                </button>

                <textarea
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  onKeyDown={(e) => {
                    // allow shortcut tab completion
                    if (e.key === "Tab") {
                      if (draftShortcut?.type === "template") {
                        e.preventDefault();
                        insertTemplateFromDraftShortcut();
                        return;
                      }
                    }

                    // send on enter
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(composerText);
                    }
                  }}
                  placeholder={
                    !selectedSession
                      ? "Select a conversation to start replying"
                      : !selectedSessionWithin24
                        ? "Reply window expired. Use a template message to reopen."
                        : isLockedByAnotherAgent
                          ? `${sessionLock?.agent_name || "Another agent"} is replying here right now`
                        : "Type a message"
                  }
                  disabled={!canReply}
                />

                <button
                  type="button"
                  className="wa-sendBtn"
                  onClick={() => handleSend(composerText)}
                  disabled={!canReply}
                >
                  ➤
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showSentReportsModal && (
        <div className="wa-modalBackdrop" role="presentation" onClick={() => !isLoadingSentReports && setShowSentReportsModal(false)}>
          <div className="wa-modalCard" role="dialog" aria-modal="true" aria-label="Sent reports list" onClick={(event) => event.stopPropagation()}>
            <div className="wa-modalHeader">
              <strong>Sent Reports</strong>
              <button
                type="button"
                className="wa-modalClose"
                onClick={() => setShowSentReportsModal(false)}
                disabled={isLoadingSentReports}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="wa-modalLookupRow">
              <input
                className="wa-modalInput"
                type="date"
                value={sentReportsDate}
                onChange={(e) => setSentReportsDate(e.target.value)}
                disabled={isLoadingSentReports}
              />
              <button
                type="button"
                className="wa-modalLookupBtn"
                onClick={() => loadSentReports(sentReportsDate)}
                disabled={isLoadingSentReports}
              >
                {isLoadingSentReports ? "Loading..." : "Load"}
              </button>
            </div>
            {sentReportsError ? <div className="wa-modalError">{sentReportsError}</div> : null}
            <div className="wa-sentReportsTableWrap">
              {sentReportsRows.length === 0 && !isLoadingSentReports ? (
                <div className="wa-empty">No sent reports for this date.</div>
              ) : (
                <table className="wa-sentReportsTable">
                  <thead>
                    <tr>
                      <th>Req No</th>
                      <th>Patient</th>
                      <th>Phone</th>
                      <th>Status Sent</th>
                      <th>Sent (IST)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sentReportsRows.map((row) => (
                      <tr key={`sr_${row?.id || row?.reqno || row?.phone || Math.random()}`}>
                        <td><strong>{String(row?.reqno || "-")}</strong></td>
                        <td>{String(row?.patient_name || "-")}</td>
                        <td>{String(row?.phone || "-")}</td>
                        <td>{String(row?.report_label || "-")}</td>
                        <td>{formatMessageTime(row?.sent_at || row?.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {showReportTemplateModal && (
        <div className="wa-modalBackdrop" role="presentation" onClick={() => !isSendingReportTemplate && setShowReportTemplateModal(false)}>
          <div className="wa-modalCard" role="dialog" aria-modal="true" aria-label="Send report template" onClick={(event) => event.stopPropagation()}>
            <div className="wa-modalHeader">
              <strong>Send Reports Template</strong>
              <button
                type="button"
                className="wa-modalClose"
                onClick={() => setShowReportTemplateModal(false)}
                disabled={isSendingReportTemplate}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <label className="wa-modalLabel">
              WhatsApp Number
              <input
                className="wa-modalInput"
                value={reportTemplatePhone}
                onChange={(e) => {
                  setReportTemplatePhone(e.target.value);
                  setReportModalError("");
                }}
                placeholder="10 or 12 digits (example: 9876543210 or 919876543210)"
                disabled={isSendingReportTemplate}
              />
            </label>

            <label className="wa-modalLabel">
              Attachment Source
              <select
                className="wa-modalInput"
                value={reportTemplateSource}
                onChange={(e) => {
                  const next = e.target.value;
                  setReportTemplateSource(next);
                  setRegisteredLookupResolvedPhone("");
                  setRegisteredLookupSummary("");
                  setReportModalError("");
                  setReportTemplateLabel(
                    next === "trend_report"
                      ? "Trend"
                      : next === "requisition_report"
                        ? "Test"
                        : "Latest"
                  );
                }}
                disabled={isSendingReportTemplate}
              >
                <option value="latest_report">Latest Report (by Registered Phone)</option>
                <option value="requisition_report">Report by Requisition No</option>
                <option value="trend_report">Trend Report by MRNO</option>
              </select>
            </label>

            {reportTemplateSource === "latest_report" && (
              <label className="wa-modalLabel">
                Registered Phone
                <div className="wa-modalLookupRow">
                  <input
                    className="wa-modalInput"
                    value={reportTemplateRegisteredPhone}
                    onChange={(e) => {
                      setReportTemplateRegisteredPhone(e.target.value);
                      setRegisteredLookupResolvedPhone("");
                      setRegisteredLookupSummary("");
                      setReportTemplatePatientName("");
                      setReportTemplateReqno("");
                      setReportTemplateMrno("");
                      setReportModalError("");
                    }}
                    placeholder="Phone used in lab registration"
                    disabled={isSendingReportTemplate || isLookingUpRegisteredPhone}
                  />
                  <button
                    type="button"
                    className="wa-inlineBtn"
                    onClick={handleLookupRegisteredPhone}
                    disabled={isSendingReportTemplate || isLookingUpRegisteredPhone}
                  >
                    {isLookingUpRegisteredPhone ? "Looking..." : "Lookup"}
                  </button>
                </div>
                {registeredLookupSummary && (
                  <span className="wa-modalLookupHint">{registeredLookupSummary}</span>
                )}
              </label>
            )}

            {reportTemplateSource === "requisition_report" && (
              <label className="wa-modalLabel">
                Requisition No
                <input
                  className="wa-modalInput"
                  value={reportTemplateReqno}
                  onChange={(e) => {
                    setReportTemplateReqno(e.target.value);
                    setRegisteredLookupResolvedPhone("");
                    setRegisteredLookupSummary("");
                    setReportModalError("");
                  }}
                  placeholder="Example: 20260421060"
                  disabled={isSendingReportTemplate}
                />
                <button
                  type="button"
                  className="wa-inlineBtn"
                  onClick={handleLookupRegisteredPhone}
                  disabled={isSendingReportTemplate || isLookingUpRegisteredPhone}
                >
                  {isLookingUpRegisteredPhone ? "Looking..." : "Lookup"}
                </button>
              </label>
            )}

            {reportTemplateSource === "trend_report" && (
              <label className="wa-modalLabel">
                MRNO
                <input
                  className="wa-modalInput"
                  value={reportTemplateMrno}
                  onChange={(e) => {
                    setReportTemplateMrno(e.target.value);
                    setRegisteredLookupResolvedPhone("");
                    setRegisteredLookupSummary("");
                    setReportModalError("");
                  }}
                  placeholder="Patient MRNO"
                  disabled={isSendingReportTemplate}
                />
                <button
                  type="button"
                  className="wa-inlineBtn"
                  onClick={handleLookupRegisteredPhone}
                  disabled={isSendingReportTemplate || isLookingUpRegisteredPhone}
                >
                  {isLookingUpRegisteredPhone ? "Looking..." : "Lookup"}
                </button>
              </label>
            )}

            <label className="wa-modalLabel">
              Patient Name ({`{{1}}`})
              <input
                className="wa-modalInput"
                value={reportTemplatePatientName}
                onChange={(e) => {
                  setReportTemplatePatientName(e.target.value);
                  setReportModalError("");
                }}
                placeholder="Patient name"
                disabled={isSendingReportTemplate}
              />
            </label>

            <div className="wa-modalLabel">
              Template report label ({`{{2}}`}): <strong>{reportTemplateLabel || "Report"}</strong>
            </div>

            <div className="wa-modalTemplatePreview">
              {reportTemplatePreviewText}
            </div>

            {reportAuthorizationRequired && (
              <>
            {reportAuthorizationRequired && (
              <>
                <label className="wa-modalLabel">
                  <span className="wa-modalCheck">
                    <input
                      type="checkbox"
                      checked={reportAuthConfirmed}
                      onChange={(e) => {
                        setReportAuthConfirmed(Boolean(e.target.checked));
                        setReportModalError("");
                      }}
                      disabled={isSendingReportTemplate}
                    />
                    Recipient is authorized to receive reports on patient behalf
                  </span>
                </label>

                <label className="wa-modalLabel">
                  Confirmation Type
                  <select
                    className="wa-modalInput"
                    value={reportAuthType}
                    onChange={(e) => {
                      setReportAuthType(e.target.value);
                      setReportModalError("");
                    }}
                    disabled={isSendingReportTemplate}
                  >
                    <option value="">Select confirmation type</option>
                    <option value="bill_sent">Bill Sent</option>
                    <option value="req_phone_name_confirmed">Req No + Phone/Name Confirmed</option>
                    <option value="patient_direct_confirmation">Patient Directly Confirmed</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label className="wa-modalLabel">
                  Confirmation Evidence
                  <input
                    className="wa-modalInput"
                    value={reportAuthEvidence}
                    onChange={(e) => {
                      setReportAuthEvidence(e.target.value);
                      setReportModalError("");
                    }}
                    placeholder='Example: "Bill sent to +9183xxxx" or "ReqNo 20260421060 + name confirmed"'
                    disabled={isSendingReportTemplate}
                  />
                </label>
              </>
            )}
              </>
            )}

            {reportModalError && <div className="wa-modalError">{reportModalError}</div>}
            <div className="wa-modalWarn">
              This sends report PDF + template. Privacy check is mandatory and this send is audit logged.
            </div>

            <div className="wa-modalActions">
              <button
                type="button"
                className="wa-inlineBtn"
                onClick={() => setShowReportTemplateModal(false)}
                disabled={isSendingReportTemplate}
              >
                Cancel
              </button>
              <button
                type="button"
                className="wa-inlineBtn is-primary"
                onClick={handleSendReportTemplate}
                disabled={isSendingReportTemplate || !reportTemplateReadyToSend}
              >
                {isSendingReportTemplate ? "Sending..." : "Send Template"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .wa-loading {
          min-height: 100vh;
          display: grid;
          place-items: center;
          color: #33465f;
          font-weight: 600;
        }

        .wa-root {
          min-height: 100vh;
          background: linear-gradient(180deg, #0d1726 0%, #111827 100%);
          padding: 0;
          box-sizing: border-box;
        }

        .wa-root.with-shortcut {
          padding-top: 56px;
        }

        .wa-root.with-shortcut .wa-frame {
          height: calc(100vh - 56px);
        }

        .wa-frame {
          max-width: 1480px;
          height: calc(100vh - 32px);
          margin: 0 auto;
          background: #0f1a2d;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 18px 40px rgba(2, 8, 20, 0.45);
          display: grid;
          grid-template-rows: auto 1fr;
        }

        .wa-frame.is-no-header {
          grid-template-rows: 1fr;
        }

        .wa-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .wa-logoLink {
          display: inline-flex;
          border-radius: 10px;
          text-decoration: none;
        }

        .wa-logo {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          object-fit: contain;
          background: #fff;
          border: 1px solid #e0e7f0;
          padding: 4px;
        }

        .wa-headerActions {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
        }

        .wa-shortActions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .wa-shortPresence {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .wa-shortBtn {
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          border-radius: 10px;
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 600;
          line-height: 1;
          text-decoration: none;
          cursor: pointer;
        }

        .wa-shortBtn.is-reports {
          border-color: rgba(126, 244, 215, 0.6);
          background: rgba(16, 185, 129, 0.2);
        }

        .wa-leftPanelTools {
          padding: 8px 10px 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: #111b2f;
        }

        .wa-leftHeaderCompact {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 24px;
        }

        .wa-leftTitleMini {
          font-size: 13px;
          font-weight: 700;
          color: #f8fafc;
          letter-spacing: 0.01em;
        }

        .wa-leftNumberMini {
          font-size: 11px;
          color: rgba(248, 250, 252, 0.72);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
          flex: 1;
        }

        .wa-leftQuickTools {
          display: inline-flex;
          gap: 6px;
          margin-left: auto;
        }

        .wa-iconToolBtn {
          width: 26px;
          height: 26px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          line-height: 1;
          cursor: pointer;
          padding: 0;
        }

        .wa-iconToolBtn.is-active {
          background: #1faa6f;
          border-color: #1faa6f;
          color: #081021;
        }

        .wa-leftPanelTools input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 10px;
          padding: 0 12px;
          height: 34px;
          font-size: 14px;
          outline: none;
          background: rgba(7, 12, 22, 0.55);
          color: #f8fafc;
        }

        .wa-leftPanelTools input:focus {
          border-color: rgba(126, 244, 215, 0.55);
          box-shadow: 0 0 0 3px rgba(126, 244, 215, 0.12);
        }

        .wa-ownerSearchRow {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: nowrap;
          justify-content: space-between;
          width: 100%;
          min-width: 0;
        }

        .wa-ownerTabs {
          flex: 1 1 0;
          min-width: 0;
        }

        .wa-ownerSearchTools {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex: 1 1 0;
          justify-content: flex-end;
        }

        .wa-ownerSearchInput {
          flex: 1 1 auto;
          width: 100% !important;
          min-width: 120px;
          max-width: 260px;
        }

        .wa-ownerSearchAddBtn {
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.5);
          background: rgba(71, 85, 105, 0.35);
          color: #cbd5e1;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
        }

        .wa-ownerSearchAddBtn.is-ready {
          border-color: rgba(34, 197, 94, 0.7);
          background: rgba(34, 197, 94, 0.26);
          color: #dcfce7;
        }

        .wa-ownerSearchAddBtn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .wa-ownerSearchOpenBtn {
          height: 34px;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.5);
          background: rgba(59, 130, 246, 0.2);
          color: #dbeafe;
          font-size: 12px;
          font-weight: 700;
          padding: 0 10px;
          cursor: pointer;
          white-space: nowrap;
        }

        .wa-leftMeta {
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: flex-start;
          display: none;
        }

        .wa-leftMeta.is-open {
          display: flex;
        }

        .wa-metaToggle {
          height: 28px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          padding: 0 10px;
          font-size: 12px;
          font-weight: 700;
          width: fit-content;
          cursor: pointer;
        }

        .wa-stateLegend {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-start;
          max-width: 100%;
          margin-left: 0;
        }

        .wa-stateLegendTitle {
          font-size: 11px;
          font-weight: 700;
          color: #58708a;
          margin-right: 2px;
        }

        .wa-stateLegendName {
          font-size: 11px;
          font-weight: 700;
          border-radius: 999px;
          padding: 1px 8px;
          border: 1px solid transparent;
          white-space: nowrap;
        }

        .wa-stateLegendName.is-lead {
          color: #1f5fbf;
          background: #e7efff;
          border-color: #d4e2f8;
        }

        .wa-stateLegendName.is-patient {
          color: #1f7a4d;
          background: #e9f9ef;
          border-color: #cdebd7;
        }

        .wa-agentSummaryCompact {
          display: inline-flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
        }

        .wa-agentSummaryChip {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 700;
          border: 1px solid transparent;
          line-height: 1.4;
        }

        .wa-agentSummaryChip.is-online {
          color: #14532d;
          background: #dcfce7;
          border-color: #86efac;
        }

        .wa-agentSummaryChip.is-away {
          color: #7c2d12;
          background: #ffedd5;
          border-color: #fdba74;
        }

        .wa-agentSummaryChip.is-offline {
          color: #334155;
          background: #e2e8f0;
          border-color: #cbd5e1;
        }

        .wa-presenceWrap {
          display: inline-flex;
          gap: 6px;
          align-items: center;
          flex-wrap: wrap;
          max-width: 100%;
        }

        .wa-presenceChip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 999px;
          padding: 3px 8px;
          font-size: 11px;
          font-weight: 700;
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.08);
        }

        .wa-presenceDot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #94a3b8;
        }

        .wa-presenceChip.is-online .wa-presenceDot {
          background: #16a34a;
        }

        .wa-presenceChip.is-away .wa-presenceDot {
          background: #d97706;
        }

        .wa-presenceChip.is-offline .wa-presenceDot {
          background: #94a3b8;
        }

        .wa-backBtn {
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          line-height: 1;
        }

        .wa-sidebarHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          background: #111b2f;
        }

        .wa-sidebarHeader h1 {
          margin: 0;
          font-size: 20px;
          color: #f8fafc;
          display: inline-flex;
          align-items: baseline;
          gap: 8px;
        }

        .wa-sidebarHeader p {
          margin: 4px 0 0;
          font-size: 13px;
          color: rgba(248, 250, 252, 0.78);
        }

        .wa-titleSub {
          font-size: 12px;
          font-weight: 500;
          color: rgba(248, 250, 252, 0.62);
        }

        .wa-sidebarHeader button {
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .wa-tabs {
          display: flex;
          gap: 8px;
        }

        .wa-tabs button,
        .wa-messageFilterBar button {
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          height: 30px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: #f8fafc;
          cursor: pointer;
        }

        .wa-tabCount {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 16px;
          height: 16px;
          border-radius: 999px;
          padding: 0 4px;
          font-size: 10px;
          line-height: 1;
          font-weight: 700;
          color: #fff;
          background: #64748b;
        }

        .wa-tabCount.is-red {
          background: #dc2626;
        }

        .wa-tabCount.is-yellow {
          background: #ca8a04;
          color: #111827;
        }

        .wa-tabs button.is-active,
        .wa-messageFilterBar button.is-active {
          background: #1faa6f;
          border-color: #1faa6f;
          color: #081021;
        }

        .wa-messageFilterBar {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding: 0;
          border-bottom: 0;
          background: transparent;
          font-size: 12px;
          color: rgba(248, 250, 252, 0.72);
        }

        .wa-botToggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-left: 6px;
          font-size: 12px;
          font-weight: 600;
          color: #42546d;
          user-select: none;
          cursor: pointer;
        }

        .wa-botToggle input {
          accent-color: #0f7f85;
        }

        .wa-conversationNameWrap {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          column-gap: 8px;
          width: 100%;
          min-width: 0;
        }

        .wa-conversationNameText {
          font-weight: 500;
          font-size: 13px;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .wa-conversationNameText.is-lead {
          color: #1f5fbf;
        }

        .wa-conversationNameText.is-patient {
          color: #1f7a4d;
        }

        .wa-conversationNameFlags {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          flex: 0 0 auto;
          justify-self: end;
          white-space: nowrap;
        }

        .wa-stateDot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          border: 1px solid transparent;
          display: inline-block;
          flex: 0 0 10px;
        }

        .wa-stateDot.is-unread {
          background: #d98800;
          border-color: #bf7600;
        }

        .wa-stateDot.is-pending {
          background: #2f6fd6;
          border-color: #245ab0;
        }

        .wa-stateDot.is-resolved {
          background: #1f9d5b;
          border-color: #19804b;
        }

        .wa-stateDot.is-expired {
          background: #d14343;
          border-color: #a93737;
        }

        .wa-stateDot.is-active {
          background: #6b7280;
          border-color: #4b5563;
        }

        .wa-stateDot.is-closed {
          background: #64748b;
          border-color: #475569;
        }

        .wa-conversationInfoText {
          color: rgba(248, 250, 252, 0.76);
          font-size: 13px;
        }

        .wa-unread {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 22px;
          height: 22px;
          padding: 0 6px;
          border-radius: 999px;
          background: #cf1322;
          color: #ffffff;
          font-size: 12px;
          font-weight: 800;
          line-height: 1;
          box-shadow: 0 0 0 2px #ffffff;
          flex: 0 0 auto;
        }

        .cs-conversation.cs-state-unread .wa-conversationNameText,
        .cs-conversation.cs-state-pending .wa-conversationNameText {
          font-weight: 700;
        }

        .wa-status {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
        }

        .wa-status.is-live {
          background: #e8f8ef;
          color: #136b3f;
        }

        .wa-status.is-expired {
          background: #fff1dd;
          color: #925600;
        }

        .wa-status.is-patient {
          background: #e6f8ef;
          color: #1f7a4d;
        }

        .wa-status.is-lead {
          background: #e7efff;
          color: #1f5fbf;
        }

        .wa-status.is-pending {
          background: #eef3fb;
          color: #344d76;
          text-transform: capitalize;
        }

        .wa-status.is-resolved {
          background: #eaf9f1;
          color: #1f7a4d;
          text-transform: capitalize;
        }

        .wa-status.is-closed {
          background: #f4f5f7;
          color: #4a5568;
          text-transform: capitalize;
        }

        .wa-status.is-locked {
          background: #fff4e5;
          color: #9a5d00;
        }

        .wa-stateFlag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 1px 8px;
          border-radius: 999px;
          border: 1px solid transparent;
          font-size: 10px;
          font-weight: 800;
          line-height: 1.5;
          letter-spacing: 0.01em;
          white-space: nowrap;
        }

        .wa-stateFlag::before {
          content: "";
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #9aa7b8;
          flex: 0 0 auto;
        }

        .wa-stateFlag.is-unread {
          background: #fff4dc;
          border-color: #f0dbad;
          color: #8a5600;
        }

        .wa-stateFlag.is-unread::before {
          background: #d98800;
        }

        .wa-stateFlag.is-pending {
          background: #edf4ff;
          border-color: #d4e2f8;
          color: #2b4f87;
        }

        .wa-stateFlag.is-pending::before {
          background: #2f6fd6;
        }

        .wa-stateFlag.is-resolved {
          background: #e9f9ef;
          border-color: #cdebd7;
          color: #1f6f46;
        }

        .wa-stateFlag.is-resolved::before {
          background: #1f9d5b;
        }

        .wa-stateFlag.is-active {
          background: #f2f4f7;
          border-color: #dde2e8;
          color: #3f4a5a;
        }

        .wa-stateFlag.is-active::before {
          background: #6b7280;
        }

        .wa-stateFlag.is-closed {
          background: #eef2f7;
          border-color: #d5dce6;
          color: #425063;
        }

        .wa-stateFlag.is-closed::before {
          background: #64748b;
        }

        .wa-stateFlag.is-expired {
          background: #fbeeee;
          border-color: #f1d2d2;
          color: #8b2f2f;
        }

        .wa-stateFlag.is-expired::before {
          background: #d14343;
        }

        .wa-sessionActionBar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          background: #111b2f;
          padding: 10px 12px;
          flex-wrap: wrap;
        }

        .wa-ownNumber {
          margin-top: 1px;
          font-size: 12px;
          color: rgba(248, 250, 252, 0.72);
          font-weight: 600;
        }

        .wa-sessionActionInfo {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .wa-sessionName {
          font-size: 13px;
          font-weight: 700;
          color: #f8fafc;
        }

        .wa-sessionPhone {
          border: 1px dashed rgba(148, 163, 184, 0.55);
          background: rgba(148, 163, 184, 0.14);
          color: #e2e8f0;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.01em;
          padding: 3px 10px;
          cursor: pointer;
          max-width: 170px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .wa-sessionPhone:hover {
          background: rgba(148, 163, 184, 0.22);
        }

        .wa-identityWrap {
          position: relative;
          display: inline-flex;
          align-items: center;
        }

        .wa-identityIcon {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 1px solid #b7c6db;
          color: #3f5677;
          background: #f7faff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          cursor: help;
        }

        .wa-namePopover {
          position: absolute;
          top: 24px;
          left: 0;
          min-width: 180px;
          background: #fff;
          border: 1px solid #d5deeb;
          border-radius: 8px;
          box-shadow: 0 8px 18px rgba(20, 32, 52, 0.14);
          padding: 8px;
          display: none;
          z-index: 1200;
          font-size: 12px;
          color: #2a3e59;
          white-space: normal;
        }

        .wa-namePopover.is-open {
          display: block;
        }

        .wa-namePopover.is-compact {
          left: auto;
          right: 0;
        }

        .wa-namePopover strong {
          display: block;
          margin-bottom: 6px;
          font-size: 11px;
          color: #516680;
        }

        .wa-nameRow {
          display: block;
          margin: 2px 0;
          font-weight: 600;
        }

        .wa-nameRow.is-lead {
          color: #1f5fbf;
        }

        .wa-nameRow.is-patient {
          color: #1f7a4d;
        }

        .wa-sidebarLegend {
          border-top: 1px solid #e1e7f1;
          padding: 8px 10px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
          font-size: 11px;
        }

        .wa-legendTitle {
          color: #5e7087;
          font-weight: 700;
        }

        .wa-legendItem {
          font-weight: 700;
        }

        .wa-legendItem.is-lead {
          color: #1f5fbf;
        }

        .wa-legendItem.is-patient {
          color: #1f7a4d;
        }

        .wa-actionBtns {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
        }

        .wa-actionBtns button {
          height: 28px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          padding: 0 10px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }

        .wa-actionBtns button.is-active {
          background: #1faa6f;
          color: #081021;
          border-color: #1faa6f;
        }

        .wa-actionBtns button.danger {
          border-color: #f3c1c1;
          color: #9b2c2c;
        }

        .wa-actionBtns button.danger.is-active {
          background: #9b2c2c;
          color: #fff;
          border-color: #9b2c2c;
        }

        .wa-actionBtns button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .wa-actionBtns .wa-inlineSelect,
        .wa-actionBtns .wa-inlineBtn {
          height: 28px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 700;
        }

        .wa-empty {
          text-align: center;
          color: #62738b;
          font-size: 14px;
          padding: 28px 12px;
        }

        .wa-expiredBanner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid #f3d9ad;
          background: #fff7e8;
          padding: 10px 12px;
        }

        .wa-expiredText {
          color: #7a4a00;
          font-size: 12px;
          line-height: 1.4;
        }

        .wa-expiredActions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .wa-expiredActions button {
          height: 28px;
          border-radius: 8px;
          border: 1px solid #e0c28c;
          background: #fff;
          color: #724600;
          padding: 0 10px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }

        .wa-expiredActions button.danger {
          background: #9b2c2c;
          color: #fff;
          border-color: #9b2c2c;
        }

        .wa-expiredActions button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .wa-resolveMenu {
          margin: 10px 12px 0;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 10px;
          background: rgba(15, 27, 47, 0.92);
          padding: 10px;
          display: grid;
          gap: 8px;
        }

        .wa-resolveMenuTitle {
          font-size: 12px;
          font-weight: 700;
          color: #f8fafc;
        }

        .wa-resolveMenu select,
        .wa-resolveMenu textarea {
          width: 100%;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          background: rgba(7, 12, 22, 0.55);
          color: #f8fafc;
          padding: 8px 10px;
          font-size: 12px;
          outline: none;
        }

        .wa-resolveMenu textarea {
          min-height: 64px;
          resize: vertical;
        }

        .wa-resolveMenuActions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .wa-resolveMenuActions button {
          height: 30px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          padding: 0 10px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .wa-resolveMenuActions button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .wa-mobileBackBtn {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid #cfd9e6;
          background: #f7fbff;
          color: #294365;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          flex: 0 0 34px;
        }

        .wa-msgRow {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          margin: 8px 0;
        }

        .wa-historyHint {
          margin: 4px auto 8px;
          padding: 6px 10px;
          border: 1px solid #dbe5f2;
          border-radius: 999px;
          font-size: 11px;
          color: #51657f;
          background: #f7faff;
          width: fit-content;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .wa-historyLoadBtn {
          border: 1px solid #c3d2e5;
          background: #fff;
          color: #304d70;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 8px;
          cursor: pointer;
        }

        .wa-msgRow.is-out {
          justify-content: flex-end;
        }

        .wa-msgRow.is-in {
          justify-content: flex-start;
        }

        .wa-msgRow.is-status {
          justify-content: center;
        }

        .wa-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          flex: 0 0 28px;
          overflow: hidden;
        }

        .wa-avatarPatient {
          background: #1f2f45;
          color: #ffffff;
        }

        .wa-avatarLab {
          background: #ffffff;
          border: 1px solid #d0d9e6;
        }

        .wa-avatarLab img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .wa-msgBubble {
          max-width: min(72%, 720px);
          border-radius: 12px;
          padding: 8px 10px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
          line-height: 1.35;
        }

        .wa-msgBubble.is-in {
          background: #ffffff;
          color: #152238;
          border: 1px solid rgba(15, 47, 74, 0.08);
          border-bottom-left-radius: 4px;
        }

        .wa-msgBubble.is-out {
          background: #d8fdd2;
          color: #17311d;
          border: 1px solid #bfe6a7;
          border-bottom-right-radius: 4px;
        }

        .wa-msgBubble.is-out.is-bot {
          background: #d8fdd2;
          border-color: #bfe6a7;
          color: #17311d;
        }

        .wa-msgBubble.is-status {
          background: #fff8e8;
          color: #6c4a00;
          border: 1px solid #efd9a1;
          border-radius: 14px;
          max-width: min(82%, 760px);
        }

        .wa-msgMeta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 4px;
          font-size: 11px;
        }

        .wa-msgBubble.is-in .wa-msgMeta {
          color: #5a6b83;
        }

        .wa-msgBubble.is-out .wa-msgMeta {
          color: rgba(23, 49, 29, 0.72);
        }

        .wa-msgBubble.is-status .wa-msgMeta {
          color: #8a5a00;
        }

        .wa-msgSender {
          font-weight: 700;
        }

        .wa-msgTime {
          white-space: nowrap;
        }

        .wa-msgDelivery {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 16px;
          padding: 1px 6px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          line-height: 1;
          letter-spacing: 0;
          user-select: none;
          border: 1px solid transparent;
        }

        .wa-msgDelivery.is-sent {
          color: #5f6a7a;
          background: rgba(95, 106, 122, 0.12);
          border-color: rgba(95, 106, 122, 0.22);
        }

        .wa-msgDelivery.is-delivered {
          color: #1f6d49;
          background: rgba(31, 109, 73, 0.12);
          border-color: rgba(31, 109, 73, 0.22);
        }

        .wa-msgDelivery.is-read {
          color: #1992ff;
          background: rgba(25, 146, 255, 0.14);
          border-color: rgba(25, 146, 255, 0.24);
        }

        .wa-msgDelivery.is-failed {
          color: #cc3b3b;
          background: rgba(204, 59, 59, 0.14);
          border-color: rgba(204, 59, 59, 0.24);
        }

        .wa-msgSimFlag {
          font-size: 12px;
          line-height: 1;
        }

        .wa-msgText {
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 13px;
        }

        .wa-msgBubble.is-out.is-bot .wa-msgText {
          font-size: 13px;
        }

        .wa-locationInline {
          user-select: text;
        }

        .wa-locationInlineHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 4px;
        }

        .wa-locationInlineTitle {
          font-weight: 800;
          font-size: 12px;
        }

        .wa-locationInlineTools {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .wa-locationInlineIconBtn {
          border: 0;
          background: transparent;
          color: inherit;
          text-decoration: none;
          font-size: 13px;
          line-height: 1;
          cursor: pointer;
          opacity: 0.9;
          padding: 0;
        }

        .wa-locationInlineIconBtn:hover {
          opacity: 1;
        }

        .wa-locationInlineIconBtn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .wa-locationInlineBody {
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.45;
        }

        .wa-msgAttachment {
          margin-top: 8px;
        }

        .wa-msgAttachmentImage {
          max-width: 220px;
          max-height: 220px;
          border-radius: 8px;
          border: 1px solid #d0d9e6;
          display: block;
          object-fit: cover;
          background: #ffffff;
        }

        .wa-msgAttachmentLink {
          display: inline-block;
          font-size: 12px;
          font-weight: 700;
          color: #0f7f85;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .wa-error {
          border-top: 1px solid #f0d4d4;
          background: #fff5f5;
          color: #b42318;
          font-size: 12px;
          font-weight: 600;
          padding: 8px 12px;
        }

        .wa-composerActions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
          padding: 8px 10px;
          border-top: 1px solid #e0e7f0;
          border-bottom: 1px solid #e0e7f0;
          background: #f7fbff;
        }

        .wa-composerActionGroup {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .wa-inlineSelect {
          height: 30px;
          border-radius: 8px;
          border: 1px solid #c8d6ea;
          background: #fff;
          color: #294365;
          font-size: 12px;
          padding: 0 10px;
        }

        .wa-inlineBtn {
          height: 30px;
          border-radius: 8px;
          border: 1px solid #0f7f85;
          background: #0f7f85;
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          padding: 0 12px;
          cursor: pointer;
        }

        .wa-inlineBtnSecondary {
          border-color: #c8d6ea;
          background: #fff;
          color: #294365;
        }

        .wa-inlineBtn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .wa-inlineBtn.is-primary {
          border-color: #0f7f85;
          background: #0f7f85;
          color: #fff;
        }

        .wa-modalBackdrop {
          position: fixed;
          inset: 0;
          z-index: 1200;
          background: rgba(3, 10, 21, 0.68);
          display: grid;
          place-items: center;
          padding: 16px;
          overflow-y: auto;
        }

        .wa-modalCard {
          width: min(560px, 100%);
          background: #12203a;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 12px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.42);
          padding: 14px;
          display: grid;
          gap: 10px;
          max-height: calc(100vh - 32px);
          overflow-y: auto;
        }

        .wa-modalHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #f8fafc;
          font-size: 14px;
        }

        .wa-modalClose {
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: transparent;
          color: #f8fafc;
          border-radius: 8px;
          width: 28px;
          height: 28px;
          cursor: pointer;
        }

        .wa-modalLabel {
          display: grid;
          gap: 6px;
          color: rgba(248, 250, 252, 0.88);
          font-size: 12px;
          font-weight: 600;
        }

        .wa-modalCheck {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
        }

        .wa-modalInput {
          width: 100%;
          border-radius: 8px;
          border: 1px solid rgba(159, 184, 214, 0.36);
          background: #0f1a2d;
          color: #f8fafc;
          padding: 10px;
          font-size: 13px;
        }

        .wa-modalTemplatePreview {
          white-space: pre-wrap;
          border-radius: 8px;
          border: 1px solid rgba(159, 184, 214, 0.3);
          background: rgba(15, 26, 45, 0.66);
          color: rgba(226, 232, 240, 0.92);
          padding: 10px;
          font-size: 12px;
          line-height: 1.5;
        }

        .wa-modalWarn {
          border-radius: 8px;
          border: 1px solid rgba(245, 158, 11, 0.32);
          background: rgba(120, 53, 15, 0.35);
          color: #fde68a;
          padding: 8px 10px;
          font-size: 12px;
        }

        .wa-modalLookupRow {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
          align-items: center;
        }

        .wa-modalLookupHint {
          font-size: 12px;
          color: #4ade80;
          font-weight: 700;
        }

        .wa-modalError {
          border-radius: 8px;
          border: 1px solid rgba(248, 113, 113, 0.45);
          background: rgba(127, 29, 29, 0.45);
          color: #fecaca;
          padding: 8px 10px;
          font-size: 12px;
          font-weight: 700;
        }

        .wa-modalActions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .wa-sentReportsTableWrap {
          border: 1px solid rgba(159, 184, 214, 0.28);
          border-radius: 10px;
          overflow: auto;
          max-height: 52vh;
        }

        .wa-sentReportsTable {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .wa-sentReportsTable th,
        .wa-sentReportsTable td {
          padding: 8px 10px;
          border-bottom: 1px solid rgba(159, 184, 214, 0.22);
          text-align: left;
          color: #e2e8f0;
        }

        .wa-sentReportsTable th {
          position: sticky;
          top: 0;
          background: #0f1a2d;
          z-index: 1;
        }

        .wa-shortcutHintBar {
          font-size: 12px;
          color: #546a86;
          font-weight: 600;
          padding: 4px 10px;
          border-top: 1px solid #e0e7f0;
          background: #f8fbff;
        }

        .wa-inlineHint {
          font-size: 12px;
          color: #2d4f77;
          padding: 4px 10px;
          background: #eef5ff;
          border-top: 1px solid #d9e7fb;
        }

        .wa-inlineHint.is-soft {
          color: #5f7490;
          background: #f5f8fc;
          border-top-color: #e1e9f4;
        }

        .wa-hiddenFileInput {
          position: absolute;
          width: 1px;
          left: -9999px;
        }

        .wa-composerQuickActions {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 8px;
          padding: 6px 10px 0;
          background: #fff;
        }

        .wa-attachQuickBtn {
          height: 30px;
          border-radius: 8px;
          border: 1px solid #c7d5e9;
          background: #f4f8ff;
          color: #2b4668;
          font-size: 12px;
          font-weight: 700;
          padding: 0 12px;
          cursor: pointer;
        }

        .wa-attachQuickBtn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .wa-customComposer {
          display: flex;
          align-items: center;
          gap: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          padding: 10px;
          background: #111b2f;
          flex: 0 0 auto;
        }

        .wa-botMenuWrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .wa-botMenu {
          position: absolute;
          bottom: 44px;
          left: 0;
          min-width: 180px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 8px;
          background: #ffffff;
          border: 1px solid #d7e1ef;
          border-radius: 10px;
          box-shadow: 0 12px 30px rgba(15, 47, 74, 0.18);
          z-index: 20;
        }

        .wa-botMenu.is-wide {
          min-width: 300px;
          max-width: 340px;
        }

        .wa-botMenuItem {
          height: 34px;
          border-radius: 8px;
          border: 1px solid #d6dfeb;
          background: #f7fbff;
          color: #1e3a5a;
          font-size: 13px;
          font-weight: 700;
          padding: 0 10px;
          text-align: left;
          cursor: pointer;
        }


        .wa-botMenuItem.is-secondary {
          color: #0f7f85;
          background: #edf9f9;
          border-color: #bde2e4;
        }

        .wa-customComposer textarea {
          flex: 1;
          resize: none;
          height: 40px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(7, 12, 22, 0.55);
          color: #f8fafc;
          padding: 8px 10px;
          font-size: 13px;
          outline: none;
        }

        .wa-attachBtn,
        .wa-sendBtn {
          height: 36px;
          width: 36px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          cursor: pointer;
        }
        .cs-main-container {
          border-radius: 0;
          border: 0;
          flex: 1;
          min-height: 0;
        }

        .wa-chatCol {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }

        .wa-chatTop {
          flex: 0 0 auto;
          position: relative;
          z-index: 2;
          background: #111b2f;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .wa-chatBody {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .wa-chatBody .cs-chat-container {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }

        .wa-main {
          display: flex;
          flex: 1;
          min-height: 0;
          background: #111b2f;
        }

        .wa-sidebar {
          width: 360px;
          border-right: 1px solid rgba(255, 255, 255, 0.1);
          background: #111b2f;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .wa-conversationList {
          flex: 1;
          overflow-y: auto;
          min-height: 0;
        }

        .wa-loadMoreWrap {
          padding: 10px 12px 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          background: #111b2f;
        }

        .wa-loadMoreSessions {
          width: 100%;
          min-height: 40px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 8px 18px rgba(2, 8, 20, 0.2);
        }

        .wa-loadMoreSessions:disabled {
          opacity: 0.72;
          cursor: progress;
        }

        .wa-contactIconBtn {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 0;
          background: transparent;
          color: #42546d;
          font-size: 12px;
          font-weight: 700;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex: 0 0 auto;
          padding: 0;
        }

        .wa-contactIconVisual {
          position: relative;
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .wa-contactIconRing {
          position: relative;
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 2px solid #3f434a;
          background: #f5f3ef;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .wa-contactIconHead {
          position: absolute;
          top: 6px;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #3a3a3a;
        }

        .wa-contactIconBody {
          position: absolute;
          bottom: 4px;
          width: 14px;
          height: 8px;
          border-radius: 10px 10px 4px 4px;
          background: #3a3a3a;
        }

        .wa-contactIconBadge {
          position: absolute;
          right: -1px;
          bottom: -1px;
          min-width: 12px;
          height: 12px;
          padding: 0 2px;
          border-radius: 999px;
          border: 1px solid #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          font-weight: 800;
          line-height: 1;
          color: #ffffff;
          background: #0f7f85;
        }

        .wa-contactIconBadge.is-saved {
          background: #1f7a4d;
        }

        .wa-contactIconBtn.is-compact {
          width: 32px;
          height: 32px;
        }

        .wa-contactIconBtn:disabled {
          opacity: 0.7;
          cursor: progress;
        }

        .wa-contactMiniTag {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 18px;
          padding: 0 6px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          margin-right: 6px;
        }

        .wa-contactMiniTag.is-patient {
          background: #eaf9f1;
          color: #1f7a4d;
        }

        .wa-contactMiniTag.is-lead {
          background: #e7efff;
          color: #1f5fbf;
        }

        .wa-conversation {
          padding: 8px 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          cursor: pointer;
        }

        .wa-conversation:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        .wa-conversation.is-active {
          background: #1d293f;
          color: #f8fafc;
        }

        .wa-messageList {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 8px;
          background: linear-gradient(180deg, #0f1a2d 0%, #101b2f 100%);
        }
          
        .cs-sidebar {
          border-right: 1px solid #e0e7f0;
          max-width: 390px;
          min-width: 320px;
          background: #f9fbfd;
        }

        .cs-conversation {
          border-radius: 10px;
          margin: 6px 8px;
          border: 1px solid transparent;
        }

        .cs-conversation .cs-conversation__name {
          font-weight: 500;
        }

        .cs-conversation.cs-conversation--unread .cs-conversation__info {
          font-weight: 700;
        }

        .cs-conversation:hover {
          background: #f4f7fc;
          border-color: #d9e1ed;
        }

        .cs-conversation--active {
          background: #1e2c40;
          color: #fff;
          border-color: #1e2c40;
        }

        .cs-conversation--active .cs-conversation__info,
        .cs-conversation--active .cs-conversation__name {
          color: #ffffff;
        }

        .cs-message-list {
          background: linear-gradient(180deg, #f7fafe 0%, #ffffff 100%);
        }

        .cs-message-list__scroll-wrapper {
          padding: 8px;
        }

        .cs-message-input {
          border-top: 1px solid #e0e7f0;
          padding: 10px;
          background: #fff;
        }

        .cs-message-input__content-editor-wrapper {
          border-radius: 10px;
          border: 1px solid #d0d9e6;
        }

        .cs-message-input__content-editor-wrapper:focus-within {
          border-color: #8ea0b7;
          box-shadow: 0 0 0 3px rgba(142, 160, 183, 0.15);
        }

        .cs-button--send {
          color: #1c2a3d;
        }

        @media (max-width: 900px) {
          .wa-headerActions {
            display: none;
          }

          .wa-shortActions {
            display: none;
          }

          .wa-frame {
            height: 100dvh;
            min-height: 100dvh;
            border-radius: 0;
            border-left: 0;
            border-right: 0;
            box-shadow: none;
            background: #efeae2;
          }

          .wa-root {
            padding: 0;
            background: #efeae2;
          }

          .wa-root.with-shortcut {
            padding-top: 56px;
          }

          .wa-root.with-shortcut .wa-frame {
            height: calc(100dvh - 56px);
            min-height: calc(100dvh - 56px);
          }

          .wa-frame.is-mobile-chat .wa-sidebarHeader {
            display: none;
          }

          .wa-sidebarHeader {
            flex-wrap: wrap;
            gap: 10px;
            padding: 12px;
            position: sticky;
            top: 0;
            z-index: 5;
          }

          .wa-brand {
            width: 100%;
            min-width: 0;
            align-items: flex-start;
          }

          .wa-logo {
            width: 32px;
            height: 32px;
          }

          .wa-sidebarHeader h1 {
            font-size: 18px;
            flex-wrap: wrap;
            row-gap: 4px;
          }

          .wa-sidebarHeader p,
          .wa-ownNumber {
            font-size: 12px;
          }

          .wa-headerActions {
            width: 100%;
            justify-content: flex-start;
            overflow-x: auto;
            white-space: nowrap;
            padding-bottom: 2px;
            -webkit-overflow-scrolling: touch;
          }

          .wa-headerActions a,
          .wa-headerActions button {
            flex: 0 0 auto;
          }

          .wa-main {
            display: block;
            background: #efeae2;
          }

          .wa-main.is-mobile-list .wa-chatCol,
          .wa-main.is-mobile-chat .wa-sidebar {
            display: none;
          }

          .wa-main.is-mobile-list .wa-sidebar,
          .wa-main.is-mobile-chat .wa-chatCol {
            display: flex;
            width: 100%;
            max-width: 100%;
            min-width: 0;
            border-right: 0;
          }

          .wa-sidebar {
            width: 100%;
            background: #f7f8fa;
            display: flex;
            flex-direction: column;
            min-height: 0;
            height: 100%;
            overflow: hidden;
          }

          .wa-leftPanelTools {
            position: sticky;
            top: 0;
            z-index: 3;
            background: #f7f8fa;
            padding: 12px 12px 10px;
            box-shadow: 0 1px 0 rgba(224, 231, 240, 0.9);
          }

          .wa-leftMeta {
            display: none;
          }

          .wa-metaToggle {
            display: none;
          }

          .wa-stateLegend {
            width: 100%;
            justify-content: flex-start;
            margin-left: 0;
          }

          .cs-main-container {
            display: flex !important;
            flex-direction: column !important;
          }

          .cs-sidebar {
            max-width: 100%;
            width: 100%;
            min-width: 0;
            flex: 0 0 42vh;
          }

          .wa-chatCol {
            flex: 1 1 auto !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0;
            min-height: 0;
            height: 100%;
            max-height: 100%;
            overflow: hidden;
            background:
              radial-gradient(circle at top right, rgba(255,255,255,0.55), transparent 32%),
              #e8ddd0;
          }

          .wa-chatTop {
            position: sticky;
            top: 0;
            z-index: 4;
            background: #0f7f85;
            border-bottom: 0;
            box-shadow: 0 6px 18px rgba(15, 47, 74, 0.18);
          }

          .cs-sidebar,
          .wa-chatCol,
          .wa-chatBody .cs-chat-container {
            flex-basis: auto !important;
            width: 100% !important;
            min-width: 0;
          }

          .wa-chatBody .cs-message-list {
            flex: 1;
            min-height: 0;
          }

          .wa-messageList {
            padding: 10px 10px 16px;
            background: transparent;
          }

          .wa-messageFilterBar {
            overflow-x: auto;
            white-space: nowrap;
            -webkit-overflow-scrolling: touch;
          }

          .wa-sessionActionBar {
            gap: 10px;
            padding: 10px 12px 8px;
            background: transparent;
            border-bottom: 0;
          }

          .wa-sessionActionInfo,
          .wa-actionBtns {
            width: 100%;
          }

          .wa-sessionActionInfo {
            color: #ffffff;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 6px;
          }

          .wa-sessionName {
            color: #ffffff;
            font-size: 15px;
            max-width: calc(100vw - 96px);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .wa-sessionPhone {
            max-width: calc(100vw - 56px);
            font-size: 13px;
            padding: 5px 10px;
            background: rgba(255, 255, 255, 0.16);
            border-color: rgba(255, 255, 255, 0.32);
            color: #ffffff;
          }

          .wa-mobileBackBtn {
            border-color: rgba(255, 255, 255, 0.28);
            background: rgba(255, 255, 255, 0.14);
            color: #ffffff;
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
          }

          .wa-status.is-live,
          .wa-status.is-expired,
          .wa-status.is-patient,
          .wa-status.is-lead,
          .wa-status.is-pending,
          .wa-status.is-resolved,
          .wa-status.is-closed {
            background: rgba(255, 255, 255, 0.18);
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.16);
          }

          .wa-actionBtns,
          .wa-messageFilterBar {
            overflow-x: auto;
            white-space: nowrap;
            flex-wrap: nowrap;
            padding-bottom: 2px;
          }

          .wa-messageFilterBar button,
          .wa-actionBtns button {
            border-color: rgba(255, 255, 255, 0.18);
          }

          .wa-messageFilterBar button {
            background: rgba(255, 255, 255, 0.12);
            color: #ffffff;
          }

          .wa-messageFilterBar button.is-active {
            background: #ffffff;
            border-color: #ffffff;
            color: #0f7f85;
          }

          .wa-actionBtns button,
          .wa-messageFilterBar button {
            flex: 0 0 auto;
          }

          .wa-actionBtns button {
            background: rgba(255, 255, 255, 0.14);
            color: #ffffff;
          }

          .wa-actionBtns button.is-active {
            background: #ffffff;
            color: #0f7f85;
            border-color: #ffffff;
          }

          .wa-actionBtns button.danger,
          .wa-actionBtns button.danger.is-active {
            background: #fff5f5;
            color: #9b2c2c;
            border-color: #ffd0d0;
          }

          .wa-actionBtns {
            gap: 6px;
          }

          .wa-actionBtns button {
            padding: 0 10px;
            height: 32px;
            font-size: 12px;
          }

          .wa-msgBubble {
            max-width: calc(100vw - 88px);
          }

          .wa-conversation {
            padding: 11px 12px;
            margin: 6px 8px;
            border: 1px solid #e7ebf0;
            border-radius: 16px;
            background: #ffffff;
            box-shadow: 0 8px 24px rgba(15, 28, 45, 0.05);
          }

          .wa-conversationInfoText {
            font-size: 12px;
            color: #607087;
          }

          .wa-conversation.is-active {
            background: #dff1ea;
            color: #143428;
            border-color: #9fd2c0;
          }

          .wa-conversation.is-active .wa-conversationInfoText,
          .wa-conversation.is-active .wa-conversationNameText.is-patient,
          .wa-conversation.is-active .wa-conversationNameText.is-lead {
            color: inherit;
          }

          .wa-conversationList {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
          }

          .wa-loadMoreWrap {
            padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px));
            background: #f7f8fa;
          }

          .wa-unread {
            box-shadow: none;
          }

          .wa-msgRow {
            gap: 6px;
            margin: 10px 0;
          }

          .wa-avatar {
            width: 24px;
            height: 24px;
            flex-basis: 24px;
            font-size: 11px;
          }

          .wa-msgBubble.is-in {
            background: #ffffff;
            color: #1c2a3d;
            border: 1px solid rgba(15, 47, 74, 0.08);
            border-bottom-left-radius: 4px;
          }

          .wa-msgBubble.is-in .wa-msgMeta {
            color: #5a6b83;
          }

          .wa-msgBubble.is-out {
            background: #dcf8c6;
            border-color: #bfe6a7;
          }

          .wa-msgBubble.is-out.is-bot {
            background: #f4f7fb;
            border-color: #d7e0ea;
          }

          /* Mobile safety: force readable text contrast inside bubbles */
          .wa-msgBubble.is-in .wa-msgText,
          .wa-msgBubble.is-in .wa-msgSender,
          .wa-msgBubble.is-in .wa-msgTime {
            color: #1c2a3d !important;
          }

          .wa-msgBubble.is-out .wa-msgText,
          .wa-msgBubble.is-out .wa-msgSender,
          .wa-msgBubble.is-out .wa-msgTime,
          .wa-msgBubble.is-out.is-bot .wa-msgText,
          .wa-msgBubble.is-out.is-bot .wa-msgSender,
          .wa-msgBubble.is-out.is-bot .wa-msgTime {
            color: #17311d !important;
          }

          .wa-msgBubble.is-status {
            background: #fff4cf;
            border-color: #e8cc78;
            color: #6b4b05;
          }

          .wa-customComposer {
            position: sticky;
            bottom: 0;
            z-index: 4;
            background: rgba(248, 249, 251, 0.95);
            backdrop-filter: blur(10px);
            padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
            box-shadow: 0 -8px 20px rgba(15, 28, 45, 0.08);
            margin-top: auto;
          }

          .wa-customComposer textarea {
            min-height: 42px;
            height: 42px;
            border-radius: 999px;
            background: #ffffff;
            color: #1c2a3d;
          }

          .wa-customComposer textarea::placeholder {
            color: #607087;
          }

          .wa-composerQuickActions {
            padding: 6px 12px 0;
            overflow-x: auto;
            white-space: nowrap;
            -webkit-overflow-scrolling: touch;
          }

          .wa-composerQuickActions > * {
            flex: 0 0 auto;
          }

          .wa-root.theme-light .wa-chatTop {
            background: #f5efe6;
            border-bottom: 1px solid #ddd1c1;
            box-shadow: none;
          }

          .wa-root.theme-light .wa-sessionActionInfo,
          .wa-root.theme-light .wa-sessionName {
            color: #1f3552;
          }

          .wa-root.theme-light .wa-mobileBackBtn {
            border-color: #ccbca8;
            background: #fbf6ef;
            color: #2b4668;
            box-shadow: none;
          }

          .wa-root.theme-light .wa-sessionPhone {
            background: #fbf6ef;
            border-color: #ccbca8;
            color: #1f3552;
          }

          .wa-root.theme-light .wa-sessionPhone:hover {
            background: #f3e9dd;
          }

          .wa-root.theme-light .wa-status.is-live,
          .wa-root.theme-light .wa-status.is-expired,
          .wa-root.theme-light .wa-status.is-patient,
          .wa-root.theme-light .wa-status.is-lead,
          .wa-root.theme-light .wa-status.is-pending,
          .wa-root.theme-light .wa-status.is-resolved,
          .wa-root.theme-light .wa-status.is-closed {
            background: #efe6da;
            color: #2b4668;
            border: 1px solid #d8c8b5;
          }

          .wa-root.theme-light .wa-messageFilterBar button,
          .wa-root.theme-light .wa-actionBtns button {
            border-color: #d3c4b1;
            background: #fbf6ef;
            color: #2b4668;
          }

          .wa-root.theme-light .wa-messageFilterBar button.is-active,
          .wa-root.theme-light .wa-actionBtns button.is-active {
            background: #0f7f85;
            border-color: #0f7f85;
            color: #ffffff;
          }

          .wa-root.theme-light .wa-customComposer textarea {
            background: #ffffff;
            color: #1d2b41;
            border: 1px solid #d5c8b8;
          }

          .wa-root.theme-light .wa-customComposer textarea::placeholder {
            color: #6a7a90;
          }

          .wa-root.theme-light .wa-sendBtn,
          .wa-root.theme-light .wa-attachBtn {
            background: #0f7f85;
            border-color: #0f7f85;
            color: #ffffff;
          }

          .wa-root.theme-dark .wa-customComposer textarea {
            background: rgba(15, 24, 40, 0.92);
            color: #f8fafc;
            border: 1px solid rgba(255, 255, 255, 0.22);
          }

          .wa-root.theme-dark .wa-customComposer textarea::placeholder {
            color: rgba(226, 232, 240, 0.72);
          }

          .wa-root.theme-light .wa-msgBubble.is-in .wa-msgText,
          .wa-root.theme-light .wa-msgBubble.is-in .wa-msgSender,
          .wa-root.theme-light .wa-msgBubble.is-in .wa-msgTime {
            color: #1d2b41 !important;
          }

          .wa-root.theme-light .wa-msgBubble.is-out.is-bot .wa-msgText,
          .wa-root.theme-light .wa-msgBubble.is-out.is-bot .wa-msgSender,
          .wa-root.theme-light .wa-msgBubble.is-out.is-bot .wa-msgTime {
            color: #42536b !important;
          }
        }

        @media (prefers-color-scheme: light) {
          .wa-root {
            background:
              radial-gradient(circle at top right, rgba(255, 255, 255, 0.55), transparent 32%),
              #e8ddd0;
          }

          .wa-frame {
            background: #f5efe6;
            border: 1px solid #d8cfc3;
            box-shadow: 0 16px 36px rgba(27, 39, 56, 0.14);
          }

          .wa-main,
          .wa-sidebarHeader,
          .wa-sidebar,
          .wa-chatTop,
          .wa-sessionActionBar,
          .wa-leftPanelTools,
          .wa-customComposer {
            background: #f5efe6;
          }

          .wa-sidebarHeader {
            border-bottom: 1px solid #ddd1c1;
          }

          .wa-backBtn,
          .wa-sidebarHeader button {
            border: 1px solid #ccd6e3;
            background: #fff;
            color: #34465d;
          }

          .wa-sidebarHeader h1 {
            color: #0c3f47;
          }

          .wa-sidebarHeader p,
          .wa-titleSub,
          .wa-ownNumber {
            color: #607087;
          }

          .wa-leftPanelTools {
            border-bottom: 1px solid #ddd1c1;
          }

          .wa-leftPanelTools input {
            border: 1px solid #d5c8b8;
            background: #fbf8f3;
            color: #0f172a;
          }

          .wa-resolveMenu {
            background: #fff;
            border-color: #d3c4b1;
          }

          .wa-resolveMenuTitle {
            color: #2b4668;
          }

          .wa-resolveMenu select,
          .wa-resolveMenu textarea {
            background: #fff;
            border-color: #d3c4b1;
            color: #2b4668;
          }

          .wa-resolveMenuActions button {
            border-color: #d3c4b1;
            background: #fbf6ef;
            color: #2b4668;
          }

          .wa-ownerSearchRow {
            flex-wrap: wrap;
          }

          .wa-ownerSearchInput {
            width: auto !important;
            min-width: 0;
            max-width: none;
          }

          .wa-ownerSearchTools {
            width: 100%;
          }

          .wa-leftPanelTools input:focus {
            border-color: #8ea0b7;
            box-shadow: 0 0 0 3px rgba(142, 160, 183, 0.15);
          }

          .wa-metaToggle,
          .wa-tabs button,
          .wa-messageFilterBar button,
          .wa-actionBtns button,
          .wa-attachBtn,
          .wa-sendBtn {
            border: 1px solid #d0d9e6;
            background: #fff;
            color: #42546d;
          }

          .wa-tabs button.is-active,
          .wa-messageFilterBar button.is-active,
          .wa-actionBtns button.is-active {
            background: #0f7f85;
            border-color: #0f7f85;
            color: #fff;
          }

          .wa-sessionName {
            color: #162437;
          }

          .wa-messageList {
            background:
              radial-gradient(circle at top right, rgba(255, 255, 255, 0.48), transparent 28%),
              #e8ddd0;
          }

          .wa-msgBubble.is-in {
            background: #fffdfa;
            color: #1d2b41;
            border: 1px solid rgba(15, 47, 74, 0.1);
          }

          .wa-msgBubble.is-out {
            background: #dcf8c6;
            color: #17311d;
            border: 1px solid #bfe6a7;
          }

          .wa-msgBubble.is-out.is-bot {
            background: #f4f7fb;
            border-color: #d7e0ea;
            color: #42536b;
          }

          .wa-msgBubble.is-in .wa-msgMeta {
            color: #5a6b83;
          }

          .wa-msgBubble.is-out .wa-msgMeta {
            color: #5a6b83;
          }

          .wa-conversation {
            border-bottom: 1px solid #e3d8ca;
          }

          .wa-conversation:hover {
            background: #efe6db;
          }

          .wa-conversation.is-active {
            background: #dff1ea;
            color: #143428;
          }

          .wa-conversationInfoText {
            color: inherit;
          }

          .wa-sidebar {
            border-right: 1px solid #ddd1c1;
          }

          .wa-chatTop,
          .wa-sessionActionBar {
            border-bottom: 1px solid #ddd1c1;
          }

          .wa-customComposer {
            border-top: 1px solid #ddd1c1;
          }

          .wa-customComposer textarea {
            border: 1px solid #d5c8b8;
            background: #fbf8f3;
            color: #0f172a;
          }
        }

        .wa-root.theme-light {
          background:
            radial-gradient(circle at top right, rgba(255, 255, 255, 0.55), transparent 32%),
            #e8ddd0;
        }

        .wa-root.theme-light .wa-frame {
          background: #f5efe6;
          border-color: #d8cfc3;
          box-shadow: 0 16px 36px rgba(27, 39, 56, 0.14);
        }

        .wa-root.theme-light .wa-main,
        .wa-root.theme-light .wa-sidebarHeader,
        .wa-root.theme-light .wa-sidebar,
        .wa-root.theme-light .wa-chatTop,
        .wa-root.theme-light .wa-sessionActionBar,
        .wa-root.theme-light .wa-leftPanelTools,
        .wa-root.theme-light .wa-customComposer {
          background: #f5efe6;
        }

        .wa-root.theme-light .wa-sidebarHeader,
        .wa-root.theme-light .wa-chatTop,
        .wa-root.theme-light .wa-sessionActionBar,
        .wa-root.theme-light .wa-leftPanelTools,
        .wa-root.theme-light .wa-customComposer {
          border-color: #ddd1c1;
        }

        .wa-root.theme-light .wa-sidebar {
          border-right-color: #ddd1c1;
        }

        .wa-root.theme-light .wa-messageList {
          background:
            radial-gradient(circle at top right, rgba(255, 255, 255, 0.48), transparent 28%),
            #e8ddd0;
        }

        .wa-root.theme-light .wa-msgBubble.is-in {
          background: #fffdfa;
          color: #1d2b41;
          border: 1px solid rgba(15, 47, 74, 0.1);
        }

        .wa-root.theme-light .wa-msgBubble.is-out {
          background: #dcf8c6;
          color: #17311d;
          border-color: #bfe6a7;
        }

        .wa-root.theme-light .wa-msgBubble.is-out.is-bot {
          background: #f4f7fb;
          border-color: #d7e0ea;
          color: #42536b;
        }

        .wa-root.theme-light .wa-loadMoreWrap {
          border-top: 1px solid #ddd1c1;
          background: #f5efe6;
        }

        .wa-root.theme-light .wa-loadMoreSessions {
          border: 1px solid #d3c4b1;
          background: #fbf6ef;
          color: #2b4668;
          box-shadow: 0 8px 18px rgba(15, 38, 70, 0.08);
        }

        .wa-root.theme-light .wa-tabs button {
          border: 1px solid #d3c4b1;
          background: #fbf6ef;
          color: #2b4668;
        }

        .wa-root.theme-light .wa-tabs button.is-active {
          background: #0f7f85;
          border-color: #0f7f85;
          color: #ffffff;
        }

        .wa-root.theme-light .wa-leftTitleMini {
          color: #1f3552;
        }

        .wa-root.theme-light .wa-leftNumberMini {
          color: #5b6f88;
        }

        .wa-root.theme-light .wa-sessionPhone {
          background: #fbf6ef;
          border-color: #ccbca8;
          color: #1f3552;
        }

        .wa-root.theme-light .wa-sessionPhone:hover {
          background: #f3e9dd;
        }

        .wa-root.theme-light .wa-shortBtn {
          border-color: #d3c4b1;
          background: #fbf6ef;
          color: #2b4668;
        }

        .wa-root.theme-light .wa-shortBtn.is-reports {
          border-color: #7ad9c0;
          background: #dff8ef;
          color: #145a4f;
        }

        .wa-root.theme-light .wa-ownerSearchAddBtn {
          border-color: #cbd5e1;
          background: #e2e8f0;
          color: #475569;
        }

        .wa-root.theme-light .wa-ownerSearchAddBtn.is-ready {
          border-color: #22c55e;
          background: #dcfce7;
          color: #166534;
        }

        .wa-root.theme-light .wa-ownerSearchOpenBtn {
          border-color: #93c5fd;
          background: #eff6ff;
          color: #1d4ed8;
        }

        .wa-root.theme-light .wa-modalCard {
          background: #ffffff;
          border-color: #d6e2f1;
        }

        .wa-root.theme-light .wa-modalHeader {
          color: #1f3552;
        }

        .wa-root.theme-light .wa-modalClose {
          border-color: #d3c4b1;
          color: #2b4668;
        }

        .wa-root.theme-light .wa-modalLabel {
          color: #2b4668;
        }

        .wa-root.theme-light .wa-modalInput {
          border-color: #d3c4b1;
          background: #fbf6ef;
          color: #1f3552;
        }

        .wa-root.theme-light .wa-modalTemplatePreview {
          border-color: #d3c4b1;
          background: #fbf6ef;
          color: #2b4668;
        }

        .wa-root.theme-light .wa-modalWarn {
          border-color: #f5d08a;
          background: #fff6df;
          color: #7a4b00;
        }

        .wa-root.theme-light .wa-modalLookupHint {
          color: #15803d;
        }

        .wa-root.theme-light .wa-modalError {
          border-color: #fca5a5;
          background: #fee2e2;
          color: #991b1b;
        }

        .wa-root.theme-light .wa-sentReportsTableWrap {
          border-color: #d3c4b1;
        }

        .wa-root.theme-light .wa-sentReportsTable th,
        .wa-root.theme-light .wa-sentReportsTable td {
          border-bottom-color: #e5e7eb;
          color: #1f3552;
        }

        .wa-root.theme-light .wa-sentReportsTable th {
          background: #f8fafc;
        }

        .wa-root.theme-light .wa-iconToolBtn {
          border-color: #d3c4b1;
          background: #fbf6ef;
          color: #2b4668;
        }

        .wa-root.theme-light .wa-iconToolBtn.is-active {
          background: #0f7f85;
          border-color: #0f7f85;
          color: #ffffff;
        }

        .wa-root.theme-dark {
          background: linear-gradient(180deg, #0d1726 0%, #111827 100%) !important;
        }

        .wa-root.theme-dark .wa-frame {
          background: #0f1a2d !important;
          border-color: rgba(255, 255, 255, 0.12) !important;
          box-shadow: 0 18px 40px rgba(2, 8, 20, 0.45) !important;
        }

        .wa-root.theme-dark .wa-main,
        .wa-root.theme-dark .wa-sidebar,
        .wa-root.theme-dark .wa-chatTop,
        .wa-root.theme-dark .wa-sessionActionBar,
        .wa-root.theme-dark .wa-leftPanelTools,
        .wa-root.theme-dark .wa-customComposer {
          background: #111b2f !important;
        }

        .wa-root.theme-dark .wa-sessionActionInfo,
        .wa-root.theme-dark .wa-sessionName {
          color: #f8fafc !important;
        }

        .wa-root.theme-dark .wa-leftNumberMini {
          color: rgba(248, 250, 252, 0.88) !important;
        }

        .wa-root.theme-dark .wa-frame,
        .wa-root.theme-dark .wa-sidebar,
        .wa-root.theme-dark .wa-chatTop,
        .wa-root.theme-dark .wa-sessionActionBar,
        .wa-root.theme-dark .wa-leftPanelTools,
        .wa-root.theme-dark .wa-customComposer {
          border-color: rgba(255, 255, 255, 0.08) !important;
        }

        .wa-root.theme-dark .wa-conversation {
          background: #152236 !important;
          border: 1px solid rgba(255, 255, 255, 0.09) !important;
          border-bottom-color: rgba(255, 255, 255, 0.06) !important;
        }

        .wa-root.theme-dark .wa-conversation:hover {
          background: #1a2940 !important;
        }

        .wa-root.theme-dark .wa-conversation.is-active {
          background: #1d3340 !important;
          border-color: rgba(90, 197, 160, 0.5) !important;
        }

        .wa-root.theme-dark .wa-conversationInfoText {
          color: rgba(226, 232, 240, 0.82) !important;
        }

        .wa-root.theme-dark .wa-conversationNameText.is-patient {
          color: #7fe3b3 !important;
        }

        .wa-root.theme-dark .wa-conversationNameText.is-lead {
          color: #9dc3ff !important;
        }

        .wa-root.theme-dark .wa-loadMoreWrap {
          background: #111b2f !important;
          border-top-color: rgba(255, 255, 255, 0.08) !important;
        }

        .wa-root.theme-dark .wa-loadMoreSessions {
          border-color: rgba(255, 255, 255, 0.2) !important;
          background: rgba(255, 255, 255, 0.08) !important;
          color: #f8fafc !important;
        }

        .wa-root.theme-dark .wa-messageList {
          background: linear-gradient(180deg, #0f1a2d 0%, #101b2f 100%) !important;
        }

        .wa-root.theme-dark .wa-msgBubble.is-in {
          background: #ffffff !important;
          color: #152238 !important;
          border: 1px solid rgba(15, 47, 74, 0.08) !important;
        }

        .wa-root.theme-dark .wa-msgBubble.is-out {
          background: #d8fdd2 !important;
          color: #17311d !important;
          border-color: #bfe6a7 !important;
        }

        .wa-root.theme-dark .wa-msgBubble.is-out.is-bot {
          background: #d8fdd2 !important;
          color: #17311d !important;
          border-color: #bfe6a7 !important;
        }

        .wa-root.theme-dark .wa-msgBubble.is-in .wa-msgMeta {
          color: #5a6b83 !important;
        }

        .wa-root.theme-dark .wa-msgBubble.is-in .wa-msgText,
        .wa-root.theme-dark .wa-msgBubble.is-in .wa-msgSender,
        .wa-root.theme-dark .wa-msgBubble.is-in .wa-msgTime {
          color: #152238 !important;
        }

        .wa-root.theme-dark .wa-msgBubble.is-out .wa-msgText,
        .wa-root.theme-dark .wa-msgBubble.is-out .wa-msgSender,
        .wa-root.theme-dark .wa-msgBubble.is-out .wa-msgTime,
        .wa-root.theme-dark .wa-msgBubble.is-out.is-bot .wa-msgText,
        .wa-root.theme-dark .wa-msgBubble.is-out.is-bot .wa-msgSender,
        .wa-root.theme-dark .wa-msgBubble.is-out.is-bot .wa-msgTime {
          color: #17311d !important;
        }

      `}</style>
    </div>
  );
}
