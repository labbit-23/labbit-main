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

function sessionPhoneKey(phone) {
  return toCanonicalIndiaPhone(phone) || digitsOnly(phone) || String(phone || "").trim();
}

function normalizeSearchTerm(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, 80);
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

function normalizedUnread(row) {
  const status = String(row?.status || "").toLowerCase();
  const isAgentQueue = status === "pending" || status === "handoff" || status === "human_handover";
  return isAgentQueue ? Number(row?.unread_count || 0) : 0;
}

function buildLiteSessions(rows = []) {
  const groupedByPhone = new Map();

  for (const row of rows) {
    const key = toCanonicalIndiaPhone(row.phone) || digitsOnly(row.phone) || row.phone;
    const existing = groupedByPhone.get(key);

    if (!existing) {
      groupedByPhone.set(key, row);
      continue;
    }

    const rowTime = new Date(row.last_message_at || row.created_at || 0).getTime();
    const existingTime = new Date(existing.last_message_at || existing.created_at || 0).getTime();
    if (rowTime > existingTime) {
      groupedByPhone.set(key, row);
    }
  }

  return [...groupedByPhone.values()]
    .map((row) => ({
      ...row,
      patient_name: row.patient_name || row.phone || "Unknown",
      contact_type: row.patient_id ? "patient" : "lead",
      unread_count: normalizedUnread(row),
      matched_patient_count: 0,
      matched_patients: []
    }))
    .sort(
      (a, b) =>
        new Date(b.last_message_at || b.created_at || 0).getTime() -
        new Date(a.last_message_at || a.created_at || 0).getTime()
    );
}

