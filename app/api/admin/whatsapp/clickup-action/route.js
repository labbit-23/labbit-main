import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { phoneVariantsIndia } from "@/lib/phone";
import {
  createDoctorsConnectClickupTask,
  createReportRequestClickupTask,
  createWhatsappFollowupClickupTask
} from "@/lib/clickup";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseWhatsappInbox(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

export async function POST(req) {
  const response = NextResponse.next();
  try {
    const sessionData = await getIronSession(req, response, ironOptions);
    const user = sessionData?.user;
    if (!user || !canUseWhatsappInbox(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { phone, action, notes } = await req.json();
    if (!phone || !action) {
      return NextResponse.json({ error: "phone and action are required" }, { status: 400 });
    }

    const labIds = Array.isArray(user.labIds) ? user.labIds.filter(Boolean) : [];
    let sessionQuery = supabase
      .from("chat_sessions")
      .select("id, lab_id, phone")
      .in("phone", phoneVariantsIndia(phone))
      .order("created_at", { ascending: false })
      .limit(1);

    if (labIds.length > 0) {
      sessionQuery = sessionQuery.in("lab_id", labIds);
    }

    const { data: sessions } = await sessionQuery;
    const chatSession = sessions?.[0];
    if (!chatSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    let result;
    if (action === "report_request") {
      result = await createReportRequestClickupTask({
        labId: chatSession.lab_id,
        patientPhone: chatSession.phone,
        requestedInput: notes || "Requested by agent from WhatsApp inbox"
      });
    } else if (action === "doctors_connect") {
      result = await createDoctorsConnectClickupTask({
        labId: chatSession.lab_id,
        patientPhone: chatSession.phone,
        notes: notes || "Requested by agent from WhatsApp inbox"
      });
    } else {
      result = await createWhatsappFollowupClickupTask({
        labId: chatSession.lab_id,
        patientPhone: chatSession.phone,
        notes: notes || "Follow-up task created by agent"
      });
    }

    if (!result?.ok) {
      return NextResponse.json({ error: result?.error || result?.reason || "ClickUp task failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, task: result.task || null }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

