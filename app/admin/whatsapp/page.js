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
import { useUser } from "@/app/context/UserContext";

const APP_LOGO = process.env.NEXT_PUBLIC_LABBIT_LOGO || "/logo.png";
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Labbit";
const IST_TIMEZONE = "Asia/Kolkata";

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
  const diff = Date.now() - new Date(session.last_user_message_at).getTime();
  return diff < 24 * 60 * 60 * 1000;
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

function getDisplayMessageText(msg, botLabelMap) {
  if (!msg) return "";

  const sender = msg?.payload?.sender;
  const isBotOutbound = msg.direction === "outbound" && !sender?.id && !sender?.name;
  const rawMessage = msg.message || "";

  if (msg.direction === "inbound") {
    if (rawMessage.startsWith("SLOT_PAGE_")) {
      const pageNo = rawMessage.replace("SLOT_PAGE_", "").trim();
      return `Viewed more time slots${pageNo ? ` (page ${pageNo})` : ""}`;
    }

    if (rawMessage.startsWith("DATE_")) {
      const iso = rawMessage.replace("DATE_", "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        const [year, month, day] = iso.split("-");
        return `Selected date: ${day}-${month}-${year}`;
      }
    }

    if (rawMessage.startsWith("SLOT_")) {
      const slotId = rawMessage.replace("SLOT_", "").trim();
      const slotMap = msg?.sessionContext?.available_slots || {};
      const slotName = slotMap?.[slotId];
      return slotName ? `Selected time slot: ${slotName}` : `Selected slot`;
    }

    const slotMap = msg?.sessionContext?.available_slots || {};
    if (slotMap?.[rawMessage]) {
      return `Selected time slot: ${slotMap[rawMessage]}`;
    }

    return rawMessage;
  }

  if (!isBotOutbound) return rawMessage;

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
          return `${baseText}\n\nOptions:\n${options.map((o) => `- ${o}`).join("\n")}`.trim();
        }
        return baseText || msg.message;
      }

      if (interactive.type === "list") {
        const rows = (interactive?.action?.sections || [])
          .flatMap((section) => section?.rows || [])
          .map((row) => row?.title)
          .filter(Boolean);
        if (rows.length > 0) {
          return `${baseText}\n\nOptions:\n${rows.map((r) => `- ${r}`).join("\n")}`.trim();
        }
        return baseText || msg.message;
      }
    }

    if (requestPayload.type === "location" && requestPayload.location) {
      const loc = requestPayload.location;
      const parts = [loc.name, loc.address].filter(Boolean);
      return parts.length ? `Shared location:\n${parts.join("\n")}` : "Shared location";
    }
  }

  return botLabelMap?.[rawMessage] || rawMessage;
}

