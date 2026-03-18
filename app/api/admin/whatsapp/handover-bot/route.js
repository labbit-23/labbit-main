import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { phoneVariantsIndia } from "@/lib/phone";
import {
  sendTextMessage,
  sendMainMenu,
  sendReportInputPrompt,
  sendBookingDateMenu
} from "@/lib/whatsapp/sender";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];
const ALLOWED_FLOWS = new Set(["reports", "home_visit", "main_menu"]);

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
      return new Response("Forbidden", { status: 403 });
    }

    const body = await request.json();
    const phone = String(body?.phone || "");
    const flow = String(body?.flow || "").toLowerCase();
    const notes = String(body?.notes || "").trim();

    if (!phone || !ALLOWED_FLOWS.has(flow)) {
      return new Response("Invalid phone or flow", { status: 400 });
    }

    const labIds = Array.isArray(user.labIds) ? user.labIds.filter(Boolean) : [];
    let sessionQuery = supabase
      .from("chat_sessions")
      .select("*")
      .in("phone", phoneVariantsIndia(phone))
      .order("created_at", { ascending: false })
      .limit(1);

    if (labIds.length > 0) {
      sessionQuery = sessionQuery.in("lab_id", labIds);
    }

    const { data: sessions } = await sessionQuery;
    const chatSession = sessions?.[0];
    if (!chatSession) {
      return new Response("Session not found", { status: 404 });
    }

    if (!chatSession.last_user_message_at) {
      return new Response("Reply window expired", { status: 400 });
    }

    const within24Hours = Date.now() - new Date(chatSession.last_user_message_at).getTime() < 24 * 60 * 60 * 1000;
    if (!within24Hours) {
      return new Response("Reply window expired", { status: 400 });
    }

    const nextContext = { ...(chatSession.context || {}) };
    if (notes) {
      nextContext.agent_handover_notes = notes;
    }

    let nextState = "START";
    if (flow === "reports") nextState = "REPORT_WAITING_INPUT";
    if (flow === "home_visit") nextState = "BOOKING_DATE";

    await supabase
      .from("chat_sessions")
      .update({
        status: "active",
        current_state: nextState,
        context: nextContext,
        unread_count: 0,
        last_message_at: new Date(),
        updated_at: new Date()
      })
      .eq("id", chatSession.id);

    if (notes) {
      await sendTextMessage({
        labId: chatSession.lab_id,
        phone: chatSession.phone,
        text: notes,
        sender: {
          id: user.id,
          name: user.name || "Agent"
        }
      });
    }

    if (flow === "reports") {
      await sendReportInputPrompt({ labId: chatSession.lab_id, phone: chatSession.phone });
    } else if (flow === "home_visit") {
      await sendBookingDateMenu({ labId: chatSession.lab_id, phone: chatSession.phone });
    } else {
      await sendMainMenu({ labId: chatSession.lab_id, phone: chatSession.phone });
    }

    await supabase
      .from("chat_sessions")
      .update({
        last_message_at: new Date(),
        updated_at: new Date()
      })
      .eq("id", chatSession.id);

    return NextResponse.json({ ok: true, flow }, { status: 200 });
  } catch (err) {
    console.error("[whatsapp/handover-bot] unexpected error", err);
    return new Response("Internal server error", { status: 500 });
  }
}
