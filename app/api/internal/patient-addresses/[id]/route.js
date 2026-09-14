// File: app/api/internal/patient-addresses/[id]/route.js
//
// Replaces YourDayView.js's direct anon-key `supabase.from("patient_addresses")
// .update({lat,lng})` (arrival-location confirmation). Same RLS hardening
// pass as app/api/internal/patients/search/route.js -- see that file's
// header and db/RLS_HARDENING_PLAN.md for why mode "all" is used here too.
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
      query(
        `UPDATE patient_addresses SET lat = $1, lng = $2 WHERE id = $3 RETURNING id`,
        [lat, lng, id]
      )
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/internal/patient-addresses] error", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