export default function WhatsAppDashboard() {
  const { user, isLoading: isUserLoading } = useUser();

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
  const [isSending, setIsSending] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [error, setError] = useState("");

  const messageEndRef = useRef(null);

  useEffect(() => {
    if (isUserLoading || !user) return;
    fetchSessions();
  }, [isUserLoading, user]);

  useEffect(() => {
    if (!messageEndRef.current) return;
    messageEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const fetchSessions = async () => {
    setError("");
    setIsLoadingSessions(true);

    try {
      const response = await fetch("/api/admin/whatsapp/sessions", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load sessions");

      const body = await response.json();
      const nextSessions = body.sessions || [];
      setSessions(nextSessions);

      if (selectedSession) {
        const freshSelected = nextSessions.find((s) => s.id === selectedSession.id);
        setSelectedSession(freshSelected || null);
      }
    } catch {
      setError("Failed to load conversations.");
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const fetchMessages = async (phone) => {
    if (!phone) return;

    setError("");
    setIsLoadingMessages(true);

    try {
      const response = await fetch(`/api/admin/whatsapp/messages?phone=${encodeURIComponent(phone)}`, {
        credentials: "include"
      });

      if (!response.ok) throw new Error("Failed to load messages");

      const body = await response.json();
      setMessages(body.messages || []);
      if (body.session) setSelectedSession(body.session);
      setLabMeta(body.lab || null);
      setBotLabelMap(body.botLabelMap || {});
    } catch {
      setError("Failed to load messages.");
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleSelect = async (session) => {
    setSelectedSession(session);
    await fetchMessages(session.phone);
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
    if (senderFilter === "all") return messages;

    return messages.filter((msg) => {
      if (msg.direction !== "outbound") return false;

      const hasAgent = Boolean(msg?.payload?.sender?.id || msg?.payload?.sender?.name);
      if (senderFilter === "agent") return hasAgent;
      if (senderFilter === "bot") return !hasAgent;
      return true;
    });
  }, [messages, senderFilter]);

  const canReply = Boolean(
    selectedSession &&
    selectedSession.status !== "closed" &&
    isWithin24(selectedSession) &&
    !isSending &&
    !isUpdatingStatus
  );
  const isExpiredWindow = Boolean(selectedSession && !isWithin24(selectedSession));
  const shouldRecommendClose = Boolean(selectedSession && isExpiredWindow && selectedSession.status !== "closed");

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
            </div>
          </div>
          <div className="wa-headerActions">
            <a href="/admin" className="wa-backBtn">
              ← Back
            </a>
            <button type="button" onClick={fetchSessions}>Refresh</button>
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
                  const live = isWithin24(session);
                  const suffix = formatDateTime(session.last_message_at);
                  const contactType = session.contact_type === "lead" ? "Lead" : "Patient";

                  return (
                    <Conversation
                      key={session.id}
                      name={`${session.patient_name || "Unknown Patient"} (${contactType})`}
                      info={`${session.phone}${suffix ? ` • ${suffix}` : ""}`}
                      onClick={() => handleSelect(session)}
                      active={selectedSession?.id === session.id}
                      unreadCnt={session.unread_count || 0}
                    >
                      <div className="wa-conversationMeta">
                        <span className={`wa-status ${live ? "is-live" : "is-expired"}`}>
                          {live ? "Live window" : "Window expired"}
                        </span>
                      </div>
                    </Conversation>
                  );
                })
              )}
            </ConversationList>
          </Sidebar>

          <ChatContainer>

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
            </div>

            {selectedSession && (
              <div className="wa-sessionActionBar">
                <div className="wa-sessionActionInfo">
                  <span className="wa-sessionName">
                    {selectedSession.patient_name || selectedSession.phone}
                  </span>
                  <span className={`wa-status ${selectedSession.contact_type === "lead" ? "is-lead" : "is-patient"}`}>
                    {selectedSession.contact_type === "lead" ? "Lead" : "Patient"}
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

            <MessageList>
              {!selectedSession ? (
                <div className="wa-empty">Select a conversation to view messages.</div>
              ) : isLoadingMessages ? (
                <div className="wa-empty">Loading messages...</div>
              ) : filteredMessages.length === 0 ? (
                <div className="wa-empty">No messages for this filter.</div>
              ) : (
                filteredMessages.map((msg) => {
                  const outgoing = msg.direction === "outbound";
                  const senderLabel = getSenderLabel(msg, user?.id);
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

                      <div className={`wa-msgBubble ${outgoing ? "is-out" : "is-in"}`}>
                        <div className="wa-msgMeta">
                          <span className="wa-msgSender">{senderLabel}</span>
                          <span className="wa-msgTime">{formatMessageTime(msg.created_at)} IST</span>
                        </div>
                        <div className="wa-msgText">{getDisplayMessageText(msgWithContext, botLabelMap)}</div>
                      </div>

                      {outgoing && (
                        <div className="wa-avatar wa-avatarLab">
                          <img src={labMeta?.logo_url || APP_LOGO} alt="Lab logo" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messageEndRef} />
            </MessageList>

            {error && <div className="wa-error">{error}</div>}

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
                attachButton={false}
              />
            )}
          </ChatContainer>
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
          color: #122033;
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
          background: #1c2a3d;
          border-color: #1c2a3d;
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
          padding: 8px 12px;
          border-bottom: 1px solid #e0e7f0;
          background: #fff;
          font-size: 12px;
          color: #607087;
        }

        .wa-conversationMeta {
          margin-top: 4px;
          font-size: 11px;
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
          background: #e7f0ff;
          color: #1f4e8a;
        }

        .wa-status.is-lead {
          background: #fce8ef;
          color: #9b1d4a;
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
          background: #1c2a3d;
          color: #fff;
          border-color: #1c2a3d;
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

        .wa-error {
          border-top: 1px solid #f0d4d4;
          background: #fff5f5;
          color: #b42318;
          font-size: 12px;
          font-weight: 600;
          padding: 8px 12px;
        }

        .cs-main-container {
          border-radius: 0;
          border: 0;
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

          .cs-sidebar {
            min-width: 280px;
          }
        }
      `}</style>
    </div>
  );
}
