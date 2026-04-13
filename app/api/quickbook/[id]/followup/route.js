import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { supabase } from "@/lib/supabaseServer";
import { ironOptions } from "@/lib/session";

const ALLOWED_ROLES = new Set(["admin", "manager", "director"]);
const FOLLOWUP_STATUSES = new Set(["PENDING", "ATTEMPTED", "CONNECTED", "WAITING_PATIENT", "CLOSED", "OTHER"]);
const FOLLOWUP_OUTCOMES = new Set([
  "CONFIRMED_CENTER_VISIT",
  "DECLINED",
  "NO_ANSWER",
  "CALL_BACK_REQUESTED",
  "INVALID_NUMBER",
  "DUPLICATE_REQUEST",
  "CLOSED_NO_ACTION",
  "OTHER",
]);
const FOLLOWUP_CHANNELS = new Set(["CALL", "WHATSAPP", "SMS", "MANUAL", "OTHER"]);

function getRole(user) {
  return String(user?.executiveType || user?.userType || "").trim().toLowerCase();
}

function normalizeUpper(value) {
  return String(value || "").trim().toUpperCase();
}

function isMissingColumnError(error) {
  const message = String(error?.message || "");
  return (
    /column .* does not exist/i.test(message) ||
    /could not find the '.*' column .* schema cache/i.test(message)
  );
}

export async function POST(request, context) {
  const sessionResponse = NextResponse.next();
  const session = await getIronSession(request, sessionResponse, ironOptions);
  const user = session?.user || null;
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = getRole(user);
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing booking id" }, { status: 400 });

  const payload = await request.json();

  const followupStatus = payload?.followup_status == null ? null : normalizeUpper(payload.followup_status);
  const followupOutcome = payload?.followup_outcome == null ? null : normalizeUpper(payload.followup_outcome);
  const followupChannel = payload?.followup_channel == null ? null : normalizeUpper(payload.followup_channel);
  const note = String(payload?.last_followup_note || "").trim();
  const patientResponse = String(payload?.patient_response || "").trim();
  const parsedNextFollowupAt = payload?.next_followup_at ? new Date(payload.next_followup_at) : null;
  const nextFollowupAt = parsedNextFollowupAt && !Number.isNaN(parsedNextFollowupAt.getTime())
    ? parsedNextFollowupAt.toISOString()
    : null;
  const closeBooking = Boolean(payload?.close_booking);

  if (followupStatus && !FOLLOWUP_STATUSES.has(followupStatus)) {
    return NextResponse.json({ error: "Invalid followup_status" }, { status: 400 });
  }
  if (followupOutcome && !FOLLOWUP_OUTCOMES.has(followupOutcome)) {
    return NextResponse.json({ error: "Invalid followup_outcome" }, { status: 400 });
  }
  if (followupChannel && !FOLLOWUP_CHANNELS.has(followupChannel)) {
    return NextResponse.json({ error: "Invalid followup_channel" }, { status: 400 });
  }
  if (payload?.next_followup_at && !nextFollowupAt) {
    return NextResponse.json({ error: "Invalid next_followup_at" }, { status: 400 });
  }
  if ((followupStatus || "IN_PROGRESS") !== "CLOSED" && !nextFollowupAt) {
    return NextResponse.json({ error: "next_followup_at is required for open follow-ups" }, { status: 400 });
  }
  if (followupOutcome === "OTHER" && !note) {
    return NextResponse.json({ error: "Note is required when outcome is OTHER" }, { status: 400 });
  }

  const { data: booking, error: fetchError } = await supabase
    .from("quickbookings")
    .select("id,status,followup_log,followup_status,followup_outcome,followup_channel,last_followup_at,last_followup_by,last_followup_note,patient_response,next_followup_at")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    if (isMissingColumnError(fetchError)) {
      return NextResponse.json({ error: "Follow-up columns not found in quickbookings. Please run latest migration." }, { status: 500 });
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const nowIso = new Date().toISOString();
  const entry = {
    at: nowIso,
    by: String(user.id),
    by_name: String(user?.name || "").trim() || null,
    by_role: role,
    action: "FOLLOWUP_UPDATE",
    followup_status: followupStatus || booking.followup_status || null,
    followup_outcome: followupOutcome || booking.followup_outcome || null,
    followup_channel: followupChannel || booking.followup_channel || null,
    patient_response: patientResponse || null,
    note: note || null,
    next_followup_at: nextFollowupAt || null,
  };

  const existingLog = Array.isArray(booking?.followup_log) ? booking.followup_log : [];
  const followupLog = [...existingLog, entry].slice(-20);

  const currentStatus = normalizeUpper(booking?.status || "PENDING");
  let nextStatus = currentStatus;
  if (closeBooking || followupStatus === "CLOSED") {
    nextStatus = "CLOSED";
  } else if (currentStatus === "" || currentStatus === "PENDING") {
    nextStatus = "IN_PROGRESS";
  }

  const updateData = {
    status: nextStatus,
    followup_status: followupStatus || booking.followup_status || "IN_PROGRESS",
    followup_outcome: followupOutcome || booking.followup_outcome || null,
    followup_channel: followupChannel || booking.followup_channel || null,
    last_followup_at: nowIso,
    last_followup_by: user.id,
    last_followup_note: note || null,
    patient_response: patientResponse || null,
    next_followup_at: nextFollowupAt,
    followup_log: followupLog,
  };

  const { data: updated, error: updateError } = await supabase
    .from("quickbookings")
    .update(updateData)
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) {
    if (isMissingColumnError(updateError)) {
      return NextResponse.json({ error: "Follow-up columns not found in quickbookings. Please run latest migration." }, { status: 500 });
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, booking: updated }, { status: 200 });
}
