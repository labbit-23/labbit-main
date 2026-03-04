// =============================================
// File: app/api/quickbook/route.js
// =============================================
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { sendQuickbookPatientSms } from "@/lib/visitSms";
import { createQuickbookClickupTask } from "@/lib/clickup";

export const runtime = "nodejs";

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

async function resolveTimeslotDetails(timeslotInput) {
  const raw = String(timeslotInput || "").trim();
  if (!raw) return { id: raw, label: raw };

  if (isUuid(raw)) {
    const { data, error } = await supabase
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

  const { data, error } = await supabase
    .from("visit_time_slots")
    .select("id, slot_name")
    .eq("slot_name", raw)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[Quickbook Slot Resolve Error]", error);
    return { id: raw, label: raw };
  }

  return {
    id: data?.id || raw,
    label: data?.slot_name || raw
  };
}

export async function POST(req) {
  try {
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
      prescription,
      location_source,
      location_text,
      location_name,
      location_address,
      location_lat,
      location_lng
    } = body;

    if (!patientName || !phone || !date || !timeslot || !agree) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const resolvedTimeslot = await resolveTimeslotDetails(timeslot);

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
      prescription: prescription || null
    };

    const locationInsert = {
      location_source: location_source || null,
      location_text: location_text || null,
      location_name: location_name || null,
      location_address: location_address || null,
      location_lat: location_lat || null,
      location_lng: location_lng || null
    };

    let insertResult = await supabase
      .from("quickbookings")
      .insert([{ ...baseInsert, ...locationInsert }])
      .select();

    // Backward compatibility: table may not yet have some optional columns.
    if (
      insertResult.error &&
      /column .* does not exist/i.test(insertResult.error.message || "")
    ) {
      insertResult = await supabase
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
            prescription: baseInsert.prescription
          }
        ])
        .select();
    }

    if (
      insertResult.error &&
      /column .* does not exist/i.test(insertResult.error.message || "")
    ) {
      insertResult = await supabase
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
            agree: baseInsert.agree
          }
        ])
        .select();
    }

    const { data, error } = insertResult;

    if (error) {
      console.error("[Supabase Insert Error]", error);
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

    // 2️⃣ Send patient_visit SMS with status = PENDING
    try {
      await sendQuickbookPatientSms(booking.id);
      console.log("Quick Book PENDING SMS sent to patient:", booking.phone);
    } catch (smsErr) {
      console.error("Failed to send Quick Book SMS:", smsErr);
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

    return NextResponse.json({ success: true, booking }, { status: 200 });

  } catch (err) {
    console.error("[QuickBook POST Error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
