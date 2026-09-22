import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { appHubAuthorized } from "@/lib/appHubAuth";

function mapRow(r) {
  return {
    id: r.id, label: r.label, addressLine: r.address_line, pincode: r.pincode,
    area: r.area, lat: r.lat, lng: r.lng, isDefault: !!r.is_default,
  };
}

// PATCH: partial update (any of label/addressLine/pincode/area/lat/lng/isDefault).
// Ownership is checked with .eq("patient_id", ...) on every query -- an
// address id from one patient can never be edited via another's {id} path.
export async function PATCH(request, { params }) {
  if (!appHubAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const patientId = String(params?.id || "").trim();
  const addrId = String(params?.addrId || "").trim();
  const body = await request.json().catch(() => ({}));

  const patch = {};
  if (body?.label !== undefined) patch.label = String(body.label).trim();
  if (body?.addressLine !== undefined) patch.address_line = body.addressLine ? String(body.addressLine).trim() : null;
  if (body?.pincode !== undefined) patch.pincode = body.pincode ? String(body.pincode).trim() : null;
  if (body?.area !== undefined) patch.area = body.area ? String(body.area).trim() : null;
  if (body?.lat !== undefined) {
    const lat = Number(body.lat);
    if (!Number.isFinite(lat)) return NextResponse.json({ error: "lat must be a number" }, { status: 400 });
    patch.lat = lat;
  }
  if (body?.lng !== undefined) {
    const lng = Number(body.lng);
    if (!Number.isFinite(lng)) return NextResponse.json({ error: "lng must be a number" }, { status: 400 });
    patch.lng = lng;
  }
  if (Object.keys(patch).length === 0 && body?.isDefault === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("patient_addresses").update(patch)
        .eq("id", addrId).eq("patient_id", patientId);
      if (error) throw error;
    }
    if (body?.isDefault === true) {
      await supabase.from("patient_addresses").update({ is_default: false })
        .eq("patient_id", patientId).neq("id", addrId);
      const { error } = await supabase.from("patient_addresses").update({ is_default: true })
        .eq("id", addrId).eq("patient_id", patientId);
      if (error) throw error;
    }
    const { data, error: readErr } = await supabase
      .from("patient_addresses")
      .select("id, label, address_line, pincode, area, lat, lng, is_default")
      .eq("id", addrId).eq("patient_id", patientId).maybeSingle();
    if (readErr) throw readErr;
    if (!data) return NextResponse.json({ error: "Address not found" }, { status: 404 });
    return NextResponse.json(mapRow(data));
  } catch (err) {
    console.error("[app-patients/addresses] update error", err);
    return NextResponse.json({ error: "Failed to update address" }, { status: 500 });
  }
}

// DELETE: a deleted default address promotes the next remaining one (by
// address_index) to default, so a patient is never left with zero default
// addresses while they still have at least one saved.
export async function DELETE(request, { params }) {
  if (!appHubAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const patientId = String(params?.id || "").trim();
  const addrId = String(params?.addrId || "").trim();

  try {
    const { data: victim, error: findErr } = await supabase
      .from("patient_addresses").select("id, is_default")
      .eq("id", addrId).eq("patient_id", patientId).maybeSingle();
    if (findErr) throw findErr;
    if (!victim) return NextResponse.json({ error: "Address not found" }, { status: 404 });

    const { error: delErr } = await supabase.from("patient_addresses")
      .delete().eq("id", addrId).eq("patient_id", patientId);
    if (delErr) throw delErr;

    if (victim.is_default) {
      const { data: next } = await supabase
        .from("patient_addresses").select("id")
        .eq("patient_id", patientId).order("address_index", { ascending: true }).limit(1).maybeSingle();
      if (next?.id) {
        await supabase.from("patient_addresses").update({ is_default: true }).eq("id", next.id);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[app-patients/addresses] delete error", err);
    return NextResponse.json({ error: "Failed to delete address" }, { status: 500 });
  }
}
