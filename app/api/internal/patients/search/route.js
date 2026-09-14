// File: app/api/internal/patients/search/route.js
//
// Replaces PatientLookupTab.js's direct anon-key `supabase.from("patients")`
// phone search. RLS hardening 2026-09-14, tranche 1 (db/RLS_HARDENING_PLAN.md)
// -- patients now has RLS enabled with zero anon-key policy, so the browser
// can no longer query it directly; this route does the same query
// server-side instead, gated on the same iron-session login the phlebo app
// already requires to be usable at all.
//
// Scope: mode "all", not "lab" -- deliberate. Only 963 of 7295 patients
// (13%, confirmed 2026-09-14) have a patient_external_keys row, so scoping
// this to the phlebo's own lab today would hide ~87% of real patients from
// search. Real per-lab scoping is a separate, later change once
// patient_external_keys coverage is fixed -- not something to flip the
// night before a live shift. This route exists to close the anon-key hole,
// not to change who's visible.
import { NextResponse } from "next/server";
import { getSessionUser, deny } from "@/lib/uac/authz";
import { scoped, query } from "@/lib/pgScoped";

export async function GET(request) {
  const user = await getSessionUser(request);
  if (!user) return deny("Not authenticated", 401);

  const { searchParams } = new URL(request.url);
  const phone = String(searchParams.get("phone") || "").trim();
  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  try {
    const rows = await scoped({ mode: "all", labId: null }, () =>
      query(
        `SELECT id, name, phone FROM patients WHERE phone ILIKE $1 ORDER BY name LIMIT 10`,
        [`%${phone}%`]
      )
    );
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("[api/internal/patients/search] error", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
