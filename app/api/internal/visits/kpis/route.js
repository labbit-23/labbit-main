// File: app/api/internal/visits/kpis/route.js
//
// Replaces DashboardMetrics.js's direct anon-key visits count queries (the
// non-pickupMode branch only -- sample_pickups KPIs are untouched, out of
// scope for this tranche). RLS hardening 2026-09-14, tranche 2 (db/
// RLS_HARDENING_PLAN.md) -- same mode:"all" reasoning as tranche 1's
// patients/patient_addresses routes: single tenant today, real per-lab
// scoping is a separate later change.
import { NextResponse } from "next/server";
import { getSessionUser, deny } from "@/lib/uac/authz";
import { scoped, queryOne } from "@/lib/pgScoped";

export async function GET(request) {
  const user = await getSessionUser(request);
  if (!user) return deny("Not authenticated", 401);

  const { searchParams } = new URL(request.url);
  const date = String(searchParams.get("date") || "").trim();
  const hvExecutiveId = String(searchParams.get("hv_executive_id") || "").trim();
  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  try {
    const row = await scoped({ mode: "all", labId: null }, () =>
      queryOne(
        `
        SELECT
          count(*) FILTER (WHERE true) AS total,
          count(*) FILTER (WHERE ${hvExecutiveId ? "executive_id = $2" : "executive_id IS NOT NULL"}) AS assigned,
          count(*) FILTER (WHERE status = 'completed') AS completed,
          count(*) FILTER (WHERE status = 'pending') AS pending,
          count(*) FILTER (WHERE executive_id IS NULL) AS unassigned
        FROM visits
        WHERE visit_date = $1 AND status IS DISTINCT FROM 'disabled'
        `,
        hvExecutiveId ? [date, hvExecutiveId] : [date]
      )
    );

    return NextResponse.json({
      total: Number(row?.total || 0),
      assigned: Number(row?.assigned || 0),
      completed: Number(row?.completed || 0),
      pending: Number(row?.pending || 0),
      unassigned: Number(row?.unassigned || 0),
    });
  } catch (err) {
    console.error("[api/internal/visits/kpis] error", err);
    return NextResponse.json({ error: "Failed to load visit KPIs" }, { status: 500 });
  }
}
