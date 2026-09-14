// File: app/api/internal/visit-details/route.js
//
// Replaces the anon-key `visit_details` read/write calls in
// VisitDetailTab.js, VisitBillingPanel.js, and YourDayView.js -- all three
// follow the same shape (read test_id list for a visit; write by either
// replacing the whole set, or adding/removing a diff). RLS hardening
// 2026-09-14, tranche 2 (db/RLS_HARDENING_PLAN.md).
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
      query(`SELECT id, visit_id, test_id, package_id FROM visit_details WHERE visit_id = $1`, [visitId])
    );
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("[api/internal/visit-details] GET error", err);
    return NextResponse.json({ error: "Failed to load visit details" }, { status: 500 });
  }
}

export async function PUT(request) {
  const user = await getSessionUser(request);
  if (!user) return deny("Not authenticated", 401);

  const body = await request.json().catch(() => ({}));
  const visitId = String(body?.visit_id || "").trim();
  if (!visitId) {
    return NextResponse.json({ error: "visit_id is required" }, { status: 400 });
  }
  const replace = Array.isArray(body?.replace) ? body.replace.filter(Boolean) : null;
  const add = Array.isArray(body?.add) ? body.add.filter(Boolean) : [];
  const remove = Array.isArray(body?.remove) ? body.remove.filter(Boolean) : [];

  try {
    await scoped({ mode: "all", labId: null }, async () => {
      if (replace) {
        await query(`DELETE FROM visit_details WHERE visit_id = $1`, [visitId]);
        for (const testId of replace) {
          await query(
            `INSERT INTO visit_details (visit_id, test_id, package_id) VALUES ($1, $2, null)`,
            [visitId, testId]
          );
        }
      } else {
        if (remove.length) {
          await query(`DELETE FROM visit_details WHERE visit_id = $1 AND test_id = ANY($2)`, [visitId, remove]);
        }
        for (const testId of add) {
          await query(
            `INSERT INTO visit_details (visit_id, test_id, package_id) VALUES ($1, $2, null)`,
            [visitId, testId]
          );
        }
      }
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/internal/visit-details] PUT error", err);
    return NextResponse.json({ error: "Failed to save visit details" }, { status: 500 });
  }
}
