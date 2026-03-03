///app/admin/whatsapp/page.js

"use client";

import { useEffect, useState } from "react";
import {
  MainContainer,
  Sidebar,
  ConversationList,
  Conversation,
  ChatContainer,
  MessageList,
  Message,
  MessageInput
} from "@chatscope/chat-ui-kit-react";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function WhatsAppDashboard() {

  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    const { data } = await supabase
      .from("chat_sessions")
      .select("*")
      .order("last_message_at", { ascending: false });

    setSessions(data || []);
  };

  const fetchMessages = async (phone) => {
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("phone", phone)
      .order("created_at", { ascending: true });

    setMessages(data || []);
  };

  const handleSelect = async (session) => {
    setSelectedSession(session);
    await fetchMessages(session.phone);

    // Reset unread count
    await supabase
      .from("chat_sessions")
      .update({ unread_count: 0 })
      .eq("id", session.id);

    fetchSessions();
  };

  const handleSend = async (text) => {
    if (!selectedSession) return;

    await fetch("/api/admin/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: selectedSession.phone,
        message: text
      })
    });

    await fetchMessages(selectedSession.phone);
    await fetchSessions();
  };

  const isWithin24 = (session) => {
    if (!session.last_user_message_at) return false;
    const diff =
      new Date() - new Date(session.last_user_message_at);
    return diff < 24 * 60 * 60 * 1000;
  };

  const activeSessions = sessions.filter(
    (s) => s.status !== "closed"
  );

  const closedSessions = sessions.filter(
    (s) => s.status === "closed"
  );

  return (
    <div style={{ height: "100vh" }}>
      <MainContainer>

        {/* SIDEBAR */}
        <Sidebar position="left" scrollable>

          <ConversationList>

            {activeSessions.map((session) => (
              <Conversation
                key={session.id}
                name={
                  session.patient_name ||
                  session.phone
                }
                info={session.phone}
                onClick={() => handleSelect(session)}
                active={
                  selectedSession?.phone === session.phone
                }
                unreadCnt={session.unread_count || 0}
              >
                <div style={{ fontSize: 12 }}>
                  {isWithin24(session) ? (
                    <span style={{ color: "green" }}>
                      ● LIVE
                    </span>
                  ) : (
                    <span style={{ color: "orange" }}>
                      EXPIRED
                    </span>
                  )}
                  {"  "}
                  {session.country_code &&
                    `+${session.country_code}`}
                </div>
              </Conversation>
            ))}

            {closedSessions.length > 0 && (
              <>
                <div style={{
                  padding: 10,
                  fontSize: 12,
                  color: "#666"
                }}>
                  CLOSED
                </div>

                {closedSessions.map((session) => (
                  <Conversation
                    key={session.id}
                    name={
                      session.patient_name ||
                      session.phone
                    }
                    info={session.phone}
                    onClick={() => handleSelect(session)}
                    active={
                      selectedSession?.phone === session.phone
                    }
                  />
                ))}
              </>
            )}

          </ConversationList>
        </Sidebar>

        {/* CHAT AREA */}
        <ChatContainer>

          <MessageList>

            {messages.map((msg) => (
              <Message
                key={msg.id}
                model={{
                  message: msg.message,
                  sentTime: new Date(
                    msg.created_at
                  ).toLocaleTimeString(),
                  sender:
                    msg.direction === "outbound"
                      ? "You"
                      : "User",
                  direction:
                    msg.direction === "outbound"
                      ? "outgoing"
                      : "incoming"
                }}
              />
            ))}

          </MessageList>

          {selectedSession && (
            <MessageInput
              placeholder="Type message"
              onSend={handleSend}
            />
          )}

        </ChatContainer>

      </MainContainer>
    </div>
  );
}