import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { digitsOnly, phoneVariantsIndia, toCanonicalIndiaPhone } from "@/lib/phone";

const ALLOWED_ROLES = new Set(["admin", "manager", "director"]);
const REVIEW_STATUSES = new Set(["new", "reviewed", "follow_up", "closed"]);

function roleKey(user) {
  return String(user?.userType === "executive" ? user?.executiveType : user?.userType || "").toLowerCase();
}

async function sessionUser(request, response) {
  const session = await getIronSession(request, response, ironOptions);
  return session?.user || null;
}

function allowed(user) {
  return ALLOWED_ROLES.has(roleKey(user));
}

function cleanPhone(value) {
  return toCanonicalIndiaPhone(value) || digitsOnly(value) || String(value || "").trim();
}

function cleanText(value, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function pickWhatsappName(row) {
  const direct = cleanText(row?.name, 160);
  if (direct) return direct;
  return cleanText(row?.payload?.profile_name || row?.payload?.raw_message?.profile?.name, 160);
}

function userLabIds(user) {
  return [...new Set([
    ...(Array.isArray(user?.labIds) ? user.labIds : []),
    user?.labId,
  ].map((value) => String(value || "").trim()).filter(Boolean))];
}

async function resolveCallerIdentities(rows, user) {
  const canonicalPhones = [...new Set(rows.map((row) => cleanPhone(row.source_number)).filter(Boolean))];
  const variants = [...new Set(canonicalPhones.flatMap((phone) => phoneVariantsIndia(phone)))];
  const patients = [];
  const messages = [];
  const labIds = userLabIds(user);

  for (let offset = 0; offset < variants.length; offset += 200) {
    const batch = variants.slice(offset, offset + 200);
    let patientQuery = supabase
      .from("patients")
      .select("id,name,phone,mrn,is_lead,created_at")
      .in("phone", batch)
      .order("created_at", { ascending: false });
    let messageQuery = supabase
      .from("whatsapp_messages")
      .select("phone,name,payload,created_at")
      .in("phone", batch)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false });
    if (labIds.length) {
      messageQuery = messageQuery.in("lab_id", labIds);
    }
    const [patientResult, messageResult] = await Promise.all([patientQuery, messageQuery]);
    if (patientResult.error) throw patientResult.error;
    if (messageResult.error) throw messageResult.error;
    patients.push(...(patientResult.data || []));
    messages.push(...(messageResult.data || []));
  }

  const patientMap = new Map();
  for (const patient of patients) {
    const phone = cleanPhone(patient.phone);
    const existing = patientMap.get(phone);
    if (!phone || (existing && !existing.is_lead)) continue;
    patientMap.set(phone, patient);
  }
  const whatsappMap = new Map();
  for (const message of messages) {
    const phone = cleanPhone(message.phone);
    const name = pickWhatsappName(message);
    if (phone && name && !whatsappMap.has(phone)) whatsappMap.set(phone, name);
  }

  return new Map(canonicalPhones.map((phone) => {
    const patient = patientMap.get(phone);
    const whatsappName = whatsappMap.get(phone) || null;
    return [phone, {
      display_name: cleanText(patient?.name, 160) || whatsappName || null,
      name_source: patient?.name ? "patient" : whatsappName ? "whatsapp" : "unknown",
      patient_id: patient?.id || null,
      mrn: patient?.mrn || null,
      whatsapp_name: whatsappName,
    }];
  }));
}

function statusValue(row) {
  return cleanText(row?.payload?.status || row?.payload?.raw_status?.status, 30).toLowerCase();
}

async function resolveWhatsappOutcomes(rows, user) {
  const reportCalls = rows.filter((row) => ["sent_latest_report", "latest_report_send_failed"].includes(row.action_taken));
  if (!reportCalls.length) return new Map();
  const variants = [...new Set(reportCalls.flatMap((row) => phoneVariantsIndia(row.source_number)))];
  const earliest = Math.min(...reportCalls.map((row) => new Date(row.created_at).getTime())) - 10 * 60000;
  const messages = [];
  const labIds = userLabIds(user);
  for (let offset = 0; offset < variants.length; offset += 200) {
    let query = supabase
      .from("whatsapp_messages")
      .select("phone,direction,message_id,payload,created_at")
      .in("phone", variants.slice(offset, offset + 200))
      .in("direction", ["outbound", "status"])
      .gte("created_at", new Date(earliest).toISOString())
      .order("created_at", { ascending: false });
    if (labIds.length) query = query.in("lab_id", labIds);
    const result = await query;
    if (result.error) throw result.error;
    messages.push(...(result.data || []));
  }

  const statusesById = new Map();
  const statusRank = { accepted: 1, sent: 2, delivered: 3, read: 4, failed: 5 };
  for (const message of messages) {
    if (message.direction !== "status") continue;
    const id = message.message_id || message.payload?.provider_message_id;
    const status = statusValue(message);
    if (!id || !status) continue;
    const existing = statusesById.get(id);
    if (!existing || (statusRank[status] || 0) >= (statusRank[existing.status] || 0)) {
      statusesById.set(id, { status, at: message.payload?.timestamp || message.created_at });
    }
  }

  const outcomes = new Map();
  for (const call of reportCalls) {
    if (call.action_taken === "latest_report_send_failed") {
      outcomes.set(call.id, { status: "failed", at: call.created_at, provider_message_id: null });
      continue;
    }
    const callTime = new Date(call.created_at).getTime();
    const outbound = messages.find((message) => {
      if (message.direction !== "outbound" || cleanPhone(message.phone) !== cleanPhone(call.source_number)) return false;
      if (message.payload?.sender?.source_service !== "bonvoice_ivr") return false;
      return Math.abs(new Date(message.created_at).getTime() - callTime) <= 5 * 60000;
    });
    const providerId = outbound?.message_id || outbound?.payload?.response?.messages?.[0]?.id || null;
    const callback = providerId ? statusesById.get(providerId) : null;
    outcomes.set(call.id, {
      status: callback?.status || (outbound ? "accepted" : "sent"),
      at: callback?.at || outbound?.created_at || call.created_at,
      provider_message_id: providerId,
    });
  }
  return outcomes;
}

