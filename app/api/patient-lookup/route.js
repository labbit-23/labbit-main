// File: /app/api/patient-lookup/route.js
import { NextResponse } from "next/server";
import { supabase } from '../../../lib/supabaseServer';

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

    // Step 2: Patient not found locally, lookup externally
    const { data: apiConfig, error: apiError } = await supabase
      .from('labs_apis')
      .select('base_url, auth_details, templates')
      .eq('lab_id', defaultLab.id)
      .eq('api_name', 'external_patient_lookup')
      .single();

    if (apiError || !apiConfig) {
      return NextResponse.json({ error: "Default lab external patient API config missing" }, { status: 500 });
    }

    const baseURL = apiConfig.base_url;
    const apiKey = apiConfig.auth_details?.apikey;

    if (!baseURL || !apiKey) {
      return NextResponse.json({ error: "External API URL or key missing" }, { status: 500 });
    }

    const fieldMap = apiConfig.templates?.field_map || {
      name: "FNAME",
      dob: "DOB",
      gender: "SEX",
      email: "EMAIL",
      mrn: "MRN",
      address_line: ["DISTRICTNEW", "STATENEW", "PINCODE"],
      pincode: "PINCODE",
      external_key: "CREGNO"
    };

    const dataParam = encodeURIComponent(JSON.stringify([{ phone: cleanPhone }]));
    const url = `${baseURL}&data=${dataParam}`;

    const apiRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!apiRes.ok) {
      const text = await apiRes.text();
      return NextResponse.json({ error: text }, { status: apiRes.status });
    }

    const data = await apiRes.json();

    let patientsArray = [];
    if (Array.isArray(data)) {
      patientsArray = data;
    } else if (data.patients && Array.isArray(data.patients)) {
      patientsArray = data.patients;
    } else if (data.name || data[fieldMap.name]) {
      patientsArray = [data];
    }

    const normalized = patientsArray.map(p => {
      const genderValue = p[fieldMap.gender] ?? '';
      const mappedGender = mapGender(genderValue, genderMap);

      return {
        id: null,
        name: p[fieldMap.name]?.trim() || 'Unknown Patient',
        phone: cleanPhone,
        dob: p[fieldMap.dob]?.split(' ')[0] || '',
        gender: mappedGender,
        email: p[fieldMap.email] || '',
        mrn: p[fieldMap.mrn] || '',
        address_line: Array.isArray(fieldMap.address_line)
          ? fieldMap.address_line.map(k => p[k]).filter(Boolean).join(', ')
          : '',
        pincode: p[fieldMap.pincode] || '',
        lat: null,
        lng: null,
        external_key: p[fieldMap.external_key] || '',
        source: labName,
      };
    });

    return NextResponse.json({ patients: normalized }, { status: 200 });
  } catch (err) {
    console.error('Patient Lookup Error:', err);
    return NextResponse.json({ error: "Proxy error: " + err.message }, { status: 500 });
  }
}
