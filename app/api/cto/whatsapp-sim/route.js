import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { digitsOnly, phoneVariantsIndia } from "@/lib/phone";
import { POST as webhookPost } from "@/app/api/whatsapp/webhook/route";

export const dynamic = "force-dynamic";

function canAccessCto(user) {
  return user?.userType === "executive" && (user?.executiveType || "").toLowerCase() === "director";
}

function buildWebhookPayload({ phone, name, step }) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const baseMessage = {
    from: digitsOnly(phone),
    id: `wamid.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`,
    timestamp
  };

  let message;
  if (String(step || "").startsWith("button:")) {
    const text = String(step).slice("button:".length).trim() || "Hi";
    message = {
      ...baseMessage,
      type: "button",
      button: {
        payload: text,
        text
      }
    };
  } else if (String(step || "").startsWith("list:")) {
    const [, idRaw, titleRaw] = String(step).split(":");
    const id = String(idRaw || "").trim() || "REQUEST_REPORTS";
    const title = String(titleRaw || id).trim();
    message = {
      ...baseMessage,
      type: "interactive",
      interactive: {
        type: "list_reply",
        list_reply: {
          id,
          title
        }
      }
    };
  } else {
    message = {
      ...baseMessage,
      type: "text",
      text: {
        body: String(step || "")
      }
    };
  }

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "919849110001",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "919849110001",
                phone_number_id: ""
              },
                              contacts: [
                {
                  profile: { name },
                  wa_id: digitsOnly(phone)
                }
              ],
              messages: [message]
            },
            field: "messages"
          }
        ]
      }
    ]
  };
}

function summarizeMessage(row) {
  const sender = row?.payload?.sender;
  const request = row?.payload?.request || {};
  const document = request?.document || {};
  return {
    id: row?.id || null,
    created_at: row?.created_at || null,
    direction: row?.direction || null,
    name: row?.name || null,
    sender_name: sender?.name || null,
    sender_id: sender?.id || null,
    message: row?.message || null,
    payload: row?.payload || {},
    request_type: request?.type || null,
    document_filename: document?.filename || null
  };
}

async function loadTranscript(phone) {
  const variants = phoneVariantsIndia(phone);
  const { data: sessionRows, error: sessionError } = await supabase
    .from("chat_sessions")
    .select("id, lab_id, phone, patient_id, patient_name, status, current_state, context, unread_count, last_message_at, last_user_message_at, created_at")
    .in("phone", variants)
    .order("created_at", { ascending: false })
    .limit(8);

  if (sessionError) throw sessionError;

  const sessions = sessionRows || [];
  const latestLabId = sessions[0]?.lab_id || null;

  let latestSimulationAt = null;
  try {
    let simMarkerQuery = supabase
      .from("whatsapp_messages")
      .select("created_at")
      .in("phone", variants)
      .contains("payload", { simulated: true })
      .order("created_at", { ascending: false })
      .limit(1);

    if (latestLabId) {
      simMarkerQuery = simMarkerQuery.eq("lab_id", latestLabId);
    }

    const { data: simRows } = await simMarkerQuery;
    latestSimulationAt = simRows?.[0]?.created_at || null;
  } catch {
    latestSimulationAt = null;
  }

  let messageQuery = supabase
    .from("whatsapp_messages")
    .select("id, created_at, direction, name, message, payload")
    .in("phone", variants)
    .order("created_at", { ascending: false })
    .limit(80);

  if (latestLabId) {
    messageQuery = messageQuery.eq("lab_id", latestLabId);
  }

  if (latestSimulationAt) {
    const windowStart = new Date(new Date(latestSimulationAt).getTime() - 6 * 60 * 60 * 1000).toISOString();
    messageQuery = messageQuery.gte("created_at", windowStart);
  }

  const { data: messageRows, error: messageError } = await messageQuery;
  if (messageError) throw messageError;

  const filteredSessions = latestSimulationAt
    ? sessions.filter((row) => {
        const cursor = row?.last_message_at || row?.created_at;
        if (!cursor) return false;
        return new Date(cursor).getTime() >= new Date(latestSimulationAt).getTime() - 6 * 60 * 60 * 1000;
      })
    : sessions;

  return {
    sessions: filteredSessions,
    messages: [...(messageRows || [])].reverse().map(summarizeMessage)
  };
}

export async function GET(request) {
  const response = NextResponse.next();

  try {
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;
    if (!canAccessCto(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const phone = String(new URL(request.url).searchParams.get("phone") || "").trim();
    if (!phone) {
      return NextResponse.json({ error: "Missing phone" }, { status: 400 });
    }

    const transcript = await loadTranscript(phone);
    return NextResponse.json(transcript, { status: 200 });
  } catch (error) {
    console.error("[cto/whatsapp-sim] GET error", error);
    return NextResponse.json({ error: "Failed to load simulator transcript" }, { status: 500 });
  }
}

export async function POST(request) {
  const response = NextResponse.next();

  try {
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;
    if (!canAccessCto(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const phone = String(body?.phone || "").trim();
    const name = String(body?.name || "CTO Test").trim();
    const step = String(body?.step || "").trim();

    if (!phone || !step) {
      return NextResponse.json({ error: "Missing phone or step" }, { status: 400 });
    }

    const payload = buildWebhookPayload({ phone, name, step });
    const forwardedRequest = new Request(`${new URL(request.url).origin}/api/whatsapp/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-labbit-sim": "1"
      },
      body: JSON.stringify(payload)
    });

    const webhookResponse = await webhookPost(forwardedRequest);
    const webhookJson = await webhookResponse.json().catch(() => ({}));
    const transcript = await loadTranscript(phone);

    return NextResponse.json(
      {
        ok: webhookResponse.ok,
        webhook_status: webhookResponse.status,
        webhook_body: webhookJson,
        ...transcript
      },
      { status: webhookResponse.ok ? 200 : 500 }
    );
  } catch (error) {
    console.error("[cto/whatsapp-sim] POST error", error);
    return NextResponse.json({ error: "Failed to send simulator message" }, { status: 500 });
  }
}

export async function DELETE(request) {
  const response = NextResponse.next();

  try {
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;
    if (!canAccessCto(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const phone = String(body?.phone || "").trim();
    if (!phone) {
      return NextResponse.json({ error: "Missing phone" }, { status: 400 });
    }

    const variants = phoneVariantsIndia(phone);
    await supabase.from("whatsapp_messages").delete().in("phone", variants);
    await supabase.from("chat_sessions").delete().in("phone", variants);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[cto/whatsapp-sim] DELETE error", error);
    return NextResponse.json({ error: "Failed to reset simulator data" }, { status: 500 });
  }
}
