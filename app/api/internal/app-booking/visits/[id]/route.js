import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { appHubAuthorized, DEFAULT_SDRC_LAB_ID } from "@/lib/appHubAuth";
import { assertVisitScheduleAllowed } from "@/lib/visitScheduling";

// PATCH /api/internal/app-booking/visits/{id}
// Body: { patient_id, action: "cancel" | "reschedule", visit_date?, time_slot? }
//
// The patient's own manage-my-booking actions. patient_id is resolved by the
// app API from the verified account link (never the client); the visit must
// belong to that patient AND this lab. Only a visit that has not started can
// be changed: once a collector is on the way (in_progress) or the sample is
// collected (completed) the patient has to call the lab.
//
// Reschedule keeps the assigned collector only if there is none: an assigned
// visit goes back to "unassigned" with executive_id cleared, because the new
// date/slot was never agreed with that collector -- staff reassign from their
// normal queue. Cancel just sets status "cancelled" (the vocabulary the staff
// queue already uses, see CONFLICT_EXCLUDED_STATUSES in app/api/visits).
const CHANGEABLE = ["unassigned", "booked", "assigned", "accepted", "pending"];

export async function PATCH(request, { params }) {
  if (!appHubAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const patientId = String(body?.patient_id || "").trim();
  const action = String(body?.action || "").trim();
  if (!patientId || !["cancel", "reschedule"].includes(action)) {
    return NextResponse.json({ error: "patient_id and a valid action are required" }, { status: 400 });
  }
  try {
    const { data: visit, error } = await supabase
      .from("visits")
      .select("id, status")
      .eq("id", id)
      .eq("patient_id", patientId)
      .eq("lab_id", DEFAULT_SDRC_LAB_ID)
      .maybeSingle();
    if (error) throw error;
    if (!visit) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    const status = String(visit.status || "").toLowerCase();
    if (!CHANGEABLE.includes(status)) {
      return NextResponse.json(
        { error: "This visit can no longer be changed here. Please call the lab.", code: "VISIT_NOT_CHANGEABLE" },
        { status: 409 }
      );
    }

    if (action === "cancel") {
      const { error: upErr } = await supabase.from("visits").update({ status: "cancelled" }).eq("id", id);
      if (upErr) throw upErr;
      return NextResponse.json({ id, status: "cancelled" });
    }

    const visitDate = String(body?.visit_date || "").trim();
    const timeSlot = String(body?.time_slot || "").trim();
    if (!visitDate || !timeSlot) {
      return NextResponse.json({ error: "visit_date and time_slot are required" }, { status: 400 });
    }
    const { data: slot, error: slotErr } = await supabase
      .from("visit_time_slots").select("id").eq("id", timeSlot).maybeSingle();
    if (slotErr) throw slotErr;
    if (!slot) return NextResponse.json({ error: "Unknown time slot" }, { status: 400 });
    const scheduleError = await assertVisitScheduleAllowed({ visitDate, timeSlotId: timeSlot });
    if (scheduleError) {
      return NextResponse.json({ error: scheduleError, code: "VISIT_SCHEDULE_PAST" }, { status: 400 });
    }
    const { error: upErr } = await supabase
      .from("visits")
      .update({ visit_date: visitDate, time_slot: timeSlot, status: "unassigned", executive_id: null })
      .eq("id", id);
    if (upErr) throw upErr;
    return NextResponse.json({ id, status: "unassigned", visitDate });
  } catch (err) {
    console.error("[app-booking/visits/:id] update error", err);
    return NextResponse.json({ error: "Failed to update the booking" }, { status: 500 });
  }
}
