"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useSearchParams } from "next/navigation";
import { useUser } from "@/app/context/UserContext";

const APP_LOGO = process.env.NEXT_PUBLIC_LABBIT_LOGO || "/logo.png";
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Labbit";
const IST_TIMEZONE = "Asia/Kolkata";
const HEADER_WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
  process.env.NEXT_PUBLIC_BUSINESS_WHATSAPP_NUMBER ||
  "";

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

function isWithin24(session) {
  if (!session?.last_user_message_at) return false;
  const parsed = parseServerDate(session.last_user_message_at);
  if (!parsed || Number.isNaN(parsed.getTime())) return false;
  const diff = Date.now() - parsed.getTime();
  return diff < 24 * 60 * 60 * 1000;
}

function isPendingSession(session) {
  const status = String(session?.status || "").toLowerCase();
  return status === "pending" || status === "handoff";
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

function getSenderLabel(msg, currentUserId) {
  if (msg.direction === "status") {
    const sender = msg?.payload?.sender;
    return sender?.name ? `Internal Note (${sender.name})` : "Internal Note";
  }

  if (msg.direction !== "outbound") return "User";

  const sender = msg?.payload?.sender;
  if (sender?.name) {
    const isMe = currentUserId && sender.id === currentUserId;
    return isMe ? `You (${sender.name})` : `Agent (${sender.name})`;
  }

  return "Bot";
}

function getInitial(text) {
  return (text || "?").trim().charAt(0).toUpperCase() || "?";
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function canonicalPhone(value) {
  const digits = digitsOnly(value);
  return digits.length > 10 ? digits.slice(-10) : digits;
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

  return decodeMessageEntities(botLabelMap?.[rawMessage] || rawMessage);
}

function getMessageMedia(msg) {
  const media = msg?.payload?.media;
  const fallbackUrl =
    media?.url ||
    media?.link ||
    msg?.payload?.raw_message?.image?.link ||
    msg?.payload?.raw_message?.image?.url ||
    msg?.payload?.raw_message?.image?.image_url ||
    msg?.payload?.raw_message?.document?.link ||
    msg?.payload?.raw_message?.document?.url ||
    msg?.payload?.raw_message?.document?.document_url ||
    msg?.payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.image?.link ||
    msg?.payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.image?.url ||
    msg?.payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.document?.link ||
    msg?.payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.document?.url;

  if (fallbackUrl) {
    return {
      type: media.type || "file",
      url: fallbackUrl,
      filename: media?.filename || msg?.payload?.raw_message?.document?.filename || null
    };
  }

  const doc = msg?.payload?.request?.document;
  if (doc?.link) {
    return {
      type: "document",
      url: doc.link,
      filename: doc.filename || null
    };
  }
// InstaAlerts media extractor
let filedata = null;

try {
  const rawMsg =
    msg?.payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  filedata =
    rawMsg?.image?.id ||
    rawMsg?.document?.id ||
    msg?.payload?.media?.id ||
    msg?.payload?.raw_message?.image?.id ||
    msg?.payload?.raw_message?.document?.id;
} catch (e) {}

if (filedata) {
  return {
    type: "image",
    url: `/api/admin/whatsapp/media?filedata=${encodeURIComponent(filedata)}`
  };
}
  return null;
}

async function fetchJsonWithRetry(url, options = {}, retries = 1) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed (${response.status})`);
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
  const [messages, setMessages] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [labMeta, setLabMeta] = useState(null);
  const [botLabelMap, setBotLabelMap] = useState({});
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("active");
  const [senderFilter, setSenderFilter] = useState("all");
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [oldestCursor, setOldestCursor] = useState(null);
  const [historyWindowDays, setHistoryWindowDays] = useState(2);
  const [isSending, setIsSending] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isSendingAttachment, setIsSendingAttachment] = useState(false);
  const [isSendingReportTool, setIsSendingReportTool] = useState(false);
  const [isSeedingBotFlow, setIsSeedingBotFlow] = useState(false);
  const [showBotFlowMenu, setShowBotFlowMenu] = useState(false);
  const [openInfoSessionId, setOpenInfoSessionId] = useState(null);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [agentPresence, setAgentPresence] = useState([]);
  const [chatSettings, setChatSettings] = useState(DEFAULT_CHAT_SETTINGS);
  const [composerText, setComposerText] = useState("");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobilePanel, setMobilePanel] = useState("list");
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
  const initialBottomReadyRef = useRef(false);
  const autoRefreshInFlightRef = useRef(false);
  const selectedSessionRef = useRef(null);
  const sessionsSignatureRef = useRef("");
  const hasBootstrappedSessionsRef = useRef(false);
  const previousUnreadBySessionRef = useRef(new Map());

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
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission || "default");
    }
  }, []);

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
    if (!isMobileViewport) return;
    if (selectedSession?.id && mobilePanel !== "chat") {
      setMobilePanel("chat");
    }
  }, [isMobileViewport, mobilePanel, selectedSession?.id]);

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
    scrollToBottom();
  }, [messages, selectedSession]);

  useEffect(() => {
    setOpenInfoSessionId(null);
    setShowBotFlowMenu(false);
  }, [selectedSession?.id]);

  useEffect(() => {
    selectedSessionRef.current = selectedSession || null;
  }, [selectedSession]);

  useEffect(() => {
    if (!selectedSession) return;
    const status = String(selectedSession.status || "").toLowerCase();
    if (tab === "active" && status === "closed") {
      const firstActive = sessions.find((s) => String(s?.status || "").toLowerCase() !== "closed");
      if (firstActive) handleSelect(firstActive);
    }
    if (tab === "closed" && status !== "closed") {
      const firstClosed = sessions.find((s) => String(s?.status || "").toLowerCase() === "closed");
      if (firstClosed) handleSelect(firstClosed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sessions]);


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
    if (tab === "active") return list.find((row) => String(row?.status || "").toLowerCase() !== "closed") || null;
    if (tab === "closed") return list.find((row) => String(row?.status || "").toLowerCase() === "closed") || null;
    return list[0] || null;
  };

  const fetchSessions = async (options = {}) => {
    const { silent = false } = options;
    setError("");
    if (!silent) setIsLoadingSessions(true);

    try {
      const body = await fetchJsonWithRetry("/api/admin/whatsapp/sessions", {
        credentials: "include",
        cache: "no-store"
      }, 1);
      const nextSessions = body.sessions || [];
      const unreadNow = new Map(nextSessions.map((row) => [row.id, Number(row?.unread_count || 0)]));
      if (hasBootstrappedSessionsRef.current && notificationPermission === "granted" && typeof window !== "undefined") {
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
      previousUnreadBySessionRef.current = unreadNow;
      hasBootstrappedSessionsRef.current = true;

      const nextSignature = buildSessionsSignature(nextSessions);
      const hasSessionListChanged = nextSignature !== sessionsSignatureRef.current;
      sessionsSignatureRef.current = nextSignature;
      if (!silent || hasSessionListChanged) {
        setSessions(nextSessions);
      }

      if (selectedSession) {
        const freshSelected = nextSessions.find((s) => s.id === selectedSession.id);
        if (freshSelected) {
          const mergedSelected = {
            ...freshSelected,
            patient_name:
              freshSelected.patient_name ||
              selectedSession.patient_name ||
              freshSelected.phone ||
              "Unknown"
          };
          setSelectedSession(mergedSelected);
          setSessions((prev) =>
            prev.map((row) => (row.id === mergedSelected.id ? { ...row, patient_name: mergedSelected.patient_name } : row))
          );
        } else if (nextSessions.length > 0) {
          const first = getFirstSessionForTab(nextSessions) || nextSessions[0];
          if (first) {
            setSelectedSession(first);
            await fetchMessages(first.phone);
          }
        } else {
          setSelectedSession(null);
        }
      } else if (nextSessions.length > 0) {
        const requestedPhone = searchParams.get("phone");
        const matchedByPhone = requestedPhone
          ? nextSessions.find((s) => String(s.phone || "").includes(String(requestedPhone)))
          : null;
        const first = matchedByPhone || getFirstSessionForTab(nextSessions) || nextSessions[0];
        if (first) {
          setSelectedSession(first);
          await fetchMessages(first.phone);
        }
      }
      return nextSessions;
    } catch {
      setError("Failed to load conversations. Please refresh.");
      return [];
    } finally {
      if (!silent) setIsLoadingSessions(false);
    }
  };

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
    const { before = null, appendOlder = false, silent = false } = options;

    setError("");
    if (appendOlder && !silent) {
      setIsLoadingOlder(true);
    } else if (!silent) {
      setIsLoadingMessages(true);
    }

    try {
      const query = new URLSearchParams({ phone });
      if (before) query.set("before", before);
      const body = await fetchJsonWithRetry(`/api/admin/whatsapp/messages?${query.toString()}`, {
        credentials: "include",
        cache: "no-store"
      }, 1);
      const incoming = body.messages || [];
      if (appendOlder) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const dedupedOlder = incoming.filter((m) => !existingIds.has(m.id));
          return [...dedupedOlder, ...prev];
        });
      } else {
        setMessages(incoming);
      }
      if (body.session) {
        setSelectedSession(body.session);
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
      setHasOlderMessages(Boolean(body.pagination?.has_older));
      setOldestCursor(body.pagination?.next_before || null);
      setHistoryWindowDays(body.pagination?.initial_window_days || 2);
      if (!appendOlder) {
        scrollToBottom();
        initialBottomReadyRef.current = true;
      }
    } catch {
      setError("Failed to load messages. Please retry.");
    } finally {
      if (appendOlder && !silent) {
        setIsLoadingOlder(false);
      } else if (!silent) {
        setIsLoadingMessages(false);
      }
    }
  };

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
            await fetchMessages(afterRefreshSelected.phone, { silent: true });
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
  }, [isUserLoading, user, selectedSession?.id]);

  const handleSelect = async (session) => {
    setSelectedSession(session);
    if (isMobileViewport) {
      setMobilePanel("chat");
    }
    setMessages([]);
    setHasOlderMessages(false);
    setOldestCursor(null);
    initialBottomReadyRef.current = false;
    await fetchMessages(session.phone);
  };

  const handleLoadOlder = async () => {
    if (!initialBottomReadyRef.current) return;
    if (!selectedSession?.phone || !oldestCursor || !hasOlderMessages || isLoadingOlder || isLoadingMessages) {
      return;
    }

    const scrollEl = getMessageScrollElement();
    const previousHeight = scrollEl?.scrollHeight || 0;
    const previousTop = scrollEl?.scrollTop || 0;
    isPrependingRef.current = true;
    await fetchMessages(selectedSession.phone, { before: oldestCursor, appendOlder: true });
    requestAnimationFrame(() => {
      const nextEl = getMessageScrollElement();
      if (!nextEl) return;
      const delta = (nextEl.scrollHeight || 0) - previousHeight;
      nextEl.scrollTop = previousTop + Math.max(delta, 0);
    });
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
    if (!isWithin24(selectedSession)) {
      setError("Cannot send attachments after the 24-hour window has expired.");
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

    if (!isWithin24(selectedSession)) {
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
      await Promise.all([fetchMessages(selectedSession.phone), fetchSessions()]);
    } catch (err) {
      setError(err?.message || "Failed to send latest report.");
    } finally {
      setIsSendingReportTool(false);
    }
  };

  const handleSend = async (text) => {
    const content = toPlainComposerText(String(text ?? composerText ?? ""));
    if (!selectedSession || !content || isSending) return;
    if (!isWithin24(selectedSession)) {
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
      await Promise.all([fetchMessages(selectedSession.phone), fetchSessions()]);
    } catch (err) {
      setError(err?.message || "Message could not be sent. Please retry.");
    } finally {
      setIsSending(false);
    }
  };

  const handleSessionAction = async (action) => {
    if (!selectedSession?.id || isUpdatingStatus) return;
    let note = "";

    if (action === "resolve") {
      const input =
        typeof window === "undefined"
          ? ""
          : window.prompt("Add a closure statement for this resolution:", "");

      if (input === null) {
        setHint("Resolve cancelled.");
        return;
      }

      note = String(input || "").trim();
      if (!note) {
        setError("Please add a closure statement before resolving this chat.");
        return;
      }
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
          note
        })
      });

      if (!response.ok) {
        const textResponse = await response.text();
        throw new Error(textResponse || "Failed to update chat status");
      }

      if (action === "resolve") {
        setHint("Chat resolved and closure note saved.");
      }

      await Promise.all([fetchSessions(), fetchMessages(selectedSession.phone)]);
    } catch (err) {
      setError(err?.message || "Failed to update chat status.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const filteredSessions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return sessions.filter((session) => {
      if (tab === "active" && session.status === "closed") return false;
      if (tab === "closed" && session.status !== "closed") return false;

      if (!normalizedSearch) return true;

      const name = (session.patient_name || "").toLowerCase();
      const phone = (session.phone || "").toLowerCase();
      return name.includes(normalizedSearch) || phone.includes(normalizedSearch);
    });
  }, [search, sessions, tab]);

  const filteredMessages = useMemo(() => {
    let filtered = messages;

    if (senderFilter === "all") return filtered;

    return filtered.filter((msg) => {
      // Always keep inbound (patient/user) messages visible for context.
      if (msg.direction !== "outbound") return true;

      const hasAgent = Boolean(msg?.payload?.sender?.id || msg?.payload?.sender?.name);
      if (senderFilter === "agent") return hasAgent;
      if (senderFilter === "bot") return !hasAgent;
      return true;
    });
  }, [messages, senderFilter]);

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

  const enableBrowserAlerts = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission || "default");
      if (permission === "granted") {
        setHint("Browser notifications enabled.");
      }
    } catch {
      setNotificationPermission("denied");
    }
  };

  const handleSeedBotFlow = async () => {
    setError("");
    setHint("");
    setIsSeedingBotFlow(true);
    try {
      const response = await fetch("/api/admin/whatsapp/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "seed_bot_flow" })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setHint("Default bot flow inserted for this lab.");
    } catch (err) {
      setError(err?.message || "Failed to insert bot flow.");
    } finally {
      setIsSeedingBotFlow(false);
    }
  };

  const handleBotFlowInsert = async (flow) => {
    if (!selectedSession?.phone) {
      setError("Select a conversation first.");
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
          : "Main menu bot flow inserted into this chat."
      );
      setComposerText("");
      await Promise.all([fetchMessages(selectedSession.phone), fetchSessions()]);
    } catch (err) {
      setError(err?.message || "Failed to insert bot flow into chat.");
    } finally {
      setIsSending(false);
    }
  };

  const canReply = Boolean(
    selectedSession &&
    isWithin24(selectedSession) &&
    !isSending &&
    !isUpdatingStatus
  );
  const isExpiredWindow = Boolean(selectedSession && !isWithin24(selectedSession));
  const shouldRecommendClose = Boolean(selectedSession && isExpiredWindow && selectedSession.status !== "closed");

  const hasManyPatients = (session) => Number(session?.matched_patient_count || 0) > 1;

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
    <div className="wa-root">
      <div className={`wa-frame ${isMobileViewport ? `is-mobile-${mobilePanel}` : ""}`}>
        <div className="wa-sidebarHeader">
          <div className="wa-brand">
            <a href="/admin" className="wa-logoLink" title="Back to Admin Dashboard">
              <img src={APP_LOGO} alt={`${APP_NAME} logo`} className="wa-logo" />
            </a>
            <div>
              <h1>
                WhatsApp Inbox
                <span className="wa-titleSub">Agent + bot console</span>
              </h1>
              {displayWhatsappNumber && (
                <p className="wa-ownNumber">Business Number: {displayWhatsappNumber}</p>
              )}
            </div>
          </div>
          <div className="wa-headerActions">
            <a href="/admin" className="wa-backBtn">
              ← Back
            </a>
            <a href="/admin/whatsapp/settings" className="wa-backBtn" title="WhatsApp Settings">
              ⚙ Settings
            </a>
            <button type="button" onClick={fetchSessions}>Refresh</button>
            {notificationPermission !== "granted" && (
              <button type="button" onClick={enableBrowserAlerts} className="wa-backBtn">
                🔔 Enable Alerts
              </button>
            )}
          </div>
        </div>

        <div className={`wa-main ${isMobileViewport ? `is-mobile-${mobilePanel}` : ""}`}>
          <div className={`wa-sidebar ${isMobileViewport && mobilePanel !== "list" ? "is-mobile-hidden" : ""}`}>
              <div className="wa-leftPanelTools">
              <div className="wa-tabs">
                {["active", "closed", "all"].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={tab === value ? "is-active" : ""}
                    onClick={() => setTab(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by patient or phone"
              />

              <div className="wa-leftMeta">
                <div className="wa-stateLegend" aria-label="Chat state legend">
                  <span className="wa-stateLegendTitle">Legend</span>
                  <span className="wa-stateFlag is-unread">Unread</span>
                  <span className="wa-stateFlag is-pending">Pending</span>
                  <span className="wa-stateFlag is-resolved">Resolved</span>
                  <span className="wa-stateFlag is-closed">Closed</span>
                  <span className="wa-stateFlag is-expired">24h</span>
                </div>
                {agentPresence.length > 0 && (
                  <div className="wa-presenceWrap" title="Agent activity status">
                    {agentPresence.map((agent) => (
                      <span key={agent.id} className={`wa-presenceChip is-${agent.presence}`}>
                        <span className="wa-presenceDot" />
                        <span className="wa-presenceName">{agent.name}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="wa-conversationList">
              {isLoadingSessions ? (
                <div className="wa-empty">Loading conversations...</div>
              ) : filteredSessions.length === 0 ? (
                <div className="wa-empty">No conversations found.</div>
              ) : (
                filteredSessions.map((session) => {
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
                          {session.phone}
                        {suffix ? ` • ${suffix}` : ""}
                      </div>
                    </div>
                  );
                })
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
                  {renderDbNamesPopover(selectedSession, true)}
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
                  <span className={`wa-status ${isWithin24(selectedSession) ? "is-live" : "is-expired"}`}>
                    {isWithin24(selectedSession) ? "24h live" : "24h expired"}
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
                </div>

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

                <div className="wa-actionBtns">
                  <button
                    type="button"
                    onClick={() => handleCreateClickupTask("followup")}
                    disabled={isCreatingTask}
                    className="wa-inlineBtn"
                    title="Create follow-up task"
                  >
                    {isCreatingTask ? "..." : "Follow-up"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreateClickupTask("report_request")}
                    disabled={isCreatingTask}
                    className="wa-inlineBtn"
                    title="Create report task"
                  >
                    Report Task
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreateClickupTask("doctors_connect")}
                    disabled={isCreatingTask}
                    className="wa-inlineBtn"
                    title="Create doctor connect task"
                  >
                    Doctor Connect
                  </button>
                  <button
                    type="button"
                    disabled={isUpdatingStatus}
                    onClick={() => handleSessionAction("pending")}
                    className={selectedSession.status === "pending" ? "is-active" : ""}
                  >
                    Pending
                  </button>
                  <button
                    type="button"
                    disabled={isUpdatingStatus}
                    onClick={() => handleSessionAction("resolve")}
                    className={selectedSession.status === "resolved" ? "is-active" : ""}
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    disabled={isUpdatingStatus}
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
                    onClick={() => handleSessionAction("resolve")}
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
            </div>

                <div className="wa-chatBody">
                  <div
                    className="wa-messageList"
                    ref={chatContainerRef}
                    onScroll={(e) => {
                      if (e.target.scrollTop < 40 ) {
                        handleLoadOlder();
                      }
                    }}
                  >
                {!selectedSession ? (
                  <div className="wa-empty">Select a conversation to view messages.</div>
                ) : isLoadingMessages ? (
                  <div className="wa-empty">Loading messages...</div>
                ) : filteredMessages.length === 0 ? (
                  <div className="wa-empty">No messages for this filter.</div>
                ) : (
                  <>
                    {hasOlderMessages && (
                      <div className="wa-historyHint">
                        {isLoadingOlder
                          ? "Loading older messages..."
                          : `Showing last ${historyWindowDays} days. Scroll up to load older history.`}
                      </div>
                    )}
                    {filteredMessages.map((msg) => {
                      const outgoing = msg.direction === "outbound" || msg.direction === "status";
                      const isStatusNote = msg.direction === "status";
                      const senderLabel = getSenderLabel(msg, user?.id);
                      const isBotMessage = isBotOutboundMessage(msg);
                      const media = getMessageMedia(msg);
                      const msgWithContext = {
                        ...msg,
                        sessionContext: selectedSession?.context || {}
                      };

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
                              <span className="wa-msgTime">{formatMessageTime(msg.created_at)} IST</span>
                            </div>
                            <div className="wa-msgText">{getDisplayMessageText(msgWithContext, botLabelMap)}</div>
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
                    : !isWithin24(selectedSession)
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
                <div className="wa-botMenuWrap">
                  <button
                    type="button"
                    className="wa-attachBtn"
                    onClick={() => setShowBotFlowMenu((prev) => !prev)}
                    disabled={!selectedSession || isSending || isUpdatingStatus}
                    title="Insert bot flow into chat"
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
                        className="wa-botMenuItem is-secondary"
                        onClick={handleSeedBotFlow}
                        disabled={isSeedingBotFlow}
                      >
                        {isSeedingBotFlow ? "Inserting Default Config..." : "Seed Default Config"}
                      </button>
                    </div>
                  )}
                </div>
                <div className="wa-botMenuWrap">
                  <button
                    type="button"
                    className="wa-attachBtn"
                    onClick={handleAttachmentChoose}
                    disabled={!selectedSession || isSendingAttachment || isSendingReportTool}
                    title="Upload attachment"
                  >
                    📎
                  </button>
                </div>
                <button
                  type="button"
                  className="wa-attachBtn"
                  onClick={handleSendLatestReport}
                  disabled={!selectedSession || isSending || isUpdatingStatus || isSendingReportTool}
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
                      : !isWithin24(selectedSession)
                        ? "Reply window expired. Use a template message to reopen."
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
          background: linear-gradient(135deg, #f4f7fb 0%, #eef3f8 100%);
          padding: 16px;
          box-sizing: border-box;
        }

        .wa-frame {
          max-width: 1480px;
          height: calc(100vh - 32px);
          margin: 0 auto;
          background: #ffffff;
          border: 1px solid #d6dee9;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 16px 36px rgba(27, 39, 56, 0.1);
          display: grid;
          grid-template-rows: auto 1fr;
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

        .wa-leftPanelTools {
          padding: 10px 10px 8px;
          border-bottom: 1px solid #e0e7f0;
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: #ffffff;
        }

        .wa-leftPanelTools input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #d0d9e6;
          border-radius: 10px;
          padding: 0 12px;
          height: 34px;
          font-size: 14px;
          outline: none;
        }

        .wa-leftPanelTools input:focus {
          border-color: #8ea0b7;
          box-shadow: 0 0 0 3px rgba(142, 160, 183, 0.15);
        }

        .wa-leftMeta {
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: flex-start;
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

        .wa-presenceWrap {
          display: inline-flex;
          gap: 6px;
          align-items: center;
          flex-wrap: wrap;
          max-width: 420px;
        }

        .wa-presenceChip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 1px solid #d0d9e6;
          border-radius: 999px;
          padding: 3px 8px;
          font-size: 11px;
          font-weight: 700;
          color: #34465d;
          background: #f8fbff;
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
          border: 1px solid #ccd6e3;
          background: #fff;
          color: #34465d;
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
          border-bottom: 1px solid #e0e7f0;
          background: #fbfcfe;
        }

        .wa-sidebarHeader h1 {
          margin: 0;
          font-size: 20px;
          color: #0c3f47;
          display: inline-flex;
          align-items: baseline;
          gap: 8px;
        }

        .wa-sidebarHeader p {
          margin: 4px 0 0;
          font-size: 13px;
          color: #607087;
        }

        .wa-titleSub {
          font-size: 12px;
          font-weight: 500;
          color: #70849c;
        }

        .wa-sidebarHeader button {
          border: 1px solid #ccd6e3;
          background: #fff;
          color: #34465d;
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
          border: 1px solid #d0d9e6;
          background: #fff;
          border-radius: 10px;
          height: 30px;
          padding: 0 10px;
          font-size: 12px;
          font-weight: 600;
          color: #42546d;
          cursor: pointer;
        }

        .wa-tabs button.is-active,
        .wa-messageFilterBar button.is-active {
          background: #0f7f85;
          border-color: #0f7f85;
          color: #fff;
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
          color: #607087;
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
          color: inherit;
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
          border-bottom: 1px solid #e0e7f0;
          background: #fdfefe;
          padding: 10px 12px;
          flex-wrap: wrap;
        }

        .wa-ownNumber {
          margin-top: 1px;
          font-size: 12px;
          color: #466079;
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
          color: #162437;
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
        }

        .wa-actionBtns button {
          height: 28px;
          border-radius: 8px;
          border: 1px solid #d0d9e6;
          background: #fff;
          color: #42546d;
          padding: 0 10px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }

        .wa-actionBtns button.is-active {
          background: #0f7f85;
          color: #fff;
          border-color: #0f7f85;
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
          background: #25354b;
          color: #f6f8fb;
          border-bottom-left-radius: 4px;
        }

        .wa-msgBubble.is-out {
          background: #ffffff;
          color: #1c2a3d;
          border: 1px solid #d0d9e6;
          border-bottom-right-radius: 4px;
        }

        .wa-msgBubble.is-out.is-bot {
          background: #f6f8fb;
          border-color: #dde4ef;
          color: #42536b;
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
          color: #c8d3e4;
        }

        .wa-msgBubble.is-out .wa-msgMeta {
          color: #5a6b83;
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

        .wa-msgText {
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 14px;
        }

        .wa-msgBubble.is-out.is-bot .wa-msgText {
          font-size: 13px;
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

        .wa-inlineBtn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
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
          border-top: 1px solid #e0e7f0;
          padding: 10px;
          background: #fff;
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
          border: 1px solid #d0d9e6;
          padding: 8px 10px;
          font-size: 14px;
          outline: none;
        }

        .wa-attachBtn,
        .wa-sendBtn {
          height: 36px;
          width: 36px;
          border-radius: 8px;
          border: 1px solid #d0d9e6;
          background: #f7fbff;
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
          background: #ffffff;
          border-bottom: 1px solid #e0e7f0;
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
        }

        .wa-sidebar {
          width: 360px;
          border-right: 1px solid #e0e7f0;
          background: #f9fbfd;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .wa-conversationList {
          flex: 1;
          overflow-y: auto;
          min-height: 0;
        }

        .wa-conversation {
          padding: 10px 12px;
          border-bottom: 1px solid #eef2f7;
          cursor: pointer;
        }

        .wa-conversation:hover {
          background: #f4f7fc;
        }

        .wa-conversation.is-active {
          background: #1e2c40;
          color: white;
        }

        .wa-messageList {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 8px;
          background: linear-gradient(180deg, #f7fafe 0%, #ffffff 100%);
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
          }

          .wa-leftPanelTools {
            position: sticky;
            top: 0;
            z-index: 3;
            background: #f7f8fa;
            padding: 12px 12px 10px;
            box-shadow: 0 1px 0 rgba(224, 231, 240, 0.9);
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
            height: 100dvh;
            max-height: 100dvh;
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
          }

          .wa-sessionName {
            color: #ffffff;
            font-size: 15px;
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

          .wa-msgBubble {
            max-width: calc(100vw - 88px);
          }

          .wa-conversation {
            padding: 13px 14px;
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
        }
      `}</style>
    </div>
  );
}
