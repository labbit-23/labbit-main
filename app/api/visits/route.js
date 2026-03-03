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

    delete visitData.id;
    delete visitData.visit_code;
    delete visitData.force_assign;
    delete visitData.location_text;

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


    // Send SMS & Whatsapp  to patient
    try {
      await sendPatientVisitSms(data.id);
    } catch (e) {
      console.error("Failed to send patient SMS:", e?.message || e);
    }

    try {
      await sendPatientVisitWhatsapp(data.id);
    } catch (e) {
      console.error("Failed to send patient WhatsApp:", e?.message || e);
    }

    // Send SMS & Whatsapp to phlebo if assigned
    if (data.executive_id && data.executive?.phone) {
      try {
        await sendPhleboVisitSms(data.id);
      } catch (e) {
        console.error("Failed to send phlebo SMS:", e?.message || e);
      }
    }

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

    const conflicts = await findTimeslotConflicts({
      executiveId: visitData.executive_id ?? prev.executive_id,
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

    // -----------------------------
    // Controlled Patient Notifications
    // -----------------------------
    try {
      const allowedStatusNotifications = [
        "booked",
        "assigned",
        "cancelled",
        "completed",
        "disabled"
      ];

      const statusChanged = prev.status !== data.status;

      if (statusChanged && allowedStatusNotifications.includes(data.status)) {
        console.log(
          `Visit ${data.id}: Status changed from ${prev.status} → ${data.status}. Sending notifications.`
        );

        // Send SMS
        try {
          await sendPatientVisitSms(data.id);
        } catch (smsError) {
          console.error(
            `Visit ${data.id}: Patient SMS failed:`,
            smsError?.message || smsError
          );
        }

        // Send WhatsApp
        try {
          await sendPatientVisitWhatsapp(data.id);
        } catch (waError) {
          console.error(
            `Visit ${data.id}: Patient WhatsApp failed:`,
            waError?.message || waError
          );
        }
      } else {
        console.log(
          `Visit ${data.id}: No patient notification triggered. StatusChanged=${statusChanged}`
        );
      }
    } catch (notificationError) {
      console.error(
        `Visit ${data.id}: Unexpected error in notification block:`,
        notificationError
      );
    }

    // -----------------------------
    // Phlebo Notification Logic
    // -----------------------------
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

    if (isNewAssignment || isTimeslotChanged) {
      try {
        await sendPhleboVisitSms(data.id);
      } catch (e) {
        console.error(
          `Visit ${data.id}: Phlebo SMS failed:`,
          e?.message || e
        );
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
