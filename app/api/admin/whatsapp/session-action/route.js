import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { phoneVariantsIndia } from "@/lib/phone";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];
const ACTION_TO_STATUS = {
  pending: "pending",
  resolve: "resolved",
  close: "closed"
};

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseWhatsappInbox(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

export async function POST(request) {
  const response = NextResponse.next();

  try {
    const sessionData = await getIronSession(request, response, ironOptions);
    const user = sessionData?.user;

    if (!user || !canUseWhatsappInbox(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { sessionId, action, note, resolution_reason } = await request.json();

    if (!sessionId || !action || !ACTION_TO_STATUS[action]) {
      return NextResponse.json({ error: "Invalid sessionId or action" }, { status: 400 });
    }

    const trimmedNote = String(note || "").trim();
    const trimmedResolutionReason = String(resolution_reason || "").trim().toLowerCase();
    if (action === "resolve" && !trimmedNote) {
      return NextResponse.json({ error: "Closure statement is required to resolve a chat" }, { status: 400 });
    }

    const labIds = Array.isArray(user.labIds) ? user.labIds.filter(Boolean) : [];

    let validateQuery = supabase
      .from("chat_sessions")
      .select("id, lab_id, phone, patient_id, context")
      .eq("id", sessionId)
      .limit(1)
      .maybeSingle();

    if (labIds.length > 0) {
      validateQuery = validateQuery.in("lab_id", labIds);
    }

    const { data: session, error: validateError } = await validateQuery;

    if (validateError) {
      console.error("[whatsapp/session-action] validate error", validateError);
      return NextResponse.json({ error: "Failed to validate session" }, { status: 500 });
    }

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const status = ACTION_TO_STATUS[action];
    const nextContext =
      action === "resolve"
        ? {
            ...(session.context && typeof session.context === "object" ? session.context : {}),
            last_resolution_note: trimmedNote,
            last_resolution_reason: trimmedResolutionReason || null,
            last_resolution_at: new Date().toISOString(),
            last_resolution_by: user.name || user.id || "Unknown",
            last_resolution_by_id: user.id || null,
            last_resolution_by_role: getRoleKey(user) || null,
            last_resolution_feedback_armed: true,
            last_report_feedback_armed: false
          }
        : session.context;

    let updateQuery = supabase
      .from("chat_sessions")
      .update({ status, unread_count: 0, updated_at: new Date(), context: nextContext })
      .eq("lab_id", session.lab_id);

    if (session.patient_id) {
      updateQuery = updateQuery.eq("patient_id", session.patient_id);
    } else {
      updateQuery = updateQuery.in("phone", phoneVariantsIndia(session.phone));
    }

    const { error: updateError } = await updateQuery;

    if (updateError) {
      console.error("[whatsapp/session-action] update error", updateError);
      return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
    }

    if (action === "resolve") {
      const { error: logError } = await supabase.from("whatsapp_messages").insert({
        lab_id: session.lab_id,
        phone: session.phone,
        message: `Resolved: ${trimmedNote}`,
        direction: "status",
        payload: {
          sender: {
            id: user.id || null,
            name: user.name || null,
            role: getRoleKey(user) || null,
            userType: user.userType || null
          },
          internal: true,
          action: "resolve",
          note: trimmedNote,
          resolution_reason: trimmedResolutionReason || null
        }
      });

      if (logError) {
        console.error("[whatsapp/session-action] log error", logError);
      }
    }

    return NextResponse.json({ success: true, status }, { status: 200 });
  } catch (err) {
    console.error("[whatsapp/session-action] unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
