import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { appHubAuthorized } from "@/lib/appHubAuth";

// GET/POST /api/internal/app-patients/{id}/addresses -- {id} is labit-main's
// own patients.id (from app-patients/sync), never trusted from elsewhere.
// Same table/shape app/api/patients/addresses/route.js (staff CRUD) and
// app/components/AddressPicker_.js (staff form) already use: label,
// address_line, pincode, area, lat, lng, is_default.

function mapRow(r) {
  return {
    id: r.id, label: r.label, addressLine: r.address_line, pincode: r.pincode,
    area: r.area, lat: r.lat, lng: r.lng, isDefault: !!r.is_default,
  };
}

export async function GET(_request, { params }) {
  if (!appHubAuthorized(_request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const patientId = String(params?.id || "").trim();
  const { data, error } = await supabase
    .from("patient_addresses")
    .select("id, label, address_line, pincode, area, lat, lng, is_default, address_index")
    .eq("patient_id", patientId)
    .order("address_index", { ascending: true });
  if (error) return NextResponse.json({ error: "Failed to load addresses" }, { status: 500 });
  return NextResponse.json({ addresses: (data || []).map(mapRow) });
}

export async function POST(request, { params }) {
  if (!appHubAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const patientId = String(params?.id || "").trim();
  const body = await request.json().catch(() => ({}));
  const label = String(body?.label || "").trim();
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!patientId || !label || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "patient id, label, lat and lng are required" }, { status: 400 });
  }
  const addressLine = body?.addressLine ? String(body.addressLine).trim() : null;
  const pincode = body?.pincode ? String(body.pincode).trim() : null;
  const area = body?.area ? String(body.area).trim() : null;

  try {
    const { count } = await supabase
      .from("patient_addresses")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId);
    const isFirst = !count;

    const { data, error } = await supabase
      .from("patient_addresses")
      .insert([{
        patient_id: patientId, label, address_line: addressLine, pincode, area, lat, lng,
        is_default: isFirst || !!body?.isDefault, address_index: count || 0,
      }])
      .select("id, label, address_line, pincode, area, lat, lng, is_default")
      .single();
    if (error) throw error;

    if (body?.isDefault && !isFirst) {
      await supabase.from("patient_addresses").update({ is_default: false })
        .eq("patient_id", patientId).neq("id", data.id);
    }
    return NextResponse.json(mapRow(data), { status: 201 });
  } catch (err) {
    console.error("[app-patients/addresses] create error", err);
    return NextResponse.json({ error: "Failed to save address" }, { status: 500 });
  }
}
