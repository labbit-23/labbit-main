// File: app/api/internal/visit-activity-log/route.js
//
// Replaces YourDayView.js's VisitDetailSheet anon-key read of
// visit_activity_log (status-change timeline). RLS hardening 2026-09-14,
// tranche 2 (db/RLS_HARDENING_PLAN.md). activity_type filter is hardcoded
// to the two values the one real caller uses, rather than a generic param
// -- no other caller needs anything broader.
import { NextResponse } from "next/server";
import { getSessionUser, deny } from "@/lib/uac/authz";
import { scoped, query } from "@/lib/pgScoped";

export async function GET(request) {
  const user = await getSessionUser(request);
  if (!user) return deny("Not authenticated", 401);

  const { searchParams } = new URL(request.url);
  const visitId = String(searchParams.get("visit_id") || "").trim();
  if (!visitId) {
    return NextResponse.json({ error: "visit_id is required" }, { status: 400 });
  }

  try {
    const rows = await scoped({ mode: "all", labId: null }, () =>
      query(
        `SELECT created_at, old_value, new_value FROM visit_activity_log
         WHERE visit_id = $1 AND activity_type IN ('visit_update', 'visit_created')
         ORDER BY created_at ASC`,
        [visitId]
      )
    );
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("[api/internal/visit-activity-log] error", err);
    return NextResponse.json({ error: "Failed to load visit activity" }, { status: 500 });
  }
}