function callerSummary(rows) {
  const callers = new Map();
  for (const row of rows) {
    const phone = cleanPhone(row.source_number) || "Unknown";
    const current = callers.get(phone) || {
      phone,
      call_count: 0,
      first_call_at: row.created_at,
      last_call_at: row.created_at,
      latest_action: row.action_taken,
      latest_dtmf: row.dtmf,
      open_reviews: 0,
      identity: row.identity || null,
    };
    current.call_count += 1;
    if (new Date(row.created_at) < new Date(current.first_call_at)) current.first_call_at = row.created_at;
    if (new Date(row.created_at) > new Date(current.last_call_at)) {
      current.last_call_at = row.created_at;
      current.latest_action = row.action_taken;
      current.latest_dtmf = row.dtmf;
    }
    if (["new", "follow_up"].includes(row.review?.status || "new")) current.open_reviews += 1;
    callers.set(phone, current);
  }
  return [...callers.values()].sort((a, b) => new Date(b.last_call_at) - new Date(a.last_call_at));
}

export async function GET(request) {
  const response = NextResponse.next();
  try {
    const user = await sessionUser(request, response);
    if (!allowed(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(request.url);
    const search = cleanText(url.searchParams.get("search"), 80).toLowerCase();
    const status = cleanText(url.searchParams.get("status"), 20);
    const days = Math.min(180, Math.max(1, Number(url.searchParams.get("days")) || 30));
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data: rawRows, error } = await supabase
      .from("ivr_call_log")
      .select("id, call_id, source_number, dtmf, action_taken, whatsapp_status, bonvoice_payload, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw error;

    const callIds = [...new Set((rawRows || []).map((row) => row.call_id).filter(Boolean))];
    let reviews = [];
    for (let offset = 0; offset < callIds.length; offset += 250) {
      const result = await supabase.from("ivr_call_reviews").select("*").in("call_id", callIds.slice(offset, offset + 250));
      if (result.error && result.error.code !== "42P01") throw result.error;
      reviews.push(...(result.data || []));
    }
    const reviewMap = new Map(reviews.map((row) => [row.call_id, row]));
    let calls = (rawRows || []).map((row) => ({
      ...row,
      normalized_phone: cleanPhone(row.source_number),
      review: reviewMap.get(row.call_id) || { status: "new" },
    }));
    const [identityMap, outcomeMap] = await Promise.all([
      resolveCallerIdentities(calls, user),
      resolveWhatsappOutcomes(calls, user),
    ]);
    calls = calls.map((row) => ({
      ...row,
      identity: identityMap.get(row.normalized_phone) || null,
      delivery: outcomeMap.get(row.id) || null,
    }));
    if (search) {
      calls = calls.filter((row) => [row.source_number, row.normalized_phone, row.call_id, row.dtmf, row.action_taken, row.identity?.display_name, row.identity?.mrn]
        .some((value) => String(value || "").toLowerCase().includes(search)));
    }
    if (status && status !== "all") calls = calls.filter((row) => row.review.status === status);

    return NextResponse.json({ ok: true, calls, callers: callerSummary(calls), days });
  } catch (error) {
    console.error("[admin/ivr-calls][GET]", error);
    return NextResponse.json({ error: "Failed to load IVR calls" }, { status: 500 });
  }
}

export async function PATCH(request) {
  const response = NextResponse.next();
  try {
    const user = await sessionUser(request, response);
    if (!allowed(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const callId = cleanText(body?.call_id, 240);
    const status = cleanText(body?.status, 20);
    if (!callId) return NextResponse.json({ error: "call_id is required" }, { status: 400 });
    if (!REVIEW_STATUSES.has(status)) return NextResponse.json({ error: "Invalid review status" }, { status: 400 });

    const actor = cleanText(user?.name || user?.email || user?.id || roleKey(user), 160);
    const now = new Date().toISOString();
    const review = {
      call_id: callId,
      status,
      follow_up_owner: cleanText(body?.follow_up_owner, 160) || null,
      notes: cleanText(body?.notes, 4000) || null,
      reviewed_by: actor || null,
      reviewed_at: status === "new" ? null : now,
      updated_at: now,
    };
    const { data, error } = await supabase.from("ivr_call_reviews").upsert(review, { onConflict: "call_id" }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, review: data });
  } catch (error) {
    console.error("[admin/ivr-calls][PATCH]", error);
    return NextResponse.json({ error: "Failed to save IVR review" }, { status: 500 });
  }
}

