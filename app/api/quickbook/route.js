// =============================================
// File: app/api/quickbook/route.js
// =============================================
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { supabase as supabaseServer } from "@/lib/supabaseServer";
import { sendQuickbookPatientSms } from "@/lib/visitSms";
import { createQuickbookClickupTask } from "@/lib/clickup";
import { sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp/sender";
import { toCanonicalIndiaPhone } from "@/lib/phone";

export const runtime = "nodejs";

function getDbClient() {
  return supabaseServer || supabase;
}

function isMissingColumnError(error) {
  const message = String(error?.message || "");
  return (
    /column .* does not exist/i.test(message) ||
    /could not find the '.*' column .* schema cache/i.test(message)
  );
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function parseTemplates(templates) {
  if (!templates) return {};
  if (typeof templates === "string") {
    try {
      return JSON.parse(templates);
    } catch {
      return {};
    }
  }
  return typeof templates === "object" ? templates : {};
}

function resolveInternalNotifyPhone({ templates = {}, lab = null }) {
  const botFlow = templates?.bot_flow || {};
  const candidate =
    botFlow?.report_notify_number ||
    templates?.report_notify_number ||
    lab?.alternate_whatsapp_number ||
    lab?.internal_whatsapp_number ||
    "";
  return toCanonicalIndiaPhone(candidate) || String(candidate || "").replace(/\D/g, "") || null;
}

function buildBookingRequestNotifyText({ labName, bookingId, patientName, phone, packageName, date, slotLabel, area }) {
  return [
    "NEW BOOKING REQUEST",
    labName ? `Lab: ${labName}` : null,
    bookingId ? `Booking ID: ${bookingId}` : null,
    patientName ? `Patient: ${patientName}` : null,
    phone ? `Phone: ${phone}` : null,
    packageName ? `Package/Test: ${packageName}` : null,
    date ? `Date: ${date}` : null,
    slotLabel ? `Time Slot: ${slotLabel}` : null,
    area ? `Area/Location: ${area}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

function resolveWebsiteBookingTemplateConfig(templates = {}) {
  const candidates = [
    templates?.templates?.website_booking,
    templates?.website_booking
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      return candidate;
    }
  }
  return null;
}

function buildWebsiteBookingSummary({
  bookingId,
  patientName,
  phone,
  packageName,
  area,
  date,
  slotLabel,
  homeVisitRequired
}) {
  const bookingType = homeVisitRequired === false ? "Lab Visit Request" : "Home Visit Request";
  return [
    `Status: UNDER REVIEW`,
    `Request Type: ${bookingType}`,
    bookingId ? `Booking ID: ${bookingId}` : null,
    patientName ? `Patient: ${patientName}` : null,
    phone ? `Phone: ${phone}` : null,
    packageName ? `Tests/Package: ${packageName}` : null,
    area ? `Area/Location: ${area}` : null,
    date ? `Preferred Date: ${date}` : null,
    slotLabel ? `Preferred Slot: ${slotLabel}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendQuickbookPatientWebsiteBookingTemplate({
  labId,
  phone,
  bookingId,
  patientName,
  packageName,
  area,
  date,
  slotLabel,
  homeVisitRequired
}) {
  if (!labId || !supabaseServer) {
    return { ok: false, reason: "missing_lab_id_or_server_client" };
  }

  const canonicalPhone = toCanonicalIndiaPhone(phone) || String(phone || "").replace(/\D/g, "");
  if (!canonicalPhone) {
    return { ok: false, reason: "invalid_phone" };
  }

  const { data: apiRow, error: apiError } = await supabaseServer
    .from("labs_apis")
    .select("templates")
    .eq("lab_id", labId)
    .eq("api_name", "whatsapp_outbound")
    .maybeSingle();

  if (apiError || !apiRow) {
    return { ok: false, reason: "whatsapp_outbound_config_missing" };
  }

  const templates = parseTemplates(apiRow?.templates);
  const templateConfig = resolveWebsiteBookingTemplateConfig(templates);
  if (!templateConfig) {
    return { ok: false, reason: "website_booking_template_missing" };
  }

  const templateName = String(
    templateConfig?.template_name ||
      templateConfig?.campaign ||
      "website_booking"
  ).trim();

  const languageCode = String(
    templateConfig?.language_code ||
      templateConfig?.language ||
      "en"
  ).trim();

  const summary = buildWebsiteBookingSummary({
    bookingId,
    patientName,
    phone: canonicalPhone,
    packageName,
    area,
    date,
    slotLabel,
    homeVisitRequired
  });

  const valueMap = {
    booking_summary: summary
  };

  const rawOrder = Array.isArray(templateConfig?.params_order)
    ? templateConfig.params_order
    : ["booking_summary"];
  const paramsOrder = rawOrder.map((item) => String(item || "").trim()).filter(Boolean);
  const templateParams = (paramsOrder.length ? paramsOrder : ["booking_summary"]).map((key) =>
    String(valueMap[key] ?? "")
  );

  await sendTemplateMessage({
    labId,
    phone: canonicalPhone,
    templateName,
    languageCode,
    templateParams
  });

  return { ok: true };
}

async function sendInternalBookingRequestNotify({
  labId,
  bookingId,
  patientName,
  phone,
  packageName,
  date,
  slotLabel,
  area
}) {
  if (!labId || !supabaseServer) return;
  try {
    const [{ data: apiRow }, { data: labRow }] = await Promise.all([
      supabaseServer
        .from("labs_apis")
        .select("templates")
        .eq("lab_id", labId)
        .eq("api_name", "whatsapp_outbound")
        .maybeSingle(),
      supabaseServer
        .from("labs")
        .select("name,alternate_whatsapp_number,internal_whatsapp_number")
        .eq("id", labId)
        .maybeSingle()
    ]);

    const templates = parseTemplates(apiRow?.templates);
    const notifyPhone = resolveInternalNotifyPhone({ templates, lab: labRow || null });
    if (!notifyPhone) return;

    await sendTextMessage({
      labId,
      phone: notifyPhone,
      text: buildBookingRequestNotifyText({
        labName: String(labRow?.name || "").trim() || null,
        bookingId,
        patientName,
        phone,
        packageName,
        date,
        slotLabel,
        area
      })
    });
  } catch (error) {
    console.error("[QuickBook Internal Notify Error]", error?.message || error);
  }
}

async function resolveTimeslotDetails(timeslotInput) {
  const raw = String(timeslotInput || "").trim();
  if (!raw) return { id: raw, label: raw };
  const db = getDbClient();
  if (!db) return { id: raw, label: raw };
  const normalize = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

  if (isUuid(raw)) {
    const { data, error } = await db
      .from("visit_time_slots")
      .select("id, slot_name")
      .eq("id", raw)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[Quickbook Slot Resolve Error]", error);
      return { id: raw, label: raw };
    }

    return { id: raw, label: data?.slot_name || raw };
  }

  const { data, error } = await db
    .from("visit_time_slots")
    .select("id, slot_name, start_time, end_time")
    .order("start_time", { ascending: true });

  if (error) {
    console.error("[Quickbook Slot Resolve Error]", error);
    return { id: raw, label: raw };
  }

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const normalizedCandidates = Array.from(
    new Set([raw, ...lines, raw.replace(/\s+/g, " ")].map((item) => normalize(item)).filter(Boolean))
  );

  const matchedSlot = (data || []).find((slot) => {
    const labels = [
      slot?.slot_name || "",
      slot?.start_time && slot?.end_time ? `${slot.start_time} - ${slot.end_time}` : "",
      slot?.start_time && slot?.end_time ? `${slot.start_time}-${slot.end_time}` : ""
    ]
      .map((item) => normalize(item))
      .filter(Boolean);

    return labels.some((label) => normalizedCandidates.includes(label));
  });

  if (matchedSlot?.id) {
    return {
      id: matchedSlot.id,
      label: matchedSlot.slot_name || lines[0] || raw
    };
  }

  return {
    id: raw,
    label: lines[0] || raw
  };
}

export async function POST(req) {
  try {
    const db = getDbClient();
    if (!db) {
      return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
    }

    const body = await req.json();

    const {
      patientName,
      phone,
      packageName,
      area,
      date,
      timeslot,
      persons,
      whatsapp,
      agree,
      home_visit_required,
      prescription,
      location_source,
      location_text,
      location_name,
      location_address,
      location_lat,
      location_lng
    } = body;

    const normalizedHomeVisitRequired =
      typeof home_visit_required === "boolean" ? home_visit_required : true;

    if (!patientName || !phone || !date || !timeslot || !agree) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const resolvedTimeslot = await resolveTimeslotDetails(timeslot);
    const resolvedLabId = String(body?.lab_id || body?.labId || process.env.DEFAULT_LAB_ID || "").trim();

    // 1️⃣ Insert booking into quickbookings table
    const baseInsert = {
      patient_name: patientName,
      phone,
      package_name: packageName,
      area,
      date,
      timeslot: resolvedTimeslot.id,
      persons,
      whatsapp,
      agree,
      home_visit_required: normalizedHomeVisitRequired,
      prescription: prescription || null,
      ...(isUuid(resolvedLabId) ? { lab_id: resolvedLabId } : {})
    };

    const locationInsert = {
      location_source: location_source || null,
      location_text: location_text || null,
      location_name: location_name || null,
      location_address: location_address || null,
      location_lat: location_lat || null,
      location_lng: location_lng || null
    };

    let insertResult = await db
      .from("quickbookings")
      .insert([{ ...baseInsert, ...locationInsert }])
      .select();

    if (
      insertResult.error &&
      /'lab_id' column/i.test(String(insertResult.error?.message || ""))
    ) {
      delete baseInsert.lab_id;
      insertResult = await db
        .from("quickbookings")
        .insert([{ ...baseInsert, ...locationInsert }])
        .select();
    }

    // Backward compatibility: table may not yet have some optional columns.
    if (
      insertResult.error &&
      isMissingColumnError(insertResult.error)
    ) {
      insertResult = await db
        .from("quickbookings")
        .insert([
          {
            patient_name: baseInsert.patient_name,
            phone: baseInsert.phone,
            package_name: baseInsert.package_name,
            area: baseInsert.area,
            date: baseInsert.date,
            timeslot: baseInsert.timeslot,
            persons: baseInsert.persons,
            whatsapp: baseInsert.whatsapp,
            agree: baseInsert.agree,
            prescription: baseInsert.prescription,
            ...(baseInsert.lab_id ? { lab_id: baseInsert.lab_id } : {})
          }
        ])
        .select();
    }

    if (
      insertResult.error &&
      isMissingColumnError(insertResult.error)
    ) {
      insertResult = await db
        .from("quickbookings")
        .insert([
          {
            patient_name: baseInsert.patient_name,
            phone: baseInsert.phone,
            package_name: baseInsert.package_name,
            area: baseInsert.area,
            date: baseInsert.date,
            timeslot: baseInsert.timeslot,
            persons: baseInsert.persons,
            whatsapp: baseInsert.whatsapp,
            agree: baseInsert.agree,
            ...(baseInsert.lab_id ? { lab_id: baseInsert.lab_id } : {})
          }
        ])
        .select();
    }

    const { data, error } = insertResult;

    if (error) {
      console.error("[Supabase Insert Error]", {
        message: error?.message || null,
        code: error?.code || null,
        details: error?.details || null,
        hint: error?.hint || null,
        payload: {
          patientName,
          phone,
          packageName,
          area,
          date,
          timeslot,
          resolvedTimeslotId: resolvedTimeslot?.id || null
        }
      });
      try {
        const clickupResult = await createQuickbookClickupTask({
          booking: {
            id: null,
            patient_name: patientName,
            phone,
            package_name: packageName,
            area,
            date,
            // Keep original slot label for human readability in task.
            timeslot,
            persons,
            whatsapp
          },
          source: "quickbook_api_insert_failed"
        });
        if (!clickupResult.ok && !clickupResult.skipped) {
          console.error("ClickUp quickbook fallback task failed:", clickupResult.error);
        }
      } catch (clickupErr) {
        console.error("Unexpected ClickUp quickbook fallback task error:", clickupErr);
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const booking = data[0];

    // 2️⃣ Send patient quickbook confirmation on WhatsApp template (fallback: SMS)
    try {
      const waResult = await sendQuickbookPatientWebsiteBookingTemplate({
        labId: booking.lab_id || (isUuid(resolvedLabId) ? resolvedLabId : null),
        phone: booking.phone || phone || null,
        bookingId: booking.id || null,
        patientName: booking.patient_name || patientName || null,
        packageName: booking.package_name || packageName || null,
        area:
          booking.location_text ||
          booking.location_address ||
          booking.area ||
          area ||
          null,
        date: booking.date || date || null,
        slotLabel: resolvedTimeslot.label || null,
        homeVisitRequired: normalizedHomeVisitRequired
      });

      if (!waResult?.ok) {
        console.warn("Quickbook WhatsApp template skipped, falling back to SMS:", waResult?.reason);
        await sendQuickbookPatientSms(booking.id);
        console.log("Quick Book fallback SMS sent to patient:", booking.phone);
      } else {
        console.log("Quick Book WhatsApp template sent to patient:", booking.phone);
      }
    } catch (patientNotifyErr) {
      console.error("Failed to send Quick Book WhatsApp template, attempting SMS fallback:", patientNotifyErr);
      try {
        await sendQuickbookPatientSms(booking.id);
        console.log("Quick Book SMS fallback sent to patient after WhatsApp failure:", booking.phone);
      } catch (smsErr) {
        console.error("Failed to send Quick Book SMS fallback:", smsErr);
      }
    }

    // 3️⃣ Create ClickUp task (best-effort, non-blocking failure)
    try {
      const clickupResult = await createQuickbookClickupTask({
        booking: {
          ...booking,
          timeslot_label: resolvedTimeslot.label
        },
        source: "quickbook_api"
      });
      if (!clickupResult.ok && !clickupResult.skipped) {
        console.error("ClickUp quickbook task failed:", clickupResult.error);
      }
    } catch (clickupErr) {
      console.error("Unexpected ClickUp quickbook task error:", clickupErr);
    }

    // 4️⃣ Internal notify to fallback/report-notify number (best-effort)
    await sendInternalBookingRequestNotify({
      labId: booking.lab_id || (isUuid(resolvedLabId) ? resolvedLabId : null),
      bookingId: booking.id || null,
      patientName: booking.patient_name || patientName || null,
      phone: booking.phone || phone || null,
      packageName: booking.package_name || packageName || null,
      date: booking.date || date || null,
      slotLabel: resolvedTimeslot.label || null,
      area:
        booking.location_text ||
        booking.location_address ||
        booking.area ||
        area ||
        null
    });

    return NextResponse.json({ success: true, booking }, { status: 200 });

  } catch (err) {
    console.error("[QuickBook POST Error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
