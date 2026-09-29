import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { appHubAuthorized, DEFAULT_SDRC_LAB_ID } from "@/lib/appHubAuth";
import { assertVisitScheduleAllowed } from "@/lib/visitScheduling";
import { submitWebsiteEnquiry } from "@/lib/labitCoreEnquiry";

// POST /api/internal/app-booking/visits
// Body: { patient_id, address_id, visit_date, time_slot, notes? }
//
// Creates a home-visit request from the Labit App, unassigned (status
// "unassigned", no executive_id) -- same shape/default a fresh staff-created
// visit gets in app/components/VisitModal.js. Staff assign a phlebo from
// their normal queue exactly as they would for any other visit; nothing
// about how this row is surfaced to staff is app-specific.
//
// Reuses assertVisitScheduleAllowed (extracted to lib/visitScheduling.js,
// 2026-09-24, from this repo's own POST /api/visits -- verbatim move, no
// behavior change there) for the same "no past dates, no past-cutoff slots
// today" rule staff booking already enforces.
//
// findTimeslotConflicts (the OTHER validation POST /api/visits runs) is
// deliberately NOT reused here: it checks for a double-booked EXECUTIVE, and
// an app booking has none yet (unassigned at creation) -- the check is moot,
// not skipped carelessly.
//
// What tests/packages were requested: labit-main's `visits` table has no
// structured line-item concept (confirmed: no visit_tests/booking_items
// table exists; VisitModal.js's own current staff UI already collapses a
// tests[] array or a package_name into the single free-text `notes` column
// -- see git blame / that component's formData.notes initializer). This
// route follows the SAME existing convention rather than inventing a new
// one: the caller (the hub) is expected to send a human-readable comma-
// joined list of what was selected as `notes`.
//
// Bridge into labit-core (2026-09-28, director decision: commit to the
// multi-lab marketplace architecture, see labit-app/docs/
// MARKETPLACE_SCOPING.md, rather than let this app's booking dead-end in a
// `visits` row only labit-main can see). Additively submits a labit-core
// `website_enquiry` (POST /api/website-enquiries) so staff's EXISTING
// Website Enquiries queue picks this up for real pricing/requisition/
// QR-payment conversion -- no new staff UI. See lib/labitCoreEnquiry.js for
// the credential/best-effort details. No structured test_ids/package_ids
// sent -- website_enquiry.requested_test_or_package is itself free text
// (staff match it by hand at conversion time), so the SAME comma-joined
// name list already built for `notes` above is reused as-is.
//
// Payment: NOT handled here. The visit is created "pay at collection"
// regardless -- Cashfree isn't wired to a real order yet (see labit-app/api/
// app/payments.py, create_intent still 501s with no order to attach to).
// TODO once that's verified end-to-end: collect payment before or after
// this call and record it against the visit/order, per whatever the
// eventual payment-status model turns out to be.
//
// Deliberately skipped this pass (scope, not oversight): the
// notifyRolesForVisit/sendPatientVisitWhatsapp pipeline POST /api/visits
// runs after creating a visit is NOT triggered here -- those helpers are
// unexported locals in app/api/visits/route.js, and the patient booking
// from the app already sees their own confirmation screen, so a duplicate
// WhatsApp "visit booked" ping is a nice-to-have fast-follow, not essential
// for a first pass. Staff still see the new row in their normal queue
// exactly as with any other unassigned visit.
export async function POST(request) {
  if (!appHubAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const patientId = String(body?.patient_id || "").trim();
  const addressId = String(body?.address_id || "").trim();
  const visitDate = String(body?.visit_date || "").trim();
  const timeSlot = String(body?.time_slot || "").trim();
  const notes = body?.notes ? String(body.notes).trim().slice(0, 2000) : null;
  // items (2026-09-29): [{code, kind}] -- structured line items, so the
  // phlebo screen (and anything else) can know exactly what was booked
  // instead of parsing the `notes` display string. See visit_details insert
  // below, after the visit itself exists.
  const items = Array.isArray(body?.items)
    ? body.items.filter((i) => i?.code && (i.kind === "test" || i.kind === "package")).slice(0, 50)
    : [];

  if (!patientId || !addressId || !visitDate || !timeSlot) {
    return NextResponse.json(
      { error: "patient_id, address_id, visit_date and time_slot are required" },
      { status: 400 }
    );
  }

  try {
    // Ownership: the address must genuinely belong to this patient -- never
    // trust a caller-supplied address_id/patient_id pairing on its own.
    const { data: addr, error: addrErr } = await supabase
      .from("patient_addresses")
      .select("id")
      .eq("id", addressId)
      .eq("patient_id", patientId)
      .maybeSingle();
    if (addrErr) throw addrErr;
    if (!addr) {
      return NextResponse.json({ error: "That address does not belong to this patient" }, { status: 404 });
    }

    const { data: slot, error: slotErr } = await supabase
      .from("visit_time_slots")
      .select("id")
      .eq("id", timeSlot)
      .maybeSingle();
    if (slotErr) throw slotErr;
    if (!slot) {
      return NextResponse.json({ error: "Unknown time slot" }, { status: 400 });
    }

    const scheduleError = await assertVisitScheduleAllowed({ visitDate, timeSlotId: timeSlot });
    if (scheduleError) {
      return NextResponse.json({ error: scheduleError, code: "VISIT_SCHEDULE_PAST" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("visits")
      .insert([{
        lab_id: DEFAULT_SDRC_LAB_ID,
        patient_id: patientId,
        address_id: addressId,
        visit_date: visitDate,
        time_slot: timeSlot,
        status: "unassigned",
        notes,
      }])
      .select("id, visit_date, status")
      .single();
    if (error) throw error;

    // Resolve item codes to real visit_details rows -- best-effort, same
    // posture as the website_enquiry bridge below: a resolution miss (a
    // stale code, an unmatched test) must never fail a booking that already
    // succeeded. Test codes are the app's providerTestCode == this table's
    // own lab_tests.internal_code (case-insensitive -- the catalog route
    // upper-cases it when it hands it out, but never assume the caller
    // echoed it back unchanged); package codes are already packages.id
    // verbatim (see app-catalog/packages/route.js's providerPackageCode).
    if (items.length) {
      const testCodes = items.filter((i) => i.kind === "test").map((i) => String(i.code).trim().toUpperCase());
      const packageIds = items.filter((i) => i.kind === "package").map((i) => String(i.code).trim());
      try {
        const [testRows, pkgRows] = await Promise.all([
          testCodes.length
            ? supabase.from("lab_tests").select("id, internal_code").in("internal_code", testCodes)
            : Promise.resolve({ data: [] }),
          packageIds.length
            ? supabase.from("packages").select("id").in("id", packageIds)
            : Promise.resolve({ data: [] }),
        ]);
        const rows = [
          ...(testRows.data || []).map((t) => ({ visit_id: data.id, test_id: t.id, package_id: null })),
          ...(pkgRows.data || []).map((p) => ({ visit_id: data.id, test_id: null, package_id: p.id })),
        ];
        if (rows.length) await supabase.from("visit_details").insert(rows);
      } catch (err) {
        console.error("[app-booking/visits] visit_details write failed (non-fatal)", err);
      }
    }

    // Captures the created enquiry's id onto this visit (website_enquiry_id,
    // 2026-09-29) so the phlebo screen can later follow enquiry ->
    // converted_requisition_id -> real line items once staff convert it --
    // closes the visits<->requisition link, no new staff step. Still
    // fire-and-forget: neither the submit nor this follow-up write may
    // block or fail the booking response already sent below.
    submitWebsiteEnquiry({ patientId, addressId, notes })
      .then((enquiryId) => enquiryId && supabase.from("visits").update({ website_enquiry_id: enquiryId }).eq("id", data.id))
      .catch((err) => console.error("[app-booking/visits] website_enquiry bridge failed (non-fatal)", err));

    return NextResponse.json({ id: data.id, visitDate: data.visit_date, status: data.status }, { status: 201 });
  } catch (err) {
    console.error("[app-booking/visits] create error", err);
    return NextResponse.json({ error: "Failed to create the booking" }, { status: 500 });
  }
}
