// File: /app/api/patient-lookup/route.js
import { NextResponse } from "next/server";
import { supabase } from '../../../lib/supabaseServer';
import { allowRequest } from '@/lib/inMemoryRateLimit';

// Security review, 2026-09-21: this route had NO auth check at all --
// given just a phone number, anyone got back full patient PII (name,
// DOB, gender, email, MRN, address, lat/lng) from either the local
// `patients` table or labit-core's patient master. Worse than the
// 2026-09-20 patient-labs finding (which only ever returned lab IDs),
// and its impact just went from "core lookup 500s immediately" to
// "actually returns core PII" the same day this was found, once
// PATIENT_LOOKUP_INTERNAL_TOKEN got configured on both sides (it was
// missing entirely -- see git log for that fix). Can't require a
// session -- only caller with a legitimate anonymous need is
// login/page.js's pre-OTP lookup -- so rate-limited the same way
// patient-labs is (lib/inMemoryRateLimit.js, same honest per-process
// caveats documented there).

// Gender map supporting both raw codes and mapped letters for compatibility
const genderMap = {
  "1": "M",
  "0": "F",
  "m": "M",
  "f": "F",
  "male": "M",
  "female": "F",
  "": ""
};

// Maps external gender values to standardized M/F using genderMap
function mapGender(value, genderMap) {
  if (value === null || value === undefined || value === '') return genderMap[''] || '';
  const valStr = String(value).trim().toLowerCase();
  for (const [key, val] of Object.entries(genderMap)) {
    if (key.toLowerCase() === valStr) {
      return val;
    }
  }
  return ''; // fallback if no mapping found
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");

  if (!phone) {
    return NextResponse.json({ error: "Missing phone parameter" }, { status: 400 });
  }

  const cleanPhone = phone.replace(/\D/g, '');

  if (cleanPhone.length < 10 || cleanPhone.length > 13) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  if (!allowRequest(`patient-lookup:${cleanPhone}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many requests for this number. Please wait before trying again." },
      { status: 429 }
    );
  }

  try {
    // Fetch default lab with name for source display
    const { data: defaultLab } = await supabase
      .from('labs')
      .select('id, name')
      .eq('is_default', true)
      .single();

    const labName = defaultLab?.name || 'External';

    // Step 1: Lookup patient locally
    const { data: localPatients, error: localError } = await supabase
      .from('patients')
      .select(`
        id,
        name,
        phone,
        dob,
        gender,
        email,
        mrn,
        patient_addresses(address_line, pincode, lat, lng, is_default)
      `)
      .eq('phone', cleanPhone);

    if (localError) throw localError;

    if (localPatients && localPatients.length > 0) {
      const enrichedPatients = await Promise.all(localPatients.map(async (p) => {
        const defaultAddr = p.patient_addresses?.find(a => a.is_default);

        const { data: keys, error: keyError } = await supabase
          .from('patient_external_keys')
          .select('external_key')
          .eq('patient_id', p.id)
          .eq('lab_id', defaultLab?.id)
          .limit(1);

        const external_key = keyError ? '' : keys?.[0]?.external_key || '';

        const normalizedGender = mapGender(p.gender, genderMap);

        return {
          id: p.id,
          name: p.name || 'Unknown Patient',
          phone: p.phone || cleanPhone,
          dob: p.dob ? p.dob.split('T')[0] : '',
          gender: normalizedGender,
          email: p.email || '',
          mrn: p.mrn || '',
          address_line: defaultAddr?.address_line || '',
          pincode: defaultAddr?.pincode || '',
          lat: defaultAddr?.lat || null,
          lng: defaultAddr?.lng || null,
          external_key,
          source: labName,
          lab_id: defaultLab.id,      // << ADD THIS line to link lab_id
        };
      }));

      return NextResponse.json({ patients: enrichedPatients }, { status: 200 });
    }

    // Step 2: Patient not found locally, look up in labit-core's patient
    // master (47,182 migrated from Shivam, schema/006_patient.sql) --
    // replaces the old live NeoSoft webform call (2026-09-14, director:
    // "decouple from shivam and move to core"). See labit-core's
    // app/routers/patient_lookup_internal.py for why this specific route
    // (not shivam-archive, not labit-core's existing /api/search) and the
    // live-verified phone coverage (99.4%, not the ~7% a stale schema
    // comment claimed).
    const coreBaseURL = (process.env.LABIT_CORE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    const coreToken = process.env.PATIENT_LOOKUP_INTERNAL_TOKEN;

    if (!coreToken) {
      return NextResponse.json({ error: "PATIENT_LOOKUP_INTERNAL_TOKEN not configured" }, { status: 500 });
    }

    const coreRes = await fetch(
      `${coreBaseURL}/internal/patients/search?phone=${encodeURIComponent(cleanPhone)}`,
      { headers: { "X-Internal-Token": coreToken, Accept: "application/json" } }
    );

    if (!coreRes.ok) {
      const text = await coreRes.text();
      return NextResponse.json({ error: text }, { status: coreRes.status });
    }

    const coreData = await coreRes.json();
    const patientsArray = Array.isArray(coreData?.patients) ? coreData.patients : [];

    const normalized = patientsArray.map(p => ({
      id: null, // labit_core.patient.id, NOT a public.patients id -- do not
                // use this to write into public.patient_addresses etc.
                // until the planned consolidation (public_patient_id bridge)
                // actually happens. Same contract the old NeoSoft path used.
      name: (p.name || '').trim() || 'Unknown Patient',
      phone: cleanPhone,
      dob: p.dob || '',
      gender: mapGender(p.sex || '', genderMap),
      email: p.email || '',
      mrn: p.mrn || '',
      address_line: p.address || '',
      pincode: '', // labit_core.patient has one free-text address field,
                   // no separate pincode -- unlike the old NeoSoft shape.
      lat: null,
      lng: null,
      external_key: p.mrn || '', // mrn IS the Shivam cregno (schema/006's
                                  // own comment) -- same identity the old
                                  // CREGNO field carried.
      source: labName,
    }));

    return NextResponse.json({ patients: normalized }, { status: 200 });
  } catch (err) {
    console.error('Patient Lookup Error:', err);
    return NextResponse.json({ error: "Proxy error: " + err.message }, { status: 500 });
  }
}
