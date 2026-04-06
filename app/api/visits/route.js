// File: /app/api/visits/route.js

import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseServer";
import {
  sendPatientVisitSms,
  sendPhleboVisitSms,
} from "@/lib/visitSms";
import { sendPatientVisitWhatsapp } from "@/lib/visitWhatsapp";

const CONFLICT_EXCLUDED_STATUSES = ["disabled", "cancelled", "canceled", "completed"];
const VISIT_SELECT_WITH_GEO = `
  id,
  lab_id,
  patient_id,
  executive_id,
  executive:executive_id (
    id,
    name,
    phone
  ),
  visit_date,
  address,
  lat,
  lng,
  time_slot:time_slot (
    slot_name
  ),
  status,
  notes,
  prescription
`;
const VISIT_SELECT_NO_GEO = `
  id,
  lab_id,
  patient_id,
  executive_id,
  executive:executive_id (
    id,
    name,
    phone
  ),
  visit_date,
  address,
  time_slot:time_slot (
    slot_name
  ),
  status,
  notes,
  prescription
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

function formatConflict(visit) {
  return {
    id: visit.id,
    status: visit.status || null,
    patient_name: visit.patient?.name || "Unknown",
    patient_phone: visit.patient?.phone || null,
    address: visit.address || null,
  };
}

function normalizeNumber(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

async function getNotifyRolesForStatus(statusCode) {
  if (!statusCode) return [];

  const { data, error } = await supabase
    .from("visit_statuses")
    .select("notify_to")
    .eq("code", statusCode)
    .maybeSingle();

  if (error) {
    console.error(`Failed to load notify_to for status ${statusCode}:`, error.message || error);
    return [];
  }

  return Array.isArray(data?.notify_to) ? data.notify_to : [];
}

async function notifyPatientWhatsappWithSmsFallback(visitId) {
  try {
    await sendPatientVisitWhatsapp(visitId);
  } catch (waError) {
    console.error(`Visit ${visitId}: Patient WhatsApp failed, falling back to SMS:`, waError?.message || waError);
    await sendPatientVisitSms(visitId);
  }
}

async function notifyRolesForVisit({ visitId, statusCode, notifyRoles, sendPatient = true, sendPhlebo = true }) {
  const roles = Array.isArray(notifyRoles) ? notifyRoles : [];

  if (sendPatient && roles.includes("patient")) {
    try {
      await notifyPatientWhatsappWithSmsFallback(visitId);
    } catch (patientError) {
      console.error(`Visit ${visitId}: Patient notification failed:`, patientError?.message || patientError);
    }
  }

  if (sendPhlebo && roles.includes("phlebo")) {
    try {
      await sendPhleboVisitSms(visitId);
    } catch (phleboError) {
      console.error(`Visit ${visitId}: Phlebo SMS failed:`, phleboError?.message || phleboError);
    }
  }
}

async function resolveOrCreatePatientAddress(visitData, locationText = "") {
  const patientId = visitData?.patient_id;
  if (!patientId) return visitData;

  const incomingAddressId = visitData?.address_id || null;
  const lat = normalizeNumber(visitData?.lat);
  const lng = normalizeNumber(visitData?.lng);
  const areaText = String(visitData?.address || locationText || "").trim();
  const lineText = String(locationText || areaText || "").trim();

  if (incomingAddressId) {
    const { data: existingById } = await supabase
      .from("patient_addresses")
      .select("id, area, address_line, lat, lng")
      .eq("id", incomingAddressId)
      .eq("patient_id", patientId)
      .maybeSingle();

    if (existingById) {
      return {
        ...visitData,
        address_id: existingById.id,
        address: areaText || existingById.area || existingById.address_line || visitData.address || "",
        lat: lat ?? existingById.lat ?? visitData.lat ?? null,
        lng: lng ?? existingById.lng ?? visitData.lng ?? null
      };
    }
  }

  if (!areaText && !(lat && lng)) return visitData;

  const { data: patientAddressRows } = await supabase
    .from("patient_addresses")
    .select("id, address_index, area, address_line, lat, lng, is_default")
    .eq("patient_id", patientId)
    .limit(500);

  const rows = patientAddressRows || [];

  const coordMatch =
    lat && lng
      ? rows.find((row) => Number(row.lat) === lat && Number(row.lng) === lng)
      : null;

  const textMatch =
    !coordMatch && areaText
      ? rows.find((row) => {
          const area = String(row?.area || "").trim().toLowerCase();
          const line = String(row?.address_line || "").trim().toLowerCase();
          const lookup = areaText.toLowerCase();
          return area === lookup || line === lookup;
        })
      : null;

  const matched = coordMatch || textMatch;
  if (matched) {
    return {
      ...visitData,
      address_id: matched.id,
      address: areaText || matched.area || matched.address_line || visitData.address || "",
      lat: lat ?? matched.lat ?? visitData.lat ?? null,
      lng: lng ?? matched.lng ?? visitData.lng ?? null
    };
  }

  const hasDefault = rows.some((row) => Boolean(row?.is_default));
  const maxIndex = rows.reduce((max, row) => {
    const idx = Number(row?.address_index || 0);
    return Number.isFinite(idx) ? Math.max(max, idx) : max;
  }, 0);

  let addressIndex = maxIndex + 1;
  let inserted = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: insertedRow, error: insertError } = await supabase
      .from("patient_addresses")
      .insert({
        patient_id: patientId,
        label: "Saved from Visit",
        area: areaText || null,
        address_line: lineText || null,
        lat,
        lng,
        is_default: !hasDefault && attempt === 0,
        address_index: addressIndex
      })
      .select("id, area, address_line, lat, lng")
      .single();

    if (!insertError && insertedRow) {
      inserted = insertedRow;
      break;
    }

    if (!insertError) break;

    const message = String(insertError.message || "").toLowerCase();
    if (message.includes("unique_patient_location") && lat && lng) {
      const { data: byCoord } = await supabase
        .from("patient_addresses")
        .select("id, area, address_line, lat, lng")
        .eq("patient_id", patientId)
        .eq("lat", lat)
        .eq("lng", lng)
        .maybeSingle();
      if (byCoord) {
        inserted = byCoord;
        break;
      }
    }

    if (message.includes("unique_patient_address_index")) {
      const { data: latestRows } = await supabase
        .from("patient_addresses")
        .select("address_index")
        .eq("patient_id", patientId)
        .order("address_index", { ascending: false })
        .limit(1);
      addressIndex = Number(latestRows?.[0]?.address_index || addressIndex) + 1;
      continue;
    }

    break;
  }

  if (!inserted) return visitData;

  return {
    ...visitData,
    address_id: inserted.id,
    address: areaText || inserted.area || inserted.address_line || visitData.address || "",
    lat: lat ?? inserted.lat ?? visitData.lat ?? null,
    lng: lng ?? inserted.lng ?? visitData.lng ?? null
  };
}

async function findTimeslotConflicts({
  executiveId,
  visitDate,
  timeSlotId,
  excludeVisitId = null,
}) {
  if (!executiveId || !visitDate || !timeSlotId) return [];

  let query = supabase
    .from("visits")
    .select(`
      id,
      status,
      address,
      patient:patient_id(name, phone)
    `)
    .eq("executive_id", executiveId)
    .eq("visit_date", visitDate)
    .eq("time_slot", timeSlotId)
    .not("status", "in", `(${CONFLICT_EXCLUDED_STATUSES.join(",")})`);

  if (excludeVisitId) query = query.neq("id", excludeVisitId);

  const { data, error } = await query;
  if (error) throw new Error(error.message || "Failed to check timeslot conflicts");
  return data || [];
}

// GET /api/visits?patient_id=...&visit_date=...
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const patientId = url.searchParams.get("patient_id");
    const visitDate = url.searchParams.get("visit_date");

    if (!patientId && !visitDate) {
      return NextResponse.json([], { status: 200 });
    }

    let query = supabase
      .from("visits")
      .select(`
        id,
        visit_code,
        patient:patient_id(id, name, phone),
        executive_id,
        executive:executive_id(id, name, phone),
        lab_id,
        visit_date,
        time_slot,
        address,
        lat,
        lng,
        status,
        notes,
        prescription,
        address_id,
        time_slot:time_slot(id, slot_name, start_time, end_time)
      `);

    if (patientId) query = query.eq("patient_id", patientId);
    if (visitDate) query = query.eq("visit_date", visitDate);

    let { data, error } = await query.order("visit_date", { ascending: false });

    if (error && isMissingVisitsGeoColumnError(error)) {
      let fallbackQuery = supabase
        .from("visits")
        .select(`
          id,
          visit_code,
          patient:patient_id(id, name, phone),
          executive_id,
          executive:executive_id(id, name, phone),
          lab_id,
          visit_date,
          time_slot,
          address,
          status,
          notes,
          prescription,
          address_id,
          time_slot:time_slot(id, slot_name, start_time, end_time)
        `);

      if (patientId) fallbackQuery = fallbackQuery.eq("patient_id", patientId);
      if (visitDate) fallbackQuery = fallbackQuery.eq("visit_date", visitDate);
      const fallbackResp = await fallbackQuery.order("visit_date", { ascending: false });
      data = fallbackResp.data || [];
      error = fallbackResp.error || null;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || [], { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/visits
 * Create a new visit (send patient SMS and phlebo SMS if assigned),
 * log creation in visit_activity_log,
 * update patient's area with new visit area
 */
export async function POST(request) {
  try {
    const visitData = await request.json();
    const forceAssign = Boolean(visitData.force_assign);
    const locationText = visitData.location_text || "";
    const hasExplicitStatus = Object.prototype.hasOwnProperty.call(visitData, "status");

    delete visitData.id;
    delete visitData.visit_code;
    delete visitData.force_assign;
    delete visitData.location_text;

    if (shouldPromoteToBooked({
      explicitStatus: hasExplicitStatus,
      statusValue: visitData.status,
      previousStatus: null,
      previousExecutiveId: null,
      effectiveExecutiveId: visitData.executive_id,
    })) {
      visitData.status = "booked";
    }

    const normalizedVisitData = await resolveOrCreatePatientAddress(visitData, locationText);

    const conflicts = await findTimeslotConflicts({
      executiveId: normalizedVisitData.executive_id,
      visitDate: normalizedVisitData.visit_date,
      timeSlotId: normalizedVisitData.time_slot,
    });
    if (conflicts.length > 0 && !forceAssign) {
      return NextResponse.json(
        {
          error: "Timeslot conflict for selected executive.",
          code: "VISIT_SLOT_CONFLICT",
          can_override: true,
          conflicts: conflicts.map(formatConflict),
        },
        { status: 409 }
      );
    }

    let { data, error } = await supabase
      .from("visits")
      .insert([normalizedVisitData])
      .select(VISIT_SELECT_WITH_GEO)
      .single();

    if (error && isMissingVisitsGeoColumnError(error)) {
      const strippedVisitData = stripVisitGeoFields(normalizedVisitData);
      const fallbackResp = await supabase
        .from("visits")
        .insert([strippedVisitData])
        .select(VISIT_SELECT_NO_GEO)
        .single();
      data = fallbackResp.data || null;
      error = fallbackResp.error || null;
    }

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Visit creation failed" },
        { status: 500 }
      );
    }

    // Insert activity log for creation
    try {
      await supabase.from("visit_activity_log").insert([{
        visit_id: data.id,
        previous_status: null,
        new_status: data.status || null,
        changed_by: visitData.created_by || null,
        notes: normalizedVisitData.notes || null,
      }]);
    } catch (logError) {
      console.error("Failed to add visit activity log:", logError?.message || logError);
    }


    const notifyRoles = await getNotifyRolesForStatus(data.status);
    await notifyRolesForVisit({
      visitId: data.id,
      statusCode: data.status,
      notifyRoles,
      sendPatient: true,
      sendPhlebo: Boolean(data.executive_id && data.executive?.phone),
    });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("POST /api/visits failed:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/visits
 * Update a visit, send patient SMS on update,
 * send phlebo SMS if new executive assigned or timeslot changed,
 * log activity in visit_activity_log
 */
export async function PUT(request) {
  try {
    const visitData = await request.json();
    const forceAssign = Boolean(visitData.force_assign);
    const locationText = visitData.location_text || "";
    const hasExplicitStatus = Object.prototype.hasOwnProperty.call(visitData, "status");

    if (!visitData.id) {
      return NextResponse.json(
        { error: "Missing visit id for update" },
        { status: 400 }
      );
    }

    // Fetch previous visit details including status
    const { data: prev, error: prevErr } = await supabase
      .from("visits")
      .select("executive_id, time_slot, status")
      .eq("id", visitData.id)
      .single();

    if (prevErr || !prev) {
      return NextResponse.json(
        { error: "Original visit not found for update" },
        { status: 404 }
      );
    }

    const effectiveExecutiveId = visitData.executive_id ?? prev.executive_id;
    if (shouldPromoteToBooked({
      explicitStatus: hasExplicitStatus,
      statusValue: visitData.status,
      previousStatus: prev.status,
      previousExecutiveId: prev.executive_id,
      effectiveExecutiveId,
    })) {
      visitData.status = "booked";
    }

    const conflicts = await findTimeslotConflicts({
      executiveId: effectiveExecutiveId,
      visitDate: visitData.visit_date ?? prev.visit_date,
      timeSlotId: visitData.time_slot ?? prev.time_slot,
      excludeVisitId: visitData.id,
    });
    if (conflicts.length > 0 && !forceAssign) {
      return NextResponse.json(
        {
          error: "Timeslot conflict for selected executive.",
          code: "VISIT_SLOT_CONFLICT",
          can_override: true,
          conflicts: conflicts.map(formatConflict),
        },
        { status: 409 }
      );
    }

    // Update visit
    delete visitData.force_assign;
    delete visitData.location_text;
    const normalizedVisitData = await resolveOrCreatePatientAddress(visitData, locationText);
    let { data, error } = await supabase
      .from("visits")
      .update(normalizedVisitData)
      .eq("id", normalizedVisitData.id)
      .select(VISIT_SELECT_WITH_GEO)
      .single();

    if (error && isMissingVisitsGeoColumnError(error)) {
      const strippedVisitData = stripVisitGeoFields(normalizedVisitData);
      const fallbackResp = await supabase
        .from("visits")
        .update(strippedVisitData)
        .eq("id", normalizedVisitData.id)
        .select(VISIT_SELECT_NO_GEO)
        .single();
      data = fallbackResp.data || null;
      error = fallbackResp.error || null;
    }

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Visit update failed" },
        { status: 500 }
      );
    }

    // Insert activity log
    try {
      await supabase.from("visit_activity_log").insert([{
        visit_id: data.id,
        previous_status: prev.status || null,
        new_status: data.status || null,
        changed_by: normalizedVisitData.updated_by || null,
        notes: normalizedVisitData.notes || null,
      }]);
    } catch (logError) {
      console.error("Failed to add visit activity log:", logError?.message || logError);
    }

    const nextExecutiveId = Object.prototype.hasOwnProperty.call(normalizedVisitData, "executive_id")
      ? normalizedVisitData.executive_id
      : prev.executive_id;
    const nextTimeSlotId = Object.prototype.hasOwnProperty.call(normalizedVisitData, "time_slot")
      ? normalizedVisitData.time_slot
      : prev.time_slot;
    const nextVisitDate = Object.prototype.hasOwnProperty.call(normalizedVisitData, "visit_date")
      ? normalizedVisitData.visit_date
      : prev.visit_date;

    const isExecutiveChanged = prev.executive_id !== nextExecutiveId;
    const isTimeslotChangedForPatient = prev.time_slot !== nextTimeSlotId;
    const isVisitDateChanged = String(prev.visit_date || "") !== String(nextVisitDate || "");

    const statusChanged = prev.status !== data.status;
    const notifyRoles = statusChanged ? await getNotifyRolesForStatus(data.status) : [];

    const isNewAssignment =
      !prev.executive_id &&
      data.executive_id &&
      data.executive?.phone;

    const isTimeslotChanged =
      prev.executive_id &&
      data.executive_id &&
      prev.executive_id === data.executive_id &&
      prev.time_slot !== normalizedVisitData.time_slot &&
      data.executive?.phone;

    if (statusChanged) {
      await notifyRolesForVisit({
        visitId: data.id,
        statusCode: data.status,
        notifyRoles,
        sendPatient: true,
        sendPhlebo: Boolean(data.executive_id && data.executive?.phone),
      });
    }

    if (!statusChanged && (isNewAssignment || isTimeslotChanged)) {
      try {
        await sendPhleboVisitSms(data.id);
      } catch (e) {
        console.error(`Visit ${data.id}: Phlebo SMS failed:`, e?.message || e);
      }
    }

    if (!statusChanged && (isExecutiveChanged || isTimeslotChangedForPatient || isVisitDateChanged)) {
      try {
        await notifyPatientWhatsappWithSmsFallback(data.id);
      } catch (e) {
        console.error(`Visit ${data.id}: Patient update notification failed:`, e?.message || e);
      }
    }

    return NextResponse.json(data, { status: 200 });

  } catch (err) {
    console.error("PUT /api/visits failed:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
