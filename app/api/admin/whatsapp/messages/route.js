import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseWhatsappInbox(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function toCanonicalPhone(value) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length > 12) return `91${digits.slice(-10)}`;
  return digits;
}

function phoneCandidates(phone) {
  const digits = digitsOnly(phone);
  if (!digits) return [];
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  const canonical = toCanonicalPhone(phone);
  return Array.from(new Set([phone, canonical, digits, last10, last10 ? `91${last10}` : ""].filter(Boolean)));
}

function pickBestPatient({ byPhone = [], byId = null }) {
  const phoneNonLead = byPhone.find((p) => !p?.is_lead);
  if (phoneNonLead) return phoneNonLead;
  if (byId && !byId.is_lead) return byId;
  if (byPhone[0]) return byPhone[0];
  return byId || null;
}

export async function GET(request) {
  const response = NextResponse.next();

  try {
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;

    if (!user || !canUseWhatsappInbox(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const phone = request.nextUrl.searchParams.get("phone");
    if (!phone) {
      return NextResponse.json({ error: "Missing phone" }, { status: 400 });
    }

    const labIds = Array.isArray(user.labIds) ? user.labIds.filter(Boolean) : [];

    let sessionQuery = supabase
      .from("chat_sessions")
      .select("*")
      .in("phone", phoneCandidates(phone))
      .order("created_at", { ascending: false })
      .limit(1);

    if (labIds.length > 0) {
      sessionQuery = sessionQuery.in("lab_id", labIds);
    }

    const { data: chatSessions, error: sessionError } = await sessionQuery;

    if (sessionError) {
      console.error("[whatsapp/messages] session fetch error", sessionError);
      return NextResponse.json({ error: "Failed to validate chat access" }, { status: 500 });
    }

    const chatSession = chatSessions?.[0];
    if (!chatSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { data: messages, error: messagesError } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .in("phone", phoneCandidates(phone))
      .eq("lab_id", chatSession.lab_id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("[whatsapp/messages] message fetch error", messagesError);
      return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
    }

    let lab = null;
    const defaultBotLabelMap = {
      "Main Menu Sent": "Shared main menu options",
      "More Services Menu Sent": "Shared more services menu",
      "Location Sent": "Shared lab location"
    };
    let botLabelMap = { ...defaultBotLabelMap };

    if (chatSession.lab_id) {
      const { data: labData } = await supabase
        .from("labs")
        .select("id, name, logo_url")
        .eq("id", chatSession.lab_id)
        .maybeSingle();
      lab = labData || null;

      const { data: waApiData } = await supabase
        .from("labs_apis")
        .select("templates")
        .eq("lab_id", chatSession.lab_id)
        .eq("api_name", "whatsapp_outbound")
        .maybeSingle();

      let templates = waApiData?.templates;
      if (typeof templates === "string") {
        try {
          templates = JSON.parse(templates);
        } catch {
          templates = null;
        }
      }

      const customLabels =
        templates?.chat_history_labels ||
        templates?.bot_history_labels ||
        templates?.whatsapp_chat_labels ||
        {};

      if (customLabels && typeof customLabels === "object" && !Array.isArray(customLabels)) {
        botLabelMap = { ...defaultBotLabelMap, ...customLabels };
      }
    }

    let linkedById = null;
    if (chatSession.patient_id) {
      const { data: byId } = await supabase
        .from("patients")
        .select("id, name, is_lead, phone")
        .eq("id", chatSession.patient_id)
        .maybeSingle();
      linkedById = byId || null;
    }

    const { data: byPhoneRows } = await supabase
      .from("patients")
      .select("id, name, is_lead, phone")
      .in("phone", phoneCandidates(chatSession.phone))
      .limit(10);

    const linkedPatient = pickBestPatient({
      byPhone: byPhoneRows || [],
      byId: linkedById
    });

    const enrichedSession = {
      ...chatSession,
      patient_name: linkedPatient?.name || chatSession.patient_name || "Unknown Patient",
      contact_type: linkedPatient
        ? (linkedPatient.is_lead ? "lead" : "patient")
        : "lead"
    };

    return NextResponse.json(
      { messages: messages || [], session: enrichedSession, lab, botLabelMap },
      { status: 200 }
    );
  } catch (err) {
    console.error("[whatsapp/messages] unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
