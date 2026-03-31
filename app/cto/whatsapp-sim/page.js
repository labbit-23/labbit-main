"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "../../../components/RequireAuth";
import ShortcutBar from "../../../components/ShortcutBar";

const DEFAULT_PHONE = "919999000001";
const DEFAULT_NAME = "CTO Test";
const STORAGE_PHONE_KEY = "cto_whatsapp_sim_phone";
const STORAGE_NAME_KEY = "cto_whatsapp_sim_name";
const QUICK_STEPS = [
  { label: "Hi", value: "Hi" },
  { label: "Reports", value: "button:Reports" },
  { label: "Home Visit", value: "button:Book Home Visit" },
  { label: "Feedback", value: "button:Feedback" },
  { label: "Trend", value: "button:Trend Report" },
  { label: "More", value: "button:More Services" }
];

function parseServerDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "string") return new Date(value);

  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(value);
  const normalized = hasTimezone ? value : `${value.replace(" ", "T")}Z`;
  return new Date(normalized);
}

function formatTime(value) {
  if (!value) return "";
  const parsed = parseServerDate(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  const formatted = parsed.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
  return `${formatted} IST`;
}

function extractInteractiveOptions(payload = {}) {
  const request = payload?.request || {};
  if (request?.type !== "interactive" || !request?.interactive) return [];

  const interactive = request.interactive;
  if (interactive.type === "button") {
    return (interactive?.action?.buttons || [])
      .map((item) => item?.reply?.title)
      .filter(Boolean)
      .map((title) => ({ label: title, value: `button:${title}` }));
  }

  if (interactive.type === "list") {
    return (interactive?.action?.sections || [])
      .flatMap((section) => section?.rows || [])
      .filter((row) => row?.id && row?.title)
      .map((row) => ({ label: row.title, value: `list:${row.id}:${row.title}` }));
  }

  return [];
}

function extractAttachment(payload = {}) {
  const request = payload?.request || {};
  const rawMedia = payload?.media || payload?.raw_message || {};

  const documentLink =
    request?.document?.link ||
    request?.document?.url ||
    rawMedia?.document?.link ||
    rawMedia?.document?.url ||
    null;
  if (documentLink) {
    return {
      type: "document",
      url: documentLink,
      label: request?.document?.filename || rawMedia?.document?.filename || "Open document"
    };
  }

  const imageLink =
    request?.image?.link ||
    request?.image?.url ||
    rawMedia?.image?.link ||
    rawMedia?.image?.url ||
    null;
  if (imageLink) {
    return {
      type: "image",
      url: imageLink,
      label: "Open image"
    };
  }

  return null;
}

function getMessageDisplayText(msg, fallbackName) {
  const isOutbound = msg.direction === "outbound" || msg.direction === "status";
  const senderName = msg.sender_name || (isOutbound ? "Bot" : msg.name || fallbackName || "User");
  const isDocument = msg.request_type === "document";
  const request = msg.payload?.request || {};
  const baseText = msg.message || (isDocument ? `Document: ${msg.document_filename || "attachment"}` : "");
  const options = extractInteractiveOptions(msg.payload || {});
  const attachment = extractAttachment(msg.payload || {});

  if (options.length > 0) {
    const interactiveBodyText = request?.interactive?.body?.text || "";
    const hasGenericSentText = /(^| )sent$/i.test(String(baseText || "").trim());
    const heading = interactiveBodyText || (!hasGenericSentText ? baseText : "") || "Choose an option:";
    return {
      isOutbound,
      senderName,
      text: `${heading}\n\n${options.map((o) => `- ${o.label}`).join("\n")}`,
      options,
      attachment
    };
  }

  return {
    isOutbound,
    senderName,
    text: baseText || "(empty)",
    options: [],
    attachment
  };
}

function SimulatorPage() {
  const [phone, setPhone] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_PHONE;
    return window.localStorage.getItem(STORAGE_PHONE_KEY) || DEFAULT_PHONE;
  });
  const [name, setName] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_NAME;
    return window.localStorage.getItem(STORAGE_NAME_KEY) || DEFAULT_NAME;
  });
  const [step, setStep] = useState("Hi");
  const [messages, setMessages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");

  const currentSession = sessions[0] || null;

  const loadTranscript = async (targetPhone = phone) => {
    const response = await fetch(`/api/cto/whatsapp-sim?phone=${encodeURIComponent(targetPhone)}`, {
      credentials: "include",
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error || "Failed to load transcript");
    }
    setMessages(Array.isArray(body?.messages) ? body.messages : []);
    setSessions(Array.isArray(body?.sessions) ? body.sessions : []);
  };

  useEffect(() => {
    loadTranscript(phone).catch(() => {});
  }, [phone]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_PHONE_KEY, phone || DEFAULT_PHONE);
  }, [phone]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_NAME_KEY, name || DEFAULT_NAME);
  }, [name]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadTranscript(phone).catch(() => {});
    }, 7000);
    return () => clearInterval(timer);
  }, [phone]);

  const handleSend = async (value = step) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return;

    setError("");
    setHint("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/cto/whatsapp-sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phone,
          name,
          step: trimmed
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || "Simulator send failed");
      }
      setMessages(Array.isArray(body?.messages) ? body.messages : []);
      setSessions(Array.isArray(body?.sessions) ? body.sessions : []);
      setHint(`Webhook ${body?.webhook_status || 200}`);
      setStep("");
    } catch (sendError) {
      setError(sendError?.message || "Failed to send simulator step");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    setError("");
    setHint("");
    setIsLoading(true);
    try {
      const response = await fetch("/api/cto/whatsapp-sim", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || "Reset failed");
      }
      setMessages([]);
      setSessions([]);
      setHint("Simulator history cleared.");
    } catch (resetError) {
      setError(resetError?.message || "Failed to reset simulator");
    } finally {
      setIsLoading(false);
    }
  };

  const renderedMessages = useMemo(() => {
    return messages.map((msg) => ({
      ...msg,
      ...getMessageDisplayText(msg, name)
    }));
  }, [messages, name]);

  const lastBotOptions = useMemo(() => {
    for (let i = renderedMessages.length - 1; i >= 0; i -= 1) {
      const row = renderedMessages[i];
      if (row?.isOutbound && Array.isArray(row?.options) && row.options.length > 0) {
        return row.options.slice(0, 8);
      }
    }
    return [];
  }, [renderedMessages]);

  return (
    <div className="wsim-root">
      <ShortcutBar themeMode="dark" />
      <div className="wsim-shell">
        <div className="wsim-header">
          <div>
            <div className="wsim-eyebrow">CTO Only</div>
            <h1>WhatsApp Bot Simulator</h1>
            <p>Runs real webhook-shaped inputs through the live bot flow and reads back the resulting transcript.</p>
          </div>
          <a href="/cto" className="wsim-link">Back to CTO</a>
        </div>

        <div className="wsim-grid">
          <div className="wsim-panel wsim-controls">
            <label>
              Test Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label>
              Profile Name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Quick Steps
            </label>
            <div className="wsim-quick is-top">
              {QUICK_STEPS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="wsim-chip"
                  onClick={() => handleSend(item.value)}
                  disabled={isLoading}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="wsim-actions">
              <button type="button" className="is-secondary" onClick={() => loadTranscript()} disabled={isLoading}>
                Refresh Transcript
              </button>
              <button type="button" className="is-secondary" onClick={handleReset} disabled={isLoading}>
                Reset Test History
              </button>
            </div>

            {hint && <div className="wsim-hint">{hint}</div>}
            {error && <div className="wsim-error">{error}</div>}

            <div className="wsim-sessionCard">
              <h2>Current Session</h2>
              {currentSession ? (
                <>
                  <div>Status: <strong>{currentSession.status || "n/a"}</strong></div>
                  <div>State: <strong>{currentSession.current_state || "n/a"}</strong></div>
                  <div>Patient: <strong>{currentSession.patient_name || currentSession.phone}</strong></div>
                  <div>Unread: <strong>{currentSession.unread_count || 0}</strong></div>
                  <div>Last Message: <strong>{formatTime(currentSession.last_message_at)}</strong></div>
                </>
              ) : (
                <div>No session yet for this phone.</div>
              )}
            </div>
          </div>

          <div className="wsim-panel wsim-chat">
            <div className="wsim-chatHeader">
              <div className="wsim-avatar">W</div>
              <div>
                <div className="wsim-chatTitle">Bot Conversation</div>
                <div className="wsim-chatMeta">{phone}</div>
              </div>
            </div>

            <div className="wsim-messages">
              {renderedMessages.length === 0 ? (
                <div className="wsim-empty">No simulator messages yet.</div>
              ) : renderedMessages.map((msg) => (
                <div key={`${msg.id}-${msg.created_at}`} className={`wsim-row ${msg.isOutbound ? "is-out" : "is-in"}`}>
                  <div className={`wsim-bubble ${msg.isOutbound ? "is-out" : "is-in"}`}>
                    <div className="wsim-meta">
                      <span>{msg.senderName}</span>
                      <span>{formatTime(msg.created_at)}</span>
                    </div>
                    <div className="wsim-text">{msg.text || "(empty)"}</div>
                    {msg.attachment?.url && (
                      <a
                        className="wsim-attachmentLink"
                        href={msg.attachment.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {msg.attachment.label || "Open attachment"}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="wsim-composer">
              {lastBotOptions.length > 0 && (
                <div className="wsim-quick">
                  {lastBotOptions.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className="wsim-chip is-light"
                      onClick={() => handleSend(item.value)}
                      disabled={isLoading}
                      title={item.value}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="wsim-composerRow">
                <textarea
                  value={step}
                  onChange={(e) => setStep(e.target.value)}
                  placeholder='Type "Hi", "button:Reports", "list:REQUEST_REPORTS:Reports"'
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <button type="button" onClick={() => handleSend()} disabled={isLoading}>
                  {isLoading ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .wsim-root {
          min-height: 100vh;
          background: linear-gradient(180deg, #0d1726 0%, #111827 100%);
          color: #f8fafc;
          padding: 28px 20px;
        }

        .wsim-shell {
          max-width: 1360px;
          margin: 0 auto;
          padding-top: 68px;
        }

        .wsim-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 24px;
        }

        .wsim-header h1 {
          margin: 0 0 6px;
          font-size: 34px;
        }

        .wsim-header p,
        .wsim-eyebrow {
          margin: 0;
          color: rgba(248, 250, 252, 0.72);
        }

        .wsim-eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-size: 12px;
          margin-bottom: 8px;
        }

        .wsim-link {
          color: #7ef4d7;
          text-decoration: none;
          font-weight: 600;
        }

        .wsim-grid {
          display: grid;
          grid-template-columns: 360px minmax(0, 1fr);
          gap: 20px;
        }

        .wsim-panel {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 28px;
          padding: 20px;
          backdrop-filter: blur(18px);
        }

        .wsim-controls label {
          display: block;
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 14px;
        }

        .wsim-controls {
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          min-height: 70vh;
        }

        .wsim-controls input,
        .wsim-controls textarea {
          width: 100%;
          margin-top: 8px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(7, 12, 22, 0.55);
          color: #f8fafc;
          padding: 12px 14px;
          font: inherit;
          box-sizing: border-box;
        }

        .wsim-controls textarea {
          min-height: 92px;
          resize: vertical;
        }

        .wsim-quick {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 8px 0 0;
        }

        .wsim-quick.is-top {
          margin-bottom: 16px;
        }

        .wsim-chip,
        .wsim-actions button {
          border: 0;
          border-radius: 999px;
          background: rgba(126, 244, 215, 0.14);
          color: #f8fafc;
          padding: 10px 14px;
          cursor: pointer;
          font: inherit;
          font-weight: 700;
        }

        .wsim-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .wsim-actions .is-secondary {
          background: rgba(255,255,255,0.08);
        }

        .wsim-error,
        .wsim-hint,
        .wsim-sessionCard {
          margin-top: 14px;
          border-radius: 18px;
          padding: 14px;
        }

        .wsim-error {
          background: rgba(248,113,113,0.12);
          border: 1px solid rgba(248,113,113,0.28);
        }

        .wsim-hint {
          background: rgba(126,244,215,0.12);
          border: 1px solid rgba(126,244,215,0.2);
        }

        .wsim-sessionCard {
          background: rgba(7, 12, 22, 0.45);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .wsim-sessionCard h2 {
          margin: 0 0 10px;
          font-size: 16px;
        }

        .wsim-sessionCard div {
          margin-top: 6px;
          color: rgba(248,250,252,0.84);
          font-size: 14px;
        }

        .wsim-chat {
          display: flex;
          flex-direction: column;
          min-height: 70vh;
          padding-bottom: 12px;
        }

        .wsim-chatHeader {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        .wsim-avatar {
          width: 42px;
          height: 42px;
          border-radius: 999px;
          background: #0f7f85;
          display: grid;
          place-items: center;
          font-weight: 800;
        }

        .wsim-chatTitle {
          font-weight: 700;
        }

        .wsim-chatMeta {
          color: rgba(248,250,252,0.68);
          font-size: 13px;
        }

        .wsim-messages {
          flex: 1;
          overflow-y: auto;
          padding: 18px 4px 4px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-height: 340px;
        }

        .wsim-row {
          display: flex;
        }

        .wsim-row.is-out {
          justify-content: flex-end;
        }

        .wsim-bubble {
          max-width: min(72%, 620px);
          border-radius: 18px;
          padding: 12px 14px;
        }

        .wsim-bubble.is-in {
          background: #ffffff;
          color: #152238;
          border-top-left-radius: 6px;
        }

        .wsim-bubble.is-out {
          background: #d8fdd2;
          color: #17311d;
          border-top-right-radius: 6px;
        }

        .wsim-meta {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          font-size: 11px;
          font-weight: 700;
          opacity: 0.72;
          margin-bottom: 8px;
        }

        .wsim-text {
          white-space: pre-wrap;
          line-height: 1.45;
          font-size: 13px;
        }

        .wsim-attachmentLink {
          display: inline-block;
          margin-top: 8px;
          font-size: 13px;
          font-weight: 700;
          color: inherit;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .wsim-empty {
          color: rgba(248,250,252,0.62);
          margin: auto;
        }

        .wsim-composer {
          margin-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.08);
          padding-top: 12px;
        }

        .wsim-composerRow {
          margin-top: 8px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: end;
        }

        .wsim-composerRow textarea {
          min-height: 56px;
          max-height: 140px;
          resize: vertical;
          width: 100%;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(7, 12, 22, 0.55);
          color: #f8fafc;
          padding: 12px 14px;
          font: inherit;
          box-sizing: border-box;
        }

        .wsim-composerRow button {
          border: 0;
          border-radius: 14px;
          background: #18a57b;
          color: #f8fafc;
          padding: 11px 16px;
          cursor: pointer;
          font: inherit;
          font-weight: 700;
          min-height: 46px;
        }

        .wsim-chip.is-light {
          background: rgba(255,255,255,0.1);
        }

        @media (max-width: 980px) {
          .wsim-grid {
            grid-template-columns: 1fr;
          }

          .wsim-controls {
            justify-content: flex-start;
            min-height: auto;
          }

          .wsim-chat {
            min-height: 52vh;
          }
        }
      `}</style>
    </div>
  );
}

export default function CtoWhatsappSimPage() {
  return (
    <RequireAuth roles={["director"]}>
      <SimulatorPage />
    </RequireAuth>
  );
}
