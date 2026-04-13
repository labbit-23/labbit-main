import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

function asText(value) {
  return String(value || "").trim();
}

function normalizePhone10(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-10);
}

function isoDobFromAge(ageValue) {
  const age = Number(ageValue);
  if (!Number.isFinite(age) || age < 0 || age > 120) return "";
  const now = new Date();
  const year = now.getFullYear() - age;
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sanitizeDob(value) {
  const text = asText(value);
  if (!text) return "";
  const dt = new Date(text);
  if (!Number.isFinite(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

export async function PATCH(request) {
  const response = NextResponse.next();
  const session = await getIronSession(request, response, ironOptions);
  const user = session?.user;
  const userType = String(user?.userType || "").trim().toLowerCase();
  const execType = String(user?.executiveType || user?.roleKey || user?.userType || "").trim().toLowerCase();
  const supportPhone = normalizePhone10(session?.support_patient_phone);
  const isDirectorSupportMode =
    (userType === "executive" || userType === "director") &&
    execType === "director" &&
    !!supportPhone;

  if (!user || (userType !== "patient" && !isDirectorSupportMode)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sessionPhone = isDirectorSupportMode ? supportPhone : normalizePhone10(user?.phone);
  if (!sessionPhone) {
    return NextResponse.json({ error: "Session phone missing" }, { status: 400 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const patientId = asText(body?.patient_id);
  if (!patientId) {
    return NextResponse.json({ error: "patient_id is required" }, { status: 400 });
  }

  const { data: patient, error: findError } = await supabase
    .from("patients")
    .select("id, phone")
    .eq("id", patientId)
    .maybeSingle();

  if (findError || !patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  if (normalizePhone10(patient.phone) !== sessionPhone) {
    return NextResponse.json({ error: "Forbidden patient update" }, { status: 403 });
  }

  const name = asText(body?.name);
  const email = asText(body?.email);
  const gender = asText(body?.gender);
  const dobFromInput = sanitizeDob(body?.dob);
  const dobFromAge = isoDobFromAge(body?.age);
  const resolvedDob = dobFromInput || dobFromAge || null;

  const updates = {};
  if (name) updates.name = name;
  if (typeof body?.email !== "undefined") updates.email = email || null;
  if (typeof body?.gender !== "undefined") updates.gender = gender || null;
  if (resolvedDob) updates.dob = resolvedDob;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("patients")
    .update(updates)
    .eq("id", patientId)
    .select("id, name, phone, email, dob, gender, mrn")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message || "Failed to update profile" }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: updated.id,
      name: updated.name || null,
      phone: normalizePhone10(updated.phone),
      email: updated.email || null,
      dob: sanitizeDob(updated.dob) || null,
      gender: updated.gender || null,
      mrn: updated.mrn || null,
    },
    { status: 200 }
  );
}
