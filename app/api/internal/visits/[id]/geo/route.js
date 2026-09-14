// File: app/api/internal/visits/[id]/geo/route.js
//
// Replaces YourDayView.js's confirmLocUpdate anon-key `visits.update({lat,
// lng})` fallback (used only when the patient has no address row to
// update instead). Deliberately NOT routed through /api/visits' PUT --
// that route does activity-log inserts, notification checks, conflict
// detection, etc., none of which are wanted for what's meant to be a
// silent, best-effort GPS ping (the caller already treats failures as
// non-fatal). RLS hardening 2026-09-14, tranche 2 (db/RLS_HARDENING_PLAN.md).
import { NextResponse } from "next/server";
import { getSessionUser, deny } from "@/lib/uac/authz";
import { scoped, query } from "@/lib/pgScoped";

export async function PATCH(request, { params }) {
  const user = await getSessionUser(request);
  if (!user) return deny("Not authenticated", 401);

  const id = String(params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng must be numbers" }, { status: 400 });
  }

  try {
    const rows = await scoped({ mode: "all", labId: null }, () =>
      query(`UPDATE visits SET lat = $1, lng = $2 WHERE id = $3 RETURNING id`, [lat, lng, id])
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/internal/visits/geo] error", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
