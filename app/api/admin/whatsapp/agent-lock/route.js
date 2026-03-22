import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { supabase } from "@/lib/supabaseServer";
import { ironOptions } from "@/lib/session";
import { phoneVariantsIndia } from "@/lib/phone";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];
const LOCK_TTL_MS = 30 * 1000;

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseWhatsappInbox(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

function isMissingTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || message.includes("does not exist") || message.includes("relation");
}

function normalizeLockRow(row, currentUserId = null) {
  if (!row) return null;
  const expiresAtMs = new Date(row.expires_at).getTime();
  const active = Boolean(row.typing) && Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();

  return {
    id: row.id || null,
    lab_id: row.lab_id || null,
    session_id: row.session_id || null,
    phone: row.phone || null,
    agent_id: row.agent_id || null,
    agent_name: row.agent_name || null,
    agent_role: row.agent_role || null,
    typing: Boolean(row.typing),
    active,
    last_seen_at: row.last_seen_at || null,
    expires_at: row.expires_at || null,
    updated_at: row.updated_at || null,
    is_current_user_owner: currentUserId ? row.agent_id === currentUserId : false
  };
}

async function resolveChatSession({ sessionId, phone, labIds }) {
  if (!sessionId && !phone) return null;

  let query = supabase
    .from("chat_sessions")
    .select("id, lab_id, phone, patient_name, status")
    .order("created_at", { ascending: false })
    .limit(1);

  if (labIds.length > 0) {
    query = query.in("lab_id", labIds);
  }

  if (sessionId) {
    query = query.eq("id", sessionId);
  } else {
    query = query.in("phone", phoneVariantsIndia(phone));
  }

  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] || null;
}

async function getExistingLock({ labId, sessionId }) {
  const { data, error } = await supabase
    .from("whatsapp_agent_locks")
    .select("*")
    .eq("lab_id", labId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function GET(request) {
  const response = NextResponse.next();

  try {
    const sessionData = await getIronSession(request, response, ironOptions);
    const user = sessionData?.user;

    if (!user || !canUseWhatsappInbox(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const sessionId = String(url.searchParams.get("sessionId") || "").trim();
    const phone = String(url.searchParams.get("phone") || "").trim();
    const labIds = Array.isArray(user.labIds) ? user.labIds.filter(Boolean) : [];

    const chatSession = await resolveChatSession({ sessionId, phone, labIds });
    if (!chatSession) {
      return NextResponse.json({ lock: null, available: true }, { status: 200 });
    }

    try {
      const lock = await getExistingLock({ labId: chatSession.lab_id, sessionId: chatSession.id });
      return NextResponse.json(
        {
          available: true,
          session: chatSession,
          lock: normalizeLockRow(lock, user.id || null)
        },
        { status: 200 }
      );
    } catch (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          {
            available: false,
            session: chatSession,
            lock: null
          },
          { status: 200 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("[agent-lock] GET error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  const response = NextResponse.next();

  try {
    const sessionData = await getIronSession(request, response, ironOptions);
    const user = sessionData?.user;

    if (!user || !canUseWhatsappInbox(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const sessionId = String(body?.sessionId || "").trim();
    const phone = String(body?.phone || "").trim();
    const typing = body?.typing !== false;
    const labIds = Array.isArray(user.labIds) ? user.labIds.filter(Boolean) : [];

    const chatSession = await resolveChatSession({ sessionId, phone, labIds });
    if (!chatSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    let existingLock = null;
    try {
      existingLock = await getExistingLock({ labId: chatSession.lab_id, sessionId: chatSession.id });
    } catch (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          {
            error: "whatsapp_agent_locks table is missing",
            available: false,
            lock: null
          },
          { status: 501 }
        );
      }
      throw error;
    }

    const normalizedExisting = normalizeLockRow(existingLock, user.id || null);
    if (
      normalizedExisting?.active &&
      normalizedExisting.agent_id &&
      normalizedExisting.agent_id !== user.id
    ) {
      return NextResponse.json(
        {
          error: `${normalizedExisting.agent_name || "Another agent"} is replying to this chat right now.`,
          available: true,
          lock: normalizedExisting
        },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    const expiresAtIso = new Date(Date.now() + LOCK_TTL_MS).toISOString();
    const row = {
      lab_id: chatSession.lab_id,
      session_id: chatSession.id,
      phone: chatSession.phone,
      agent_id: user.id || null,
      agent_name: user.name || "Agent",
      agent_role: getRoleKey(user) || null,
      typing,
      last_seen_at: nowIso,
      expires_at: expiresAtIso,
      updated_at: nowIso
    };

    const { data, error } = await supabase
      .from("whatsapp_agent_locks")
      .upsert(row, { onConflict: "lab_id,session_id" })
      .select("*")
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          {
            error: "whatsapp_agent_locks table is missing",
            available: false,
            lock: null
          },
          { status: 501 }
        );
      }
      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        available: true,
        lock: normalizeLockRow(data, user.id || null)
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[agent-lock] POST error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  const response = NextResponse.next();

  try {
    const sessionData = await getIronSession(request, response, ironOptions);
    const user = sessionData?.user;

    if (!user || !canUseWhatsappInbox(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const sessionId = String(body?.sessionId || "").trim();
    const phone = String(body?.phone || "").trim();
    const labIds = Array.isArray(user.labIds) ? user.labIds.filter(Boolean) : [];

    const chatSession = await resolveChatSession({ sessionId, phone, labIds });
    if (!chatSession) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const { error } = await supabase
      .from("whatsapp_agent_locks")
      .delete()
      .eq("lab_id", chatSession.lab_id)
      .eq("session_id", chatSession.id)
      .eq("agent_id", user.id || "");

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ ok: true, available: false }, { status: 200 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true, available: true }, { status: 200 });
  } catch (error) {
    console.error("[agent-lock] DELETE error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
