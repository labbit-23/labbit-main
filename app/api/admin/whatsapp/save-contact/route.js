import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { digitsOnly, phoneVariantsIndia, phoneLast10 } from "@/lib/phone";
import savePatientExternalKey from "@/lib/savePatientExternalKey";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseWhatsappInbox(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

function mapExternalGender(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["1", "m", "male"].includes(text)) return "M";
  if (["0", "f", "female"].includes(text)) return "F";
  return "";
}

async function findChatSession({ phone, sessionId, labIds }) {
  let query = supabase
    .from("chat_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (labIds.length > 0) {
    query = query.in("lab_id", labIds);
  }

  if (sessionId) {
    query = query.eq("id", sessionId);
  } else {
    query = query.in("phone", phoneVariantsIndia(phone));
  }

  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] || null;
}

async function findLocalCandidates({ phone, patientId }) {
  const variants = phoneVariantsIndia(phone);
  const [{ data: byPhoneRows, error: byPhoneError }, byIdResult] = await Promise.all([
    supabase
      .from("patients")
      .select("id, name, phone, email, dob, gender, mrn, is_lead, created_at")
      .in("phone", variants)
      .order("created_at", { ascending: false })
      .limit(10),
    patientId
      ? supabase
          .from("patients")
          .select("id, name, phone, email, dob, gender, mrn, is_lead, created_at")
          .eq("id", patientId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (byPhoneError) throw byPhoneError;
  if (byIdResult?.error) throw byIdResult.error;

  const byId = byIdResult?.data || null;
  const rows = Array.isArray(byPhoneRows) ? byPhoneRows : [];
  const preferredNonLead = rows.find((row) => !row?.is_lead);
  const preferred = preferredNonLead || byId || rows[0] || null;

  return {
    linkedPatient: preferred,
    candidates: rows,
    linkedById: byId
  };
}

async function fetchExternalPatientProfile({ labId, phone }) {
  const cleanPhone = digitsOnly(phone);
  if (!cleanPhone) return null;

  const { data: apiConfig } = await supabase
    .from("labs_apis")
    .select("base_url, auth_details, templates")
    .eq("lab_id", labId)
    .eq("api_name", "external_patient_lookup")
    .maybeSingle();

  if (!apiConfig?.base_url || !apiConfig?.auth_details?.apikey) {
    return null;
  }

  const fieldMap = apiConfig.templates?.field_map || {
    name: "FNAME",
    dob: "DOB",
    gender: "SEX",
    email: "EMAIL",
    mrn: "MRN",
    external_key: "CREGNO"
  };

  const dataParam = encodeURIComponent(JSON.stringify([{ phone: cleanPhone }]));
  const url = `${apiConfig.base_url}&data=${dataParam}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiConfig.auth_details.apikey}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) return null;

  const payload = await response.json();
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.patients)
      ? payload.patients
      : payload
        ? [payload]
        : [];

  const first = rows[0];
  if (!first) return null;

  return {
    name: String(first[fieldMap.name] || "").trim() || null,
    dob: first[fieldMap.dob] ? String(first[fieldMap.dob]).split(" ")[0] : null,
    gender: mapExternalGender(first[fieldMap.gender]),
    email: first[fieldMap.email] || null,
    mrn: first[fieldMap.mrn] || null,
    external_key: first[fieldMap.external_key] || null
  };
}

async function latestInboundProfileName({ labId, phone }) {
  let query = supabase
    .from("whatsapp_messages")
    .select("name,payload,created_at")
    .in("phone", phoneVariantsIndia(phone))
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(20);

  if (labId) {
    query = query.eq("lab_id", labId);
  }

  const { data } = await query;
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => row?.name || row?.payload?.profile_name).find((value) => String(value || "").trim()) || null;
}

export async function POST(request) {
  const response = NextResponse.next();

  try {
    const sessionData = await getIronSession(request, response, ironOptions);
    const user = sessionData?.user;

    if (!user || !canUseWhatsappInbox(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const phone = String(body?.phone || "").trim();
    const sessionId = String(body?.sessionId || "").trim();
    if (!phone && !sessionId) {
      return NextResponse.json({ error: "Missing phone or sessionId" }, { status: 400 });
    }

    const labIds = Array.isArray(user.labIds) ? user.labIds.filter(Boolean) : [];
    const chatSession = await findChatSession({ phone, sessionId, labIds });
    if (!chatSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const canonicalPhone = phoneLast10(chatSession.phone) || phoneLast10(phone) || digitsOnly(chatSession.phone) || chatSession.phone;
    const [externalProfile, inboundProfileName, local] = await Promise.all([
      fetchExternalPatientProfile({ labId: chatSession.lab_id, phone: chatSession.phone }),
      latestInboundProfileName({ labId: chatSession.lab_id, phone: chatSession.phone }),
      findLocalCandidates({ phone: chatSession.phone, patientId: chatSession.patient_id })
    ]);

    let patient = local.linkedPatient;
    const baseName =
      String(externalProfile?.name || "").trim() ||
      String(inboundProfileName || "").trim() ||
      String(chatSession.patient_name || "").trim() ||
      "WhatsApp Contact";

    if (patient) {
      const updates = {
        name: patient.is_lead ? baseName : patient.name || baseName,
        phone: canonicalPhone,
        dob: externalProfile?.dob || patient.dob || null,
        gender: externalProfile?.gender || patient.gender || null,
        email: externalProfile?.email || patient.email || null,
        mrn: externalProfile?.mrn || patient.mrn || null,
        is_lead: false
      };

      const { data: updatedPatient, error: updateError } = await supabase
        .from("patients")
        .update(updates)
        .eq("id", patient.id)
        .select("id, name, phone, email, dob, gender, mrn, is_lead")
        .single();

      if (updateError) {
        throw updateError;
      }
      patient = updatedPatient;
    } else {
      const { data: createdPatient, error: createError } = await supabase
        .from("patients")
        .insert({
          name: baseName,
          phone: canonicalPhone,
          dob: externalProfile?.dob || null,
          gender: externalProfile?.gender || null,
          email: externalProfile?.email || null,
          mrn: externalProfile?.mrn || null,
          is_lead: false
        })
        .select("id, name, phone, email, dob, gender, mrn, is_lead")
        .single();

      if (createError) {
        throw createError;
      }
      patient = createdPatient;
    }

    const externalKey = String(externalProfile?.external_key || "").trim();
    if (patient?.id && externalKey && chatSession.lab_id) {
      await savePatientExternalKey(patient.id, chatSession.lab_id, externalKey);
    }

    await supabase
      .from("chat_sessions")
      .update({
        patient_id: patient.id,
        patient_name: baseName,
        updated_at: new Date().toISOString()
      })
      .eq("id", chatSession.id);

    return NextResponse.json(
      {
        ok: true,
        patient: {
          ...patient,
          external_key: externalKey || null,
          lab_id: chatSession.lab_id
        },
        session: {
          id: chatSession.id,
          phone: chatSession.phone,
          patient_id: patient.id,
          patient_name: baseName,
          contact_type: "patient"
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[whatsapp/save-contact] error", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save contact" },
      { status: 500 }
    );
  }
}
