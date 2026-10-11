// File: app/api/internal/visits/admin-list/route.js
//
// Replaces app/admin/page.js's fetchVisitsData -- two anon-key `visits`
// queries (the selected date's full list with patient/executive/lab/
// time_slot embeds, plus a lightweight future-visits scan for the
// unassigned-visits summary). RLS hardening 2026-09-14, tranche 2 (db/
// RLS_HARDENING_PLAN.md).
//
// Never SELECT executives.password_hash -- explicitly listing columns
// everywhere here rather than SELECT * for exactly that reason.
import { NextResponse } from "next/server";
import { getSessionUser, deny } from "@/lib/uac/authz";
import { scoped, query } from "@/lib/pgScoped";

export async function GET(request) {
  const user = await getSessionUser(request);
  if (!user) return deny("Not authenticated", 401);

  const { searchParams } = new URL(request.url);
  const date = String(searchParams.get("date") || "").trim();
  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  // Future-unassigned scan anchors on TODAY, independent of `date` (the
  // selected day being viewed) -- matches the original client code's own
  // `dayjs().format("YYYY-MM-DD")`, not the selected date.
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  try {
    const [visits, futureVisits] = await scoped({ mode: "all", labId: null }, () =>
      Promise.all([
        query(
          `SELECT id, lab_id, patient_id, visit_code, visit_date, address, status,
                  executive_id, created_at, time_slot, address_id, notes, prescription
           FROM visits WHERE visit_date = $1 ORDER BY created_at DESC`,
          [date]
        ),
        query(
          `SELECT visit_date, executive_id, status FROM visits WHERE visit_date >= $1`,
          [todayKey]
        ),
      ])
    );

    const patientIds = [...new Set(visits.map((v) => v.patient_id).filter(Boolean))];
    const executiveIds = [...new Set(visits.map((v) => v.executive_id).filter(Boolean))];
    const labIds = [...new Set(visits.map((v) => v.lab_id).filter(Boolean))];
    const timeSlotIds = [...new Set(visits.map((v) => v.time_slot).filter(Boolean))];

    const [patients, addresses, executives, labs, timeSlots] = await scoped({ mode: "all", labId: null }, () =>
      Promise.all([
        patientIds.length ? query(`SELECT id, name, phone FROM patients WHERE id = ANY($1)`, [patientIds]) : [],
        // Needed by lib/visitLocation.js: visit.address first, then the
        // linked / only patient address as a fallback for the map pin.
        patientIds.length
          ? query(
              `SELECT id, patient_id, area, address_line, lat, lng, is_default
               FROM patient_addresses WHERE patient_id = ANY($1)`,
              [patientIds]
            )
          : [],
        executiveIds.length
          ? query(`SELECT id, name, email, lab_id FROM executives WHERE id = ANY($1)`, [executiveIds])
          : [],
        labIds.length ? query(`SELECT id, name FROM labs WHERE id = ANY($1)`, [labIds]) : [],
        timeSlotIds.length
          ? query(`SELECT id, slot_name, start_time, end_time FROM visit_time_slots WHERE id = ANY($1)`, [timeSlotIds])
          : [],
      ])
    );

    const addressesByPatient = new Map();
    for (const a of addresses) {
      const list = addressesByPatient.get(a.patient_id) || [];
      list.push(a);
      addressesByPatient.set(a.patient_id, list);
    }
    const patientById = new Map(
      patients.map((p) => [p.id, { ...p, addresses: addressesByPatient.get(p.id) || [] }])
    );
    const executiveById = new Map(executives.map((e) => [e.id, e]));
    const labById = new Map(labs.map((l) => [l.id, l]));
    const timeSlotById = new Map(timeSlots.map((t) => [t.id, t]));

    const enrichedVisits = visits.map((v) => ({
      ...v,
      patient: v.patient_id ? patientById.get(v.patient_id) || null : null,
      executive: v.executive_id ? executiveById.get(v.executive_id) || null : null,
      lab: v.lab_id ? labById.get(v.lab_id) || null : null,
      time_slot: v.time_slot ? timeSlotById.get(v.time_slot) || null : null,
    }));

    return NextResponse.json({ visits: enrichedVisits, futureVisits });
  } catch (err) {
    console.error("[api/internal/visits/admin-list] error", err);
    return NextResponse.json({ error: "Failed to load data" }, { status: 500 });
  }
}
