// File: /app/api/visits/[id]/route.js

import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabaseServer";
import { getIronSession } from "iron-session";
import { ironOptions } from "../../../../lib/session";
import { cookies } from "next/headers"; // for server-side session

// SMS helpers
import {
  sendPatientVisitSms,
  sendPhleboVisitSms,
  // sendAdminVisitSms, // optional future
  // sendLogisticsVisitSms // optional future
} from "@/lib/visitSms";
import { sendPatientVisitWhatsapp } from "@/lib/visitWhatsapp";

const VISIT_DETAIL_SELECT_WITH_GEO = `
  id,
  patient_id,
  executive_id,
  executive:executive_id (
    id,
    name,
    phone
  ),
  lab_id,
  visit_date,
  time_slot,
  address,
  lat,
  lng,
  status,
  address_id,
  time_slot:time_slot (
    id,
    slot_name,
    start_time,
    end_time
  )
`;

const VISIT_DETAIL_SELECT_NO_GEO = `
  id,
  patient_id,
  executive_id,
  executive:executive_id (
    id,
    name,
    phone
  ),
  lab_id,
  visit_date,
  time_slot,
  address,
  status,
  address_id,
  time_slot:time_slot (
    id,
    slot_name,
    start_time,
    end_time
  )
`;

function isMissingVisitsGeoColumnError(error) {
  const text = String(error?.message || error || "").toLowerCase();
  return text.includes("column") && text.includes("visits") && (text.includes("lat") || text.includes("lng"));
}

function stripVisitGeoFields(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...payload };
  delete next.lat;
  delete next.lng;
  return next;
}

function normalizeStatusCode(value) {
  return String(value || "").trim().toLowerCase();
}

function shouldPromoteToBooked({ explicitStatus, statusValue, previousStatus, previousExecutiveId, effectiveExecutiveId }) {
  if (!effectiveExecutiveId) return false;

  const nextStatus = normalizeStatusCode(statusValue);
  const prevStatus = normalizeStatusCode(previousStatus);

  if (explicitStatus) {
    return nextStatus === "unassigned" || !nextStatus;
  }

  const isNewAssignment = !previousExecutiveId && !!effectiveExecutiveId;
  return isNewAssignment || prevStatus === "unassigned" || !prevStatus;
}

async function notifyPatientWhatsappWithSmsFallback(visitId) {
  try {
    await sendPatientVisitWhatsapp(visitId);
  } catch (waError) {
    console.error(`Visit ${visitId}: Patient WhatsApp failed, falling back to SMS:`, waError?.message || waError);
    await sendPatientVisitSms(visitId);
  }
}

/**
 * GET - Fetch a single visit by ID with executive and time_slot details
 */
export async function GET(request, context) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "Missing visit ID" }, { status: 400 });
  }

  try {
    let { data, error } = await supabase
      .from("visits")
      .select(VISIT_DETAIL_SELECT_WITH_GEO)
      .eq("id", id)
      .single();

    if (error && isMissingVisitsGeoColumnError(error)) {
      ({ data, error } = await supabase
        .from("visits")
        .select(VISIT_DETAIL_SELECT_NO_GEO)
        .eq("id", id)
        .single());
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT - Update a visit by ID
 *  - Logs changes in visit_activity_log
 *  - Sends notifications based on visit_statuses.notify_to (JSONB)
 */
export async function PUT(request, context) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "Missing visit ID" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const session = await getIronSession(cookieStore, ironOptions);
  const user = session?.user || null;

  try {
    const body = await request.json();

    const allowedFields = [
      "patient_id",
      "executive_id",
      "lab_id",
      "visit_date",
      "time_slot",
      "address",
      "address_id",
      "lat",
      "lng",
      "status",
      "notes",
      "prescription"
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields provided for update" },
        { status: 400 }
      );
    }

    // 1️⃣ Fetch current record BEFORE update
    const { data: oldVisit, error: oldErr } = await supabase
      .from("visits")
      .select(`*, executive:executive_id ( id, name, phone )`)
      .eq("id", id)
      .single();

    if (oldErr) {
      return NextResponse.json({ error: oldErr.message }, { status: 404 });
    }

    const hasExplicitStatus = Object.prototype.hasOwnProperty.call(updateData, "status");
    const effectiveExecutiveId = updateData.executive_id ?? oldVisit.executive_id;
    if (shouldPromoteToBooked({
      explicitStatus: hasExplicitStatus,
      statusValue: updateData.status,
      previousStatus: oldVisit.status,
      previousExecutiveId: oldVisit.executive_id,
      effectiveExecutiveId,
    })) {
      updateData.status = "booked";
    }

    // 2️⃣ Update the visit
    let finalUpdateData = { ...updateData };
    let { data: newVisit, error: updateErr } = await supabase
      .from("visits")
      .update(finalUpdateData)
      .eq("id", id)
      .select(`*, executive:executive_id ( id, name, phone )`)
      .single();

    if (updateErr && isMissingVisitsGeoColumnError(updateErr)) {
      const stripped = stripVisitGeoFields(finalUpdateData);
      if (Object.keys(stripped).length === 0) {
        return NextResponse.json({ error: "No valid fields provided for update" }, { status: 400 });
      }

      finalUpdateData = stripped;
      ({ data: newVisit, error: updateErr } = await supabase
        .from("visits")
        .update(finalUpdateData)
        .eq("id", id)
        .select(`*, executive:executive_id ( id, name, phone )`)
        .single());
    }

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 3️⃣ Insert into visit_activity_log
    try {
      await supabase.from("visit_activity_log").insert({
        visit_id: id,
        changed_by: user?.id || null,
        changed_by_role: user?.executiveType || user?.userType || "system",
        activity_type: "visit_update",
        old_value: oldVisit,
        new_value: newVisit,
        remark: `Updated via API /visits/${id}`
      });
    } catch (logErr) {
      console.error("Failed to log visit update:", logErr.message);
    }

    // 4️⃣ If status changed, check visit_statuses.notify_to for notifications
    if (updateData.status && updateData.status !== oldVisit.status) {
      const { data: statusRow, error: statusErr } = await supabase
        .from("visit_statuses")
        .select("notify_to")
        .eq("code", updateData.status)
        .single();

      if (!statusErr && Array.isArray(statusRow?.notify_to)) {
        for (const role of statusRow.notify_to) {
          try {
            if (role === "patient") {
              await notifyPatientWhatsappWithSmsFallback(newVisit.id);
            }
            if (role === "phlebo" && newVisit.executive_id && newVisit.executive?.phone) {
              await sendPhleboVisitSms(newVisit.id);
            }
            // if (role === "admin") { await sendAdminVisitSms(newVisit.id); }
            // if (role === "logistics") { await sendLogisticsVisitSms(newVisit.id); }
          } catch (smsErr) {
            console.error(`Failed to send ${role} SMS:`, smsErr);
          }
        }
      }
    }

    return NextResponse.json(newVisit, { status: 200 });
  } catch (err) {
    console.error("PUT /visits/[id] error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
