"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MainContainer,
  Sidebar,
  ConversationList,
  Conversation,
  ChatContainer,
  MessageList,
  MessageInput
} from "@chatscope/chat-ui-kit-react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@/app/context/UserContext";

const APP_LOGO = process.env.NEXT_PUBLIC_LABBIT_LOGO || "/logo.png";
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Labbit";
const IST_TIMEZONE = "Asia/Kolkata";
const HEADER_WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
  process.env.NEXT_PUBLIC_BUSINESS_WHATSAPP_NUMBER ||
  "";
const SHORTCUT_HELP = "/r report reply, /hv home visit bot flow, /menu main menu";

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
    .replace(/&#39;/gi, "'");
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

function parseShortcutCommand(text) {
  const value = String(text || "").trim();
  if (!value.startsWith("/")) return null;

  const [rawCmd, ...rest] = value.split(/\s+/);
  const command = rawCmd.toLowerCase();
  const notes = rest.join(" ").trim();

  if (command === "/r") {
    return { type: "template", template: "reports_reply", notes };
  }

  if (command === "/rbot" || command === "/reports") {
    return { type: "handover", flow: "reports", notes };
  }

  if (command === "/hv" || command === "/homevisit") {
    return { type: "handover", flow: "home_visit", notes };
  }

  if (command === "/menu") {
    return { type: "handover", flow: "main_menu", notes };
  }

  return { type: "unknown", command };
}

function buildTemplateMessage(template, notes) {
  const extra = notes ? `\n${notes}` : "";
  if (template === "reports_reply") {
    return `Please find your report attached. If you need any clarification, reply here and our team will help you.${extra}`;
  }
  return notes || "";
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
  const [showBotMessages, setShowBotMessages] = useState(true);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [oldestCursor, setOldestCursor] = useState(null);
  const [historyWindowDays, setHistoryWindowDays] = useState(2);
  const [isSending, setIsSending] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [clickupAction, setClickupAction] = useState("followup");
  const [isSendingAttachment, setIsSendingAttachment] = useState(false);
  const [openInfoSessionId, setOpenInfoSessionId] = useState(null);
  const [error, setError] = useState("");
  const [agentPresence, setAgentPresence] = useState([]);
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
    if (isUserLoading || !user) return;
    fetchSessions();
    fetchAgentPresence();
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
  }, [selectedSession?.id]);

  const getMessageScrollElement = () =>
    chatContainerRef.current?.querySelector(".cs-message-list__scroll-wrapper") || null;

  const scrollToBottom = () => {
    const doScroll = () => {
      const scrollEl = getMessageScrollElement();
      if (scrollEl) {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      }
    };
    requestAnimationFrame(doScroll);
    setTimeout(doScroll, 40);
    setTimeout(doScroll, 120);
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
      setSessions(nextSessions);

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
          const first = nextSessions[0];
          setSelectedSession(first);
          await fetchMessages(first.phone);
        } else {
          setSelectedSession(null);
        }
      } else if (nextSessions.length > 0) {
        const requestedPhone = searchParams.get("phone");
        const matchedByPhone = requestedPhone
          ? nextSessions.find((s) => String(s.phone || "").includes(String(requestedPhone)))
          : null;
        const first = matchedByPhone || nextSessions[0];
        setSelectedSession(first);
        await fetchMessages(first.phone);
      }
    } catch {
      setError("Failed to load conversations. Please refresh.");
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
        await fetchSessions({ silent: true });
        await fetchAgentPresence({ silent: true });
        if (selectedSession?.phone) {
          await fetchMessages(selectedSession.phone, { silent: true });
        }
      } finally {
        autoRefreshInFlightRef.current = false;
      }
    };

    refreshTick();
    const interval = setInterval(refreshTick, 8000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshTick();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isUserLoading, user, selectedSession?.phone]);

  const handleSelect = async (session) => {
    setShowBotMessages(true);
    setSelectedSession(session);
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

  const handleCreateClickupTask = async () => {
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
          action: clickupAction,
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
    if (attachInputRef.current) attachInputRef.current.click();
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

  const handleSend = async (text) => {
    const content = text.trim();
    if (!selectedSession || !content || isSending) return;
    if (!isWithin24(selectedSession)) {
      setError("Cannot send messages after the 24-hour window has expired.");
      return;
    }

    setError("");
    setIsSending(true);

    try {
      const shortcut = parseShortcutCommand(content);
      if (shortcut?.type === "unknown") {
        throw new Error(`Unknown shortcut: ${shortcut.command}. Use ${SHORTCUT_HELP}`);
      }

      if (shortcut?.type === "template") {
        const templateText = buildTemplateMessage(shortcut.template, shortcut.notes);
        if (!templateText) {
          throw new Error(`Shortcut could not build a message. Use ${SHORTCUT_HELP}`);
        }
        const response = await fetch("/api/admin/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            phone: selectedSession.phone,
            message: templateText
          })
        });

        if (!response.ok) {
          const textResponse = await response.text();
          throw new Error(textResponse || "Template send failed");
        }

        await Promise.all([fetchMessages(selectedSession.phone), fetchSessions()]);
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

      await Promise.all([fetchMessages(selectedSession.phone), fetchSessions()]);
    } catch (err) {
      setError(err?.message || "Message could not be sent. Please retry.");
    } finally {
      setIsSending(false);
    }
  };

  const handleSessionAction = async (action) => {
    if (!selectedSession?.id || isUpdatingStatus) return;

    setError("");
    setIsUpdatingStatus(true);

    try {
      const response = await fetch("/api/admin/whatsapp/session-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId: selectedSession.id,
          action
        })
      });

      if (!response.ok) {
        const textResponse = await response.text();
        throw new Error(textResponse || "Failed to update chat status");
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

    if (!showBotMessages) {
      filtered = filtered.filter((msg) => !isBotOutboundMessage(msg));
    }

    if (senderFilter === "all") return filtered;

    return filtered.filter((msg) => {
      // Always keep inbound (patient/user) messages visible for context.
      if (msg.direction !== "outbound") return true;

      const hasAgent = Boolean(msg?.payload?.sender?.id || msg?.payload?.sender?.name);
      if (senderFilter === "agent") return hasAgent;
      if (senderFilter === "bot") return !hasAgent;
      return true;
    });
  }, [messages, senderFilter, showBotMessages]);

  const canReply = Boolean(
    selectedSession &&
    selectedSession.status !== "closed" &&
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
      <div className="wa-frame">
        <div className="wa-sidebarHeader">
          <div className="wa-brand">
            <a href="/admin" className="wa-logoLink" title="Back to Admin Dashboard">
              <img src={APP_LOGO} alt={`${APP_NAME} logo`} className="wa-logo" />
            </a>
            <div>
              <h1>WhatsApp Inbox</h1>
              <p>Agent + bot conversation console</p>
              {displayWhatsappNumber && (
                <p className="wa-ownNumber">Business Number: {displayWhatsappNumber}</p>
              )}
            </div>
          </div>
          <div className="wa-headerActions">
            <a href="/admin" className="wa-backBtn">
              ← Back
            </a>
            <button type="button" onClick={fetchSessions}>Refresh</button>
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
            <div className="wa-stateLegend" aria-label="Chat state legend">
              <span className="wa-stateLegendTitle">Legend</span>
              <span className="wa-stateLegendName is-lead">Lead Name</span>
              <span className="wa-stateLegendName is-patient">Patient Name</span>
              <span className="wa-stateFlag is-active">Active</span>
              <span className="wa-stateFlag is-unread">Unread</span>
              <span className="wa-stateFlag is-pending">Pending</span>
              <span className="wa-stateFlag is-resolved">Resolved</span>
              <span className="wa-stateFlag is-closed">Closed</span>
              <span className="wa-stateFlag is-expired">24h expired</span>
            </div>
          </div>
        </div>

        <div className="wa-toolbar">
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
        </div>

        <MainContainer>
          <Sidebar position="left" scrollable>
            <ConversationList>
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
                    <Conversation
                      key={session.id}
                      name={
                        <span className="wa-conversationNameWrap">
                          <span className={`wa-conversationNameText ${contactTypeClass}`}>{displayName}</span>
                          <span className="wa-conversationNameFlags">
                            {signals.map((signal) => (
                              <span
                                key={`${session.id}-label-${signal.key}`}
                                className={`wa-stateDot ${signal.className}`}
                                title={signal.label}
                                aria-label={signal.label}
                              />
                            ))}
                          </span>
                        </span>
                      }
                      info={<span className="wa-conversationInfoText">{`${session.phone}${suffix ? ` • ${suffix}` : ""}`}</span>}
                      onClick={() => handleSelect(session)}
                      active={selectedSession?.id === session.id}
                      unreadCnt={session.unread_count || 0}
                      className={signalClasses}
                    />
                  );
                })
              )}
            </ConversationList>
          </Sidebar>

          <div className="wa-chatCol">
            <div className="wa-chatTop">
            <div className="wa-messageFilterBar">
              <span>History:</span>
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
                >
                  {item.label}
                </button>
              ))}
              <label className="wa-botToggle">
                <input
                  type="checkbox"
                  checked={showBotMessages}
                  onChange={(e) => setShowBotMessages(e.target.checked)}
                />
                Show BOT Messages
              </label>
            </div>

            {selectedSession && (
              <div className="wa-sessionActionBar">
                <div className="wa-sessionActionInfo">
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

                <div className="wa-actionBtns">
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

            {selectedSession && (
              <div className="wa-composerActions">
                <div className="wa-composerActionGroup">
                  <select
                    value={clickupAction}
                    onChange={(e) => setClickupAction(e.target.value)}
                    className="wa-inlineSelect"
                  >
                    <option value="followup">Create Follow-up Task</option>
                    <option value="report_request">Create Report Task</option>
                    <option value="doctors_connect">Create Doctor Connect Task</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleCreateClickupTask}
                    disabled={isCreatingTask}
                    className="wa-inlineBtn"
                  >
                    {isCreatingTask ? "Creating..." : "Create ClickUp"}
                  </button>
                </div>
                <div className="wa-composerActionGroup">
                  <input
                    ref={attachInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                    className="wa-hiddenFileInput"
                    onChange={handleAttachmentUpload}
                  />
                  <span className="wa-shortcutHint">Shortcuts: {SHORTCUT_HELP}</span>
                </div>
              </div>
            )}
            </div>

            <div className="wa-chatBody">
              <ChatContainer ref={chatContainerRef}>
              <MessageList onYReachStart={handleLoadOlder}>
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
                      const outgoing = msg.direction === "outbound";
                      const senderLabel = getSenderLabel(msg, user?.id);
                      const isBotMessage = isBotOutboundMessage(msg);
                      const media = getMessageMedia(msg);
                      const msgWithContext = {
                        ...msg,
                        sessionContext: selectedSession?.context || {}
                      };

                      return (
                        <div key={msg.id} className={`wa-msgRow ${outgoing ? "is-out" : "is-in"}`}>
                          {!outgoing && (
                            <div className="wa-avatar wa-avatarPatient">
                              {getInitial(selectedSession?.patient_name || "P")}
                            </div>
                          )}

                          <div className={`wa-msgBubble ${outgoing ? "is-out" : "is-in"} ${isBotMessage ? "is-bot" : ""}`}>
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

                          {outgoing && (
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
              </MessageList>

              {selectedSession && (
                <MessageInput
                  placeholder={
                    !isWithin24(selectedSession)
                      ? "Reply window expired. Use a template message to reopen."
                      : selectedSession.status === "closed"
                        ? "Chat is closed. Mark pending/resolved to continue."
                        : isSending
                          ? "Sending..."
                          : "Type a message"
                  }
                  onSend={handleSend}
                  disabled={!canReply}
                  attachButton
                  onAttachClick={handleAttachmentChoose}
                />
              )}
              </ChatContainer>
            </div>
          </div>
        </MainContainer>
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
          grid-template-rows: auto auto 1fr;
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

        .wa-stateLegend {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-end;
          max-width: 520px;
          margin-left: 8px;
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
        }

        .wa-sidebarHeader p {
          margin: 4px 0 0;
          font-size: 13px;
          color: #607087;
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

        .wa-toolbar {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 10px;
          padding: 10px 16px;
          border-bottom: 1px solid #e0e7f0;
          background: #ffffff;
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

        .wa-toolbar input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #d0d9e6;
          border-radius: 10px;
          padding: 0 12px;
          height: 34px;
          font-size: 14px;
          outline: none;
        }

        .wa-toolbar input:focus {
          border-color: #8ea0b7;
          box-shadow: 0 0 0 3px rgba(142, 160, 183, 0.15);
        }

        .wa-messageFilterBar {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding: 8px 12px;
          border-bottom: 1px solid #e0e7f0;
          background: #fff;
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
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
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
          margin-left: auto;
          flex: 0 0 auto;
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
          margin-top: 2px;
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

        .wa-shortcutHint {
          font-size: 12px;
          color: #546a86;
          font-weight: 600;
        }

        .wa-hiddenFileInput {
          display: none;
        }

        .cs-main-container {
          border-radius: 0;
          border: 0;
          height: 100%;
        }

        .wa-chatCol {
          position: relative;
          z-index: 20;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 0;
          min-width: 0;
          overflow: visible;
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
          position: relative;
          overflow: hidden;
        }

        .wa-chatBody .cs-chat-container {
          flex: 1;
          min-height: 0;
          width: 100%;
          height: 100%;
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
            height: 100vh;
            border-radius: 0;
            border-left: 0;
            border-right: 0;
          }

          .wa-toolbar {
            grid-template-columns: 1fr;
          }

          .wa-sidebarHeader {
            flex-wrap: wrap;
          }

          .wa-headerActions {
            width: 100%;
            justify-content: flex-end;
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
          }

          .cs-sidebar,
          .wa-chatCol,
          .wa-chatBody .cs-chat-container {
            flex-basis: auto !important;
            width: 100% !important;
            min-width: 0;
          }

          .wa-chatBody .cs-chat-container {
            min-height: 48vh;
          }

          .wa-messageFilterBar {
            overflow-x: auto;
            white-space: nowrap;
            -webkit-overflow-scrolling: touch;
          }
        }
      `}</style>
    </div>
  );
}
