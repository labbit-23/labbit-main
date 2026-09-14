// File: app/api/internal/visits/active/route.js
//
// Replaces ActiveVisitsTab.js's direct anon-key `supabase.from("visits")`
// query (patient/patient_addresses/executive/time_slot nested embeds
// included). RLS hardening 2026-09-14, tranche 2 (db/RLS_HARDENING_PLAN.md).
// Stitches the nested shape in JS instead of a single complex SQL join --
// simpler to get right than hand-written JSON aggregation, and this isn't
// a hot enough path (one phlebo's active visits, polled every 60s) to need
// a single round trip.
import { NextResponse } from "next/server";
import { getSessionUser, deny } from "@/lib/uac/authz";
import { scoped, query } from "@/lib/pgScoped";

export async function GET(request) {
  const user = await getSessionUser(request);
  if (!user) return deny("Not authenticated", 401);

  const { searchParams } = new URL(request.url);
  const hvExecutiveId = String(searchParams.get("hv_executive_id") || "").trim();
  const rangeStart = String(searchParams.get("range_start") || "").trim();
  const rangeEnd = String(searchParams.get("range_end") || "").trim();
  // YourDayView.js wants ONLY its own executive's visits on non-today
  // views (no unassigned-pool rows) -- ActiveVisitsTab.js always wants
  // unassigned included. Default true to match the original behavior of
  // the first caller this route was built for.
  const includeUnassigned = String(searchParams.get("include_unassigned") || "true") !== "false";
  if (!hvExecutiveId || !rangeStart || !rangeEnd) {
    return NextResponse.json({ error: "hv_executive_id, range_start, range_end are required" }, { status: 400 });
  }

  try {
    const data = await scoped({ mode: "all", labId: null }, async () => {
      const visits = await query(
        `
        SELECT id, patient_id, visit_date, time_slot, address, status, executive_id, notes, prescription
        FROM visits
        WHERE visit_date >= $1 AND visit_date <= $2
          AND (executive_id = $3${includeUnassigned ? " OR executive_id IS NULL" : ""})
        `,
        [rangeStart, rangeEnd, hvExecutiveId]
      );
      if (visits.length === 0) return [];

      const patientIds = [...new Set(visits.map((v) => v.patient_id).filter(Boolean))];
      const executiveIds = [...new Set(visits.map((v) => v.executive_id).filter(Boolean))];
      const timeSlotIds = [...new Set(visits.map((v) => v.time_slot).filter(Boolean))];

      const [patients, addresses, executives, timeSlots] = await Promise.all([
        patientIds.length
          ? query(`SELECT id, name, phone FROM patients WHERE id = ANY($1)`, [patientIds])
          : [],
        patientIds.length
          ? query(
              `SELECT id, patient_id, label, pincode, address_line, lat, lng, is_default, city, state, country, area
               FROM patient_addresses WHERE patient_id = ANY($1)`,
              [patientIds]
            )
          : [],
        executiveIds.length
          ? query(`SELECT id, name FROM executives WHERE id = ANY($1)`, [executiveIds])
          : [],
        timeSlotIds.length
          ? query(`SELECT id, slot_name, start_time, end_time FROM visit_time_slots WHERE id = ANY($1)`, [timeSlotIds])
          : [],
      ]);

      const addressesByPatient = new Map();
      for (const a of addresses) {
        const list = addressesByPatient.get(a.patient_id) || [];
        list.push(a);
        addressesByPatient.set(a.patient_id, list);
      }
      const patientById = new Map(patients.map((p) => [p.id, p]));
      const executiveById = new Map(executives.map((e) => [e.id, e]));
      const timeSlotById = new Map(timeSlots.map((t) => [t.id, t]));

      return visits.map((v) => {
        const patient = patientById.get(v.patient_id);
        return {
          id: v.id,
          patient_id: v.patient_id,
          visit_date: v.visit_date,
          time_slot: v.time_slot ? timeSlotById.get(v.time_slot) || null : null,
          address: v.address,
          status: v.status,
          executive_id: v.executive_id,
          notes: v.notes,
          prescription: v.prescription,
          patient: patient
            ? { id: patient.id, name: patient.name, phone: patient.phone, addresses: addressesByPatient.get(patient.id) || [] }
            : null,
          executive: v.executive_id ? { name: executiveById.get(v.executive_id)?.name || null } : null,
        };
      });
    });

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[api/internal/visits/active] error", err);
    return NextResponse.json({ error: "Failed to load visits" }, { status: 500 });
  }
}
