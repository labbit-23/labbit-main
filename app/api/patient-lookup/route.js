// app/api/patient-lookup/route.js
import { NextResponse } from "next/server";
import { supabase } from '../../../lib/supabaseServer';

const DEFAULT_LAB_ID = "b539c161-1e2b-480b-9526-d4b37bd37b1e";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");

  console.log('🔍 [Patient Lookup] Incoming request for phone:', phone);

  if (!phone) {
    console.log('❌ [Patient Lookup] Missing phone parameter');
    return NextResponse.json({ error: "Missing phone parameter" }, { status: 400 });
  }

  // Sanitize phone
  const cleanPhone = phone.replace(/\D/g, '');
  console.log('📞 [Patient Lookup] Cleaned phone:', cleanPhone);

  if (cleanPhone.length < 10 || cleanPhone.length > 13) {
    console.log('❌ [Patient Lookup] Invalid phone length:', cleanPhone.length);
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  try {
    // ✅ Step 1: Check Supabase first
    
    const {   data: localPatients, error: localError } = await supabase
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
      .eq('phone', cleanPhone); // ✅ Exact match

    
    if (localError) {
      console.error('❌ [Patient Lookup] Supabase query error:', localError);
      throw localError;
    }

    // ✅ If found in Supabase → enrich with CREGNO
    if (localPatients && localPatients.length > 0) {
      console.log(`🟢 [Patient Lookup] SUCCESS: Found ${localPatients.length} patient(s) in Supabase for phone: ${cleanPhone}`);
    
      // ✅ Step 2: Fetch CREGNO for each patient
      const enrichedPatients = await Promise.all(localPatients.map(async (p) => {
        const defaultAddr = p.patient_addresses?.find(a => a.is_default);
        console.log(`🔍 [Patient Lookup] Fetching CREGNO for patient ID: ${p.id}`);

        // Fetch CREGNO from patient_external_keys
        const {   data: externalKeys, error: keyError } = await supabase
          .from('patient_external_keys')
          .select('external_key')
          .eq('patient_id', p.id)
          .eq('lab_id', DEFAULT_LAB_ID)
          .limit(1);

        console.log(`🔍 [Patient Lookup] CREGNO query result for ${p.id}:`, { externalKeys, keyError });

        const cregno = keyError
          ? (console.error('❌ CREGNO lookup error:', keyError), '')
          : (externalKeys?.[0]?.external_key || '');

        return {
          id: p.id,
          name: p.name || 'Unknown Patient',
          phone: p.phone || cleanPhone,
          dob: p.dob ? p.dob.split('T')[0] : '',
          gender: p.gender || '',
          email: p.email || '',
          mrn: p.mrn || '',
          address_line: defaultAddr?.address_line || '',
          pincode: defaultAddr?.pincode || '',
          lat: defaultAddr?.lat || null,
          lng: defaultAddr?.lng || null,
          cregno,
        };
      }));

      console.log('🟢 [Patient Lookup] Final enriched patients:', enrichedPatients);
      return NextResponse.json({ patients: enrichedPatients }, { status: 200 });
    }

    // ❌ Not found in Supabase → proceed to external API
    console.log(`🔴 [Patient Lookup] No patient found in Supabase for phone: ${cleanPhone}. Checking external API...`);

    const baseURL = process.env.NEXT_PUBLIC_PATIENT_LOOKUP_URL;
    const apiKey = process.env.NEXT_PUBLIC_PATIENT_LOOKUP_KEY;

    console.log('🌐 [Patient Lookup] External API Config:', { hasURL: !!baseURL, hasKey: !!apiKey });

    if (!baseURL || !apiKey) {
      console.log('❌ [Patient Lookup] API configuration missing');
      return NextResponse.json({ error: "API configuration missing" }, { status: 500 });
    }

    const dataParam = encodeURIComponent(JSON.stringify([{ phone: cleanPhone }]));
    const url = `${baseURL}&data=${dataParam}`;
    console.log('🌐 [Patient Lookup] External API URL:', url);

    const apiRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    console.log('🌐 [Patient Lookup] External API response status:', apiRes.status);

    if (!apiRes.ok) {
      const text = await apiRes.text();
      console.log('❌ [Patient Lookup] External API error:', text);
      return NextResponse.json({ error: text }, { status: apiRes.status });
    }

    const data = await apiRes.json();
    console.log('🌐 [Patient Lookup] External API response data:', data);

    // Normalize external API response
    let patients = [];

    if (Array.isArray(data)) {
      patients = data;
    } else if (data.patients && Array.isArray(data.patients)) {
      patients = data.patients;
    } else if (data.name) {
      patients = [data];
    }

    const normalized = patients.map(p => ({
      id: null,
      name: p.FNAME ? p.FNAME.trim() : 'Unknown Patient',
      phone: cleanPhone,
      dob: p.DOB ? p.DOB.split(' ')[0] : '',
      gender: p.GENDER || p.SEX || '',
      email: p.EMAIL || '',
      mrn: p.MRN || '',
      address_line: [p.DISTRICTNEW, p.STATENEW, p.PINCODE].filter(Boolean).join(', '),
      pincode: p.PINCODE || '',
      lat: null,
      lng: null,
      cregno: p.CREGNO || '',
    }));

    console.log('🌐 [Patient Lookup] Normalized external patients:', normalized);
    return NextResponse.json({ patients: normalized }, { status: 200 });
  } catch (err) {
    console.error('🚨 [Patient Lookup] CRITICAL ERROR:', err);
    return NextResponse.json(
      { error: "Proxy error: " + err.message },
      { status: 500 }
    );
  }
}