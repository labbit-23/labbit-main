// File: app/api/internal/visit-details/barcode/route.js
//
// PATCH { visit_detail_id, barcode } -- records which pre-printed tube
// barcode was used for one test line item, at collection time.
//
// Deliberately main-only, not a call into labit-core's real POST /samples
// (which already supports attaching a pre-printed barcode -- see
// app/routers/samples.py's TubeOverride.barcode -- not a limitation this
// repo works around). That real endpoint requires a requisition_id an
// app-booked visit doesn't have yet (see db/migrations/
// 20260929_visit_details_barcode.sql). This is the interim record, in
// main, so nothing is lost before that gap closes.
import { NextResponse } from "next/server";
import { getSessionUser, deny } from "@/lib/uac/authz";
import { scoped, query } from "@/lib/pgScoped";

export async function PATCH(request) {
  const user = await getSessionUser(request);
  if (!user) return deny("Not authenticated", 401);

  const body = await request.json().catch(() => ({}));
  const visitDetailId = String(body?.visit_detail_id || "").trim();
  const barcode = String(body?.barcode || "").trim().slice(0, 80) || null;
  if (!visitDetailId) {
    return NextResponse.json({ error: "visit_detail_id is required" }, { status: 400 });
  }

  try {
    const rows = await scoped({ mode: "all", labId: null }, () =>
      query(`UPDATE visit_details SET barcode = $2 WHERE id = $1 RETURNING id, barcode`, [visitDetailId, barcode])
    );
    if (!rows.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, barcode: rows[0].barcode });
  } catch (err) {
    console.error("[api/internal/visit-details/barcode] error", err);
    return NextResponse.json({ error: "Failed to save barcode" }, { status: 500 });
  }
}
