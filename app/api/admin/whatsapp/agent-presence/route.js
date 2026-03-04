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
  if (!lastActiveAtIso) return isExecutiveActive ? "online" : "offline";
  const lastMs = new Date(lastActiveAtIso).getTime();
  if (!Number.isFinite(lastMs)) return isExecutiveActive ? "online" : "offline";
  const diffMin = (Date.now() - lastMs) / (60 * 1000);
  if (diffMin <= 5) return "online";
  if (diffMin <= 60) return "away";
  return isExecutiveActive ? "away" : "offline";
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
      .select("id, name, type, active")
      .in("type", ["admin", "manager", "director"]);

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

    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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

    const latestByExec = new Map();
    for (const row of messages || []) {
      const senderId = row?.payload?.sender?.id;
      if (!senderId) continue; // Bot/system message, not agent
      if (!latestByExec.has(senderId)) {
        latestByExec.set(senderId, row.created_at);
      }
    }

    const agents = (executives || [])
      .map((exec) => {
        const lastActiveAt = latestByExec.get(exec.id) || null;
        return {
          id: exec.id,
          name: exec.name || "Unknown",
          role: (exec.type || "").toLowerCase(),
          active: Boolean(exec.active),
          last_active_at: lastActiveAt,
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
