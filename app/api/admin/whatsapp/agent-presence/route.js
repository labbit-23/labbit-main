import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { supabase } from "@/lib/supabaseServer";
import { ironOptions } from "@/lib/session";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseWhatsappInbox(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

function derivePresence(lastActiveAtIso, isExecutiveActive = false) {
  // If executive is not active in app-level auth, treat as logged out.
  if (!isExecutiveActive) return "offline";

  // Logged in but no WA chat activity yet -> away (not offline).
  if (!lastActiveAtIso) return "away";

  const lastMs = new Date(lastActiveAtIso).getTime();
  if (!Number.isFinite(lastMs)) return "away";

  const diffMin = (Date.now() - lastMs) / (60 * 1000);
  if (diffMin <= 5) return "online";
  if (diffMin <= 90) return "away";

  // Guard against stale "active=true" sessions not cleaned up.
  if (diffMin > 12 * 60) return "offline";

  return "away";
}

function pickLatestIso(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function isMissingTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || message.includes("does not exist") || message.includes("relation");
}

export async function GET(req) {
  const response = NextResponse.next();
  try {
    const session = await getIronSession(req, response, ironOptions);
    const user = session?.user;
    if (!user || !canUseWhatsappInbox(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const labIds = Array.isArray(user.labIds) ? user.labIds.filter(Boolean) : [];

    let execQuery = supabase
      .from("executives")
      .select("id, name, type, active");

    if (labIds.length > 0) {
      const { data: mappings, error: mappingError } = await supabase
        .from("executives_labs")
        .select("executive_id")
        .in("lab_id", labIds);

      if (mappingError) {
        return NextResponse.json({ error: mappingError.message }, { status: 500 });
      }

      const execIds = Array.from(new Set((mappings || []).map((m) => m.executive_id).filter(Boolean)));
      // Fallback: if no lab mapping exists, still return all allowed executives
      // so header does not look empty for valid admin users.
      if (execIds.length > 0) {
        execQuery = execQuery.in("id", execIds);
      }
    }

    const { data: executives, error: execError } = await execQuery;
    if (execError) {
      return NextResponse.json({ error: execError.message }, { status: 500 });
    }

    const sinceIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    let msgQuery = supabase
      .from("whatsapp_messages")
      .select("created_at, payload, lab_id")
      .eq("direction", "outbound")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (labIds.length > 0) {
      msgQuery = msgQuery.in("lab_id", labIds);
    }

    const { data: messages, error: msgError } = await msgQuery;
    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    const latestByExecFromMessages = new Map();
    for (const row of messages || []) {
      const senderId = row?.payload?.sender?.id;
      if (!senderId) continue; // Bot/system message, not agent
      if (!latestByExecFromMessages.has(senderId)) {
        latestByExecFromMessages.set(senderId, row.created_at);
      }
    }

    const lockWindowIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    let latestByExecFromLocks = new Map();
    try {
      let lockQuery = supabase
        .from("whatsapp_agent_locks")
        .select("agent_id, last_seen_at, lab_id")
        .not("agent_id", "is", null)
        .gte("last_seen_at", lockWindowIso)
        .order("last_seen_at", { ascending: false })
        .limit(5000);

      if (labIds.length > 0) {
        lockQuery = lockQuery.in("lab_id", labIds);
      }

      const { data: lockRows, error: lockError } = await lockQuery;
      if (lockError) {
        if (!isMissingTableError(lockError)) {
          return NextResponse.json({ error: lockError.message }, { status: 500 });
        }
      } else {
        for (const row of lockRows || []) {
          const agentId = row?.agent_id;
          const seenAt = row?.last_seen_at || null;
          if (!agentId || !seenAt) continue;
          if (!latestByExecFromLocks.has(agentId)) {
            latestByExecFromLocks.set(agentId, seenAt);
          }
        }
      }
    } catch (lockErr) {
      if (!isMissingTableError(lockErr)) {
        return NextResponse.json({ error: lockErr?.message || "Failed to load agent lock presence" }, { status: 500 });
      }
    }

    const allowedRoles = new Set(["admin", "manager", "director"]);
    const agents = (executives || [])
      .filter((exec) => allowedRoles.has(String(exec?.type || "").toLowerCase()))
      .map((exec) => {
        const lastFromLocks = latestByExecFromLocks.get(exec.id) || null;
        const lastFromMessages = latestByExecFromMessages.get(exec.id) || null;
        const lastActiveAt = pickLatestIso(lastFromLocks, lastFromMessages);
        return {
          id: exec.id,
          name: exec.name || "Unknown",
          role: (exec.type || "").toLowerCase(),
          active: Boolean(exec.active),
          last_active_at: lastActiveAt,
          last_lock_seen_at: lastFromLocks,
          last_message_at: lastFromMessages,
          presence: derivePresence(lastActiveAt, Boolean(exec.active))
        };
      })
      .sort((a, b) => {
        const rank = { online: 0, away: 1, offline: 2 };
        if (rank[a.presence] !== rank[b.presence]) return rank[a.presence] - rank[b.presence];
        return String(a.name).localeCompare(String(b.name));
      });

    return NextResponse.json({ agents }, { status: 200 });
  } catch (err) {
    console.error("[agent-presence] error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
