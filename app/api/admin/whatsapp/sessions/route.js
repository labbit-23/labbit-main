import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { digitsOnly, phoneVariantsIndia, toCanonicalIndiaPhone } from "@/lib/phone";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseWhatsappInbox(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

function phoneCandidates(phone) {
  return phoneVariantsIndia(phone);
}

function pickBestPatient({ byPhone = [], byId = null }) {
  const sorted = [...byPhone].sort((a, b) => {
    const at = new Date(a?.created_at || 0).getTime();
    const bt = new Date(b?.created_at || 0).getTime();
    return bt - at;
  });
  const phoneNonLead = sorted.find((p) => !p?.is_lead);
  if (phoneNonLead) return phoneNonLead;
  if (byId && !byId.is_lead) return byId;
  if (sorted[0]) return sorted[0];
  return byId || null;
}

function uniquePatients(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!row?.id || map.has(row.id)) continue;
    map.set(row.id, row);
  }
  return [...map.values()];
}

function uniqueNames(values = []) {
  return Array.from(
    new Set(
      values
        .map((v) => String(v || "").trim())
        .filter(Boolean)
    )
  );
}

function pickLatestProfileName(messageRows = []) {
  return (
    (messageRows || [])
      .map((row) => row?.name || row?.payload?.profile_name)
      .find((value) => typeof value === "string" && value.trim()) || null
  );
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
        .select("id, name, phone, is_lead, created_at")
        .in("phone", phoneKeys)
        .limit(5000);
      patientRecords = [...patientRecords, ...(byPhonePatients || [])];
    }

    if (patientIds.length > 0) {
      const { data: byIdPatients } = await supabase
        .from("patients")
        .select("id, name, phone, is_lead, created_at")
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
      const matchedPatients = uniquePatients(linkedByPhoneList).sort(
        (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
      );
      const matchedPatientCount = matchedPatients.length;
      const contactType = linkedPatient
        ? (linkedPatient.is_lead ? "lead" : "patient")
        : "lead";
      const nameCandidates = uniqueNames(matchedPatients.map((p) => p?.name));

      return {
        ...s,
        patient_name: s.patient_name || "Unknown",
        contact_type: contactType,
        chat_name: s.patient_name || null,
        resolved_patient_name: linkedPatient?.name || null,
        name_candidates: nameCandidates,
        has_multiple_names: nameCandidates.length > 1,
        matched_patient_count: matchedPatientCount,
        matched_patients: matchedPatients.map((p) => ({
          id: p.id,
          name: p.name || "Unknown",
          is_lead: Boolean(p.is_lead)
        }))
      };
    });

    const groupedByPhone = new Map();
    for (const sessionRow of enrichedSessions) {
      const key = toCanonicalIndiaPhone(sessionRow.phone) || digitsOnly(sessionRow.phone) || sessionRow.phone;
      const group = groupedByPhone.get(key) || [];
      group.push(sessionRow);
      groupedByPhone.set(key, group);
    }

    const dedupedSessions = [];
    for (const groupRows of groupedByPhone.values()) {
      const sortedByRecent = [...groupRows].sort(
        (a, b) =>
          new Date(b.last_message_at || b.created_at || 0).getTime() -
          new Date(a.last_message_at || a.created_at || 0).getTime()
      );

      const latestRow = sortedByRecent[0];
      const allMatchedPatients = uniquePatients(
        sortedByRecent.flatMap((row) => row.matched_patients || [])
      ).sort(
        (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
      );
      const allPatientNames = uniqueNames(allMatchedPatients.map((p) => p?.name));
      const latestChatName = latestRow?.chat_name || null;
      const displayName = latestChatName || latestRow?.phone || "Unknown";
      const hasNonLead = allMatchedPatients.some((p) => !p?.is_lead);

      dedupedSessions.push({
        ...latestRow,
        patient_name: displayName,
        name_candidates: allPatientNames,
        has_multiple_names: allPatientNames.length > 1,
        chat_name: latestChatName || null,
        matched_patient_count: allMatchedPatients.length,
        matched_patients: allMatchedPatients.map((p) => ({
          id: p.id,
          name: p.name || "Unknown",
          is_lead: Boolean(p.is_lead),
          created_at: p.created_at || null
        })),
        contact_type: hasNonLead ? "patient" : "lead"
      });
    }

    const sessionsWithLatestName = await Promise.all(
      dedupedSessions.map(async (row) => {
        let latestMessageQuery = supabase
          .from("whatsapp_messages")
          .select("name,payload,created_at")
          .in("phone", phoneCandidates(row.phone))
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(50);

        if (labIds.length > 0) {
          latestMessageQuery = latestMessageQuery.in("lab_id", labIds);
        } else if (row.lab_id) {
          latestMessageQuery = latestMessageQuery.eq("lab_id", row.lab_id);
        }

        const { data: latestInboundRows } = await latestMessageQuery;
        const latestInboundProfileName = pickLatestProfileName(latestInboundRows);

        const displayName = latestInboundProfileName || row.phone || "Unknown";

        return {
          ...row,
          patient_name: displayName,
          chat_name: latestInboundProfileName || row.chat_name || null,
          name_candidates: row.name_candidates || [],
          has_multiple_names: (row.name_candidates || []).length > 1,
          matched_patient_count: row.matched_patient_count || 0,
          matched_patients: (row.matched_patients || []).sort(
            (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
          )
        };
      })
    );

    return NextResponse.json({ sessions: sessionsWithLatestName }, { status: 200 });
  } catch (err) {
    console.error("[whatsapp/sessions] unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
