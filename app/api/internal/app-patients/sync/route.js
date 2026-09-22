import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { appHubAuthorized, DEFAULT_SDRC_LAB_ID } from "@/lib/appHubAuth";

// POST /api/internal/app-patients/sync
// Body: { mrn, phone, name?, dob?, sex? } -- mrn is labit_core's MRN for the
// account's verified SDRC link; phone is the account's own verified number.
//
// Find-or-create this app patient's row in labit-main's `patients` table
// (per-lab booking/scheduling master, separate from labit_core.patient and
// from public.app_patient -- see MARKETPLACE_SCOPING.md gap C) and link it
// via patient_external_keys(lab_id, external_key=mrn), the SAME mechanism
// save-external-key/route.js and lib/savePatientExternalKey.js already use
// for staff-side "link Shivam MRNO" -- this is that same link, written by
// the app's own first booking instead of a staff action.
//
// Deliberately NOT a bulk sync: called once per patient, the first time they
// need a `patients.id` (address management, booking) -- see labit-app's
// director conversation, 2026-09-21: copying all ~48k core patients here
// would create a large, stale, mostly-never-opened-the-app duplicate.
//
// Lookup order: (1) existing patient_external_keys row for this lab_id+mrn
// (repeat calls are idempotent), (2) an existing patients row by phone (a
// patient who already has a booking history here, matched to their MRN for
// the first time), (3) create a new patients row. Never invents an mrn or
// phone -- both must be given.
export async function POST(request) {
  if (!appHubAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const mrn = String(body?.mrn || "").trim();
  const phone = String(body?.phone || "").trim();
  const name = body?.name ? String(body.name).trim() : null;
  const dob = body?.dob || null;
  const sex = body?.sex || null;
  if (!mrn || !phone) {
    return NextResponse.json({ error: "mrn and phone are required" }, { status: 400 });
  }

  try {
    const { data: existingKey, error: keyErr } = await supabase
      .from("patient_external_keys")
      .select("patient_id")
      .eq("lab_id", DEFAULT_SDRC_LAB_ID)
      .eq("external_key", mrn)
      .maybeSingle();
    if (keyErr) throw keyErr;
    if (existingKey?.patient_id) {
      return NextResponse.json({ patient_id: existingKey.patient_id }, { status: 200 });
    }

    const { data: byPhone, error: phoneErr } = await supabase
      .from("patients")
      .select("id")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (phoneErr) throw phoneErr;

    let patientId = byPhone?.id || null;
    if (!patientId) {
      const { data: created, error: createErr } = await supabase
        .from("patients")
        .insert([{ name, phone, dob, gender: sex }])
        .select("id")
        .single();
      if (createErr) throw createErr;
      patientId = created.id;
    }

    const { error: upsertErr } = await supabase
      .from("patient_external_keys")
      .upsert(
        { patient_id: patientId, lab_id: DEFAULT_SDRC_LAB_ID, external_key: mrn },
        { onConflict: "patient_id,lab_id" }
      );
    if (upsertErr) throw upsertErr;

    return NextResponse.json({ patient_id: patientId }, { status: 200 });
  } catch (err) {
    console.error("[app-patients/sync] error", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