async function enrichLiteSessions(rows = []) {
  const patientIds = Array.from(new Set(rows.map((row) => row?.patient_id).filter(Boolean)));
  const phoneKeys = Array.from(new Set(rows.flatMap((row) => phoneCandidates(row?.phone))));

  let patientRecords = [];
  if (phoneKeys.length > 0) {
    const { data: byPhonePatients } = await supabase
      .from("patients")
      .select("id, name, phone, is_lead, created_at")
      .in("phone", phoneKeys)
      .limit(1000);
    patientRecords = [...patientRecords, ...(byPhonePatients || [])];
  }

  if (patientIds.length > 0) {
    const { data: byIdPatients } = await supabase
      .from("patients")
      .select("id, name, phone, is_lead, created_at")
      .in("id", patientIds)
      .limit(1000);
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

  return rows.map((row) => {
    const linkedById = row.patient_id ? patientById.get(row.patient_id) : null;
    const linkedByPhoneList = phoneCandidates(row.phone)
      .flatMap((candidate) => patientByPhone.get(candidate) || []);
    const linkedPatient = pickBestPatient({ byPhone: linkedByPhoneList, byId: linkedById });
    const matchedPatients = uniquePatients(linkedByPhoneList).sort(
      (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
    );
    const hasNonLead = matchedPatients.some((patient) => !patient?.is_lead);

    return {
      ...row,
      patient_name: row.patient_name || row.phone || "Unknown",
      contact_type: hasNonLead ? "patient" : "lead",
      unread_count: normalizedUnread(row),
      matched_patient_count: matchedPatients.length,
      matched_patients: matchedPatients.map((patient) => ({
        id: patient.id,
        name: patient.name || "Unknown",
        is_lead: Boolean(patient.is_lead)
      })),
      resolved_patient_name: linkedPatient?.name || null
    };
  });
}

async function buildLitePage({ labIds = [], offset = 0, pageLimit = 60, searchTerm = "", statusFilter = "" }) {
  const safeOffset = Number.isFinite(offset) ? Math.max(offset, 0) : 0;
  const safeLimit = Number.isFinite(pageLimit) ? Math.min(Math.max(pageLimit, 20), 200) : 60;
  const targetCount = safeOffset + safeLimit + 1;
  const overFetch = Math.max(150, safeLimit * 8);
  const baseStart = Math.max(0, safeOffset * 2);
  const normalizedSearch = normalizeSearchTerm(searchTerm);

  const normalizedStatus = String(statusFilter || "").trim().toLowerCase();

  const fetchChunk = async (start) => {
    let query = supabase
      .from("chat_sessions")
      .select("id,lab_id,phone,patient_id,patient_name,status,current_state,unread_count,last_message_at,last_user_message_at,created_at,updated_at,context")
      .order("last_message_at", { ascending: false })
      .range(start, start + overFetch - 1);
    if (labIds.length > 0) {
      query = query.in("lab_id", labIds);
    }
    if (normalizedSearch) {
      const safe = normalizedSearch.replace(/[%_,]/g, " ");
      query = query.or(`phone.ilike.%${safe}%,patient_name.ilike.%${safe}%`);
    }
    if (normalizedStatus === "unread") {
      query = query
        .in("status", ["pending", "handoff", "human_handover"])
        .gt("unread_count", 0);
    } else if (normalizedStatus === "unresolved") {
      query = query
        .in("status", ["pending", "handoff", "human_handover"])
        .lte("unread_count", 0);
    } else if (normalizedStatus === "resolved") {
      query = query.eq("status", "resolved");
    } else if (normalizedStatus === "closed") {
      query = query.eq("status", "closed");
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  };

  // Keep DB round-trips very low (1 call in most cases, max 2).
  const firstRows = await fetchChunk(baseStart);
  let combinedRows = firstRows;
  let deduped = buildLiteSessions(combinedRows);
  let secondRows = [];

  if (deduped.length < targetCount && firstRows.length === overFetch) {
    secondRows = await fetchChunk(baseStart + overFetch);
    combinedRows = [...firstRows, ...secondRows];
    deduped = buildLiteSessions(combinedRows);
  }

  const sliced = deduped.slice(safeOffset, safeOffset + safeLimit);
  // Keep "lite" truly lite: avoid patient enrichment fan-out on list polling.
  // Full enrichment is still provided by messages endpoint when a contact is opened.
  const enriched = sliced;
  const nextOffset = safeOffset + sliced.length;
  const likelyMoreFromSource = firstRows.length === overFetch || secondRows.length === overFetch;
  const hasMore = deduped.length > nextOffset || (deduped.length <= nextOffset && likelyMoreFromSource);

  return {
    sessions: enriched,
    pagination: {
      next_offset: nextOffset,
      has_more: hasMore,
      page_size: safeLimit,
      total_count: hasMore ? nextOffset + 1 : nextOffset
    }
  };
}

async function fetchLiteCounts({ labIds = [] }) {
  const applyLab = (query) => (labIds.length > 0 ? query.in("lab_id", labIds) : query);

  const unreadQuery = applyLab(
    supabase
      .from("chat_sessions")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "handoff", "human_handover"])
      .gt("unread_count", 0)
  );

  const unresolvedQuery = applyLab(
    supabase
      .from("chat_sessions")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "handoff", "human_handover"])
      .lte("unread_count", 0)
  );

  const resolvedQuery = applyLab(
    supabase
      .from("chat_sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "resolved")
  );

  const [unreadRes, unresolvedRes, resolvedRes] = await Promise.all([
    unreadQuery,
    unresolvedQuery,
    resolvedQuery
  ]);

  return {
    unread: Number(unreadRes?.count || 0),
    unresolved: Number(unresolvedRes?.count || 0),
    resolved: Number(resolvedRes?.count || 0)
  };
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
    const liteMode = request.nextUrl.searchParams.get("lite") === "1";
    const offsetParam = Number(request.nextUrl.searchParams.get("offset") || 0);
    const limitParam = Number(request.nextUrl.searchParams.get("limit") || 60);
    const pageLimit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 20), 200) : 60;
    const searchTerm = String(request.nextUrl.searchParams.get("search") || "").trim();
    const view = String(request.nextUrl.searchParams.get("view") || "all").trim().toLowerCase();

    if (liteMode) {
      const [liteResponse, counts] = await Promise.all([
        buildLitePage({
          labIds,
          offset: offsetParam,
          pageLimit,
          searchTerm,
          statusFilter: view
        }),
        fetchLiteCounts({ labIds })
      ]);
      return NextResponse.json({ ...liteResponse, counts }, { status: 200 });
    }

    let query = supabase
      .from("chat_sessions")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(5000);

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
          unread_count: normalizedUnread(row),
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

    const sortedSessions = [...sessionsWithLatestName].sort(
      (a, b) =>
        new Date(b.last_message_at || b.created_at || 0).getTime() -
        new Date(a.last_message_at || a.created_at || 0).getTime()
    ).map((row) => ({
      ...row,
      unread_count: normalizedUnread(row)
    }));

    return NextResponse.json({ sessions: sortedSessions }, { status: 200 });
  } catch (err) {
    console.error("[whatsapp/sessions] unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
