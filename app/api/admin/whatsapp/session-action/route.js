import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

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

    const { sessionId, action } = await request.json();

    if (!sessionId || !action || !ACTION_TO_STATUS[action]) {
      return NextResponse.json({ error: "Invalid sessionId or action" }, { status: 400 });
    }

    const labIds = Array.isArray(user.labIds) ? user.labIds.filter(Boolean) : [];

    let validateQuery = supabase
      .from("chat_sessions")
      .select("id, lab_id")
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
    const { error: updateError } = await supabase
      .from("chat_sessions")
      .update({ status, updated_at: new Date() })
      .eq("id", sessionId);

    if (updateError) {
      console.error("[whatsapp/session-action] update error", updateError);
      return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
    }

    return NextResponse.json({ success: true, status }, { status: 200 });
  } catch (err) {
    console.error("[whatsapp/session-action] unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
