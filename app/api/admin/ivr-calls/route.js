import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { digitsOnly, toCanonicalIndiaPhone } from "@/lib/phone";

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
    if (search) {
      calls = calls.filter((row) => [row.source_number, row.normalized_phone, row.call_id, row.dtmf, row.action_taken]
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

