// Thin, token-authenticated wrapper over two direct-Supabase reads the
// WhatsApp bot's webhook route makes inline today (findLocalPatientByPhone /
// findActiveVisitForPatient in app/api/whatsapp/webhook/route.js) -- so an
// external caller (IVR platform, or anything else outside this Next.js
// process) can resolve "who is this phone number, and do they have an
// upcoming visit" without querying Supabase directly. Same auth pattern as
// /api/internal/whatsapp/send (WHATSAPP_INTERNAL_SEND_TOKEN bearer token).
//
// Mirrors the webhook route's own query logic byte-for-byte (same tables,
// same columns, same excluded-status list) rather than re-deriving it, so
// this can never silently drift from what the bot itself sees.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { digitsOnly, phoneVariantsIndia } from "@/lib/phone";

function getAuthToken(request) {
  return (
    request.headers.get("x-internal-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
}

function requireAuth(request) {
  const expectedToken = process.env.WHATSAPP_INTERNAL_SEND_TOKEN || "";
  const providedToken = getAuthToken(request);
  return Boolean(expectedToken) && providedToken === expectedToken;
}

async function findPatientByPhone(rawPhone) {
  const variants = phoneVariantsIndia(rawPhone);
  if (variants.length === 0) return null;

  const { data: rows } = await supabase
    .from("patients")
    .select("id, name, phone, email, dob, gender, mrn, is_lead, created_at")
    .in("phone", variants)
    .limit(10);

  const patients = [...(rows || [])].sort(
    (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
  );
  const nonLead = patients.find((p) => !p?.is_lead);
  return nonLead || patients[0] || null;
}

async function findActiveVisit({ patientId, labId, phone = null, mrn = null }) {
  if (!labId) return null;

  const todayIso = new Date().toISOString().slice(0, 10);
  const excludedStatuses = "cancelled,canceled,rejected,disabled,closed";
  const candidatePatientIds = new Set();
  if (patientId) candidatePatientIds.add(patientId);

  const normalizedPhone = digitsOnly(phone || "").slice(-10);
  if (normalizedPhone) {
    const phoneCandidates = Array.from(
      new Set([
        normalizedPhone,
        ...phoneVariantsIndia(normalizedPhone).map((p) => digitsOnly(p).slice(-10)).filter(Boolean)
      ])
    );
    if (phoneCandidates.length > 0) {
      const { data: matchedPatients } = await supabase
        .from("patients")
        .select("id")
        .in("phone", phoneCandidates)
        .limit(20);
      for (const row of matchedPatients || []) {
        if (row?.id) candidatePatientIds.add(row.id);
      }
    }
  }

  const normalizedMrn = String(mrn || "").trim();
  if (normalizedMrn) {
    const { data: mrnMatchedPatients } = await supabase
      .from("patients")
      .select("id")
      .eq("mrn", normalizedMrn)
      .limit(20);
    for (const row of mrnMatchedPatients || []) {
      if (row?.id) candidatePatientIds.add(row.id);
    }
  }

  const lookupIds = Array.from(candidatePatientIds).filter(Boolean);
  if (lookupIds.length === 0) return null;

  const { data, error } = await supabase
    .from("visits")
    .select(`
      id,
      visit_code,
      visit_date,
      status,
      address,
      time_slot:time_slot(slot_name, start_time, end_time),
      executive:executive_id(name, phone)
    `)
    .in("patient_id", lookupIds)
    .eq("lab_id", labId)
    .gte("visit_date", todayIso)
    .not("status", "in", `(${excludedStatuses})`)
    .order("visit_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ivr/patient-lookup] active visit lookup failed", {
      patientId, lookupIds, mrn: normalizedMrn || null, labId, error: error?.message || String(error)
    });
    return null;
  }
  return data || null;
}

export async function GET(request) {
  if (!requireAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const phone = String(url.searchParams.get("phone") || "").trim();
  const labId = String(url.searchParams.get("lab_id") || "").trim();
  const mrn = String(url.searchParams.get("mrn") || "").trim();

  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }
  if (!labId) {
    return NextResponse.json({ error: "lab_id is required" }, { status: 400 });
  }

  try {
    const patient = await findPatientByPhone(phone);
    const activeVisit = await findActiveVisit({
      patientId: patient?.id || null,
      labId,
      phone,
      mrn
    });
    return NextResponse.json({ patient: patient || null, active_visit: activeVisit || null }, { status: 200 });
  } catch (error) {
    console.error("[ivr/patient-lookup] error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
