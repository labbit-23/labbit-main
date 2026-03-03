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

    const labIds = Array.isArray(user.labIds) ? user.labIds.filter(Boolean) : [];

    let query = supabase.from("chat_sessions").select("*").order("last_message_at", { ascending: false });

    if (labIds.length > 0) {
      query = query.in("lab_id", labIds);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[whatsapp/sessions] fetch error", error);
      return NextResponse.json({ error: "Failed to load sessions" }, { status: 500 });
    }

    const sessions = data || [];

    const patientIds = Array.from(
      new Set(sessions.map((s) => s.patient_id).filter(Boolean))
    );

    const phoneKeys = Array.from(
      new Set(
        sessions.flatMap((s) => phoneCandidates(s.phone))
      )
    );

    let patientRecords = [];
    if (phoneKeys.length > 0) {
      const { data: byPhonePatients } = await supabase
        .from("patients")
        .select("id, name, phone, is_lead")
        .in("phone", phoneKeys)
        .limit(5000);
      patientRecords = [...patientRecords, ...(byPhonePatients || [])];
    }

    if (patientIds.length > 0) {
      const { data: byIdPatients } = await supabase
        .from("patients")
        .select("id, name, phone, is_lead")
        .in("id", patientIds)
        .limit(5000);
      patientRecords = [...patientRecords, ...(byIdPatients || [])];
    }

    const patientById = new Map();
    const patientByPhone = new Map();

    for (const patient of patientRecords) {
      if (patient?.id) patientById.set(patient.id, patient);
      for (const candidate of phoneCandidates(patient?.phone)) {
        const list = patientByPhone.get(candidate) || [];
        list.push(patient);
        patientByPhone.set(candidate, list);
      }
    }

    const enrichedSessions = sessions.map((s) => {
      const linkedById = s.patient_id ? patientById.get(s.patient_id) : null;
      const linkedByPhoneList = phoneCandidates(s.phone)
        .flatMap((candidate) => patientByPhone.get(candidate) || []);
      const linkedPatient = pickBestPatient({ byPhone: linkedByPhoneList, byId: linkedById });
      const contactType = linkedPatient
        ? (linkedPatient.is_lead ? "lead" : "patient")
        : "lead";

      return {
        ...s,
        patient_name: linkedPatient?.name || s.patient_name || "Unknown Patient",
        contact_type: contactType
      };
    });

    const dedupedMap = new Map();
    for (const sessionRow of enrichedSessions) {
      const key = toCanonicalPhone(sessionRow.phone) || digitsOnly(sessionRow.phone) || sessionRow.phone;
      const prev = dedupedMap.get(key);
      if (!prev) {
        dedupedMap.set(key, sessionRow);
        continue;
      }

      const prevScore = (prev.contact_type === "patient" ? 10 : 0) + new Date(prev.last_message_at || prev.created_at || 0).getTime();
      const nextScore = (sessionRow.contact_type === "patient" ? 10 : 0) + new Date(sessionRow.last_message_at || sessionRow.created_at || 0).getTime();
      if (nextScore > prevScore) {
        dedupedMap.set(key, sessionRow);
      }
    }

    return NextResponse.json({ sessions: Array.from(dedupedMap.values()) }, { status: 200 });
  } catch (err) {
    console.error("[whatsapp/sessions] unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
