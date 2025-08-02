// File: /app/api/patients/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseServer'; // Adjust as per your project

// Helper function to get max address_index for a patient (or -1 if none)
async function getMaxAddressIndex(patientId) {
  const { data, error } = await supabase
    .from('patient_addresses')
    .select('address_index')
    .eq('patient_id', patientId)
    .order('address_index', { ascending: false })
    .limit(1)
    .maybeSingle(); // Use maybeSingle to handle zero rows gracefully

  if (error) {
    console.error('Error fetching max address_index:', error);
    return -1;
  }
  if (!data) return -1; // No addresses found

  return data.address_index ?? -1;
}

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      id,         // Patient ID for update/create
      mrn,
      phone,
      name,
      dob,
      gender,
      email,
      cregno,     // External key
      addresses = [], // Array of addresses from frontend including label, lat, lng, etc.
    } = body;

    if (!phone || !name) {
      return NextResponse.json({ error: 'Phone and name are required' }, { status: 400 });
    }

    let patient;
    let isNewPatient = false;

    if (id) {
      // Update existing patient (DO NOT generate new MRN on update)
      const { data, error: updateError } = await supabase
        .from('patients')
        .update({ phone, name, dob, gender, email, mrn })
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        console.error('Update error:', updateError);
        return NextResponse.json(
          { error: 'Failed to update patient', details: updateError.message },
          { status: 500 }
        );
      }
      patient = data;

    } else {
      // Create new patient – generate MRN using DB sequence and prefix "L"
      isNewPatient = true;

      // Ensure your DB has the RPC function nextval_patient_mrn_seq() created (see prior messages)
      const { data: seqData, error: seqError } = await supabase.rpc('nextval_patient_mrn_seq');
      if (seqError) {
        console.error('Sequence nextval error:', seqError);
        return NextResponse.json(
          { error: 'Failed to generate MRN', details: seqError.message },
          { status: 500 }
        );
      }

      const newMrn = `L${seqData}`;

      const { data, error: insertError } = await supabase
        .from('patients')
        .insert([{ phone, name, dob, gender, email, mrn: newMrn }])
        .select()
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        return NextResponse.json(
          { error: 'Failed to create patient', details: insertError.message },
          { status: 500 }
        );
      }
      patient = data;
    }

    if (!patient) {
      console.error('No patient data returned after insert/update');
      return NextResponse.json({ error: 'No patient data returned' }, { status: 500 });
    }

    // Handle addresses with proper ID sanitization and address_index logic
    if (addresses.length > 0) {
      // Sanitize IDs on addresses to avoid 'temp-' placeholder errors
      const sanitizedAddresses = addresses.map(addr => {
        if (addr.id && typeof addr.id === 'string' && addr.id.startsWith('temp')) {
          const { id, ...rest } = addr;
          return { ...rest, patient_id: patient.id };
        }
        return { ...addr, patient_id: patient.id };
      });

      // Fetch current max address_index to maintain uniqueness
      const currentMaxIndex = await getMaxAddressIndex(patient.id);

      // Handle default address index assignment and avoid conflicts
      const defaultIdx = sanitizedAddresses.findIndex(addr => addr.is_default === true);
      if (defaultIdx !== -1) {
        sanitizedAddresses[defaultIdx].address_index = 0;
        const otherAtZeroIdx = sanitizedAddresses.findIndex(
          (addr, idx) => idx !== defaultIdx && addr.address_index === 0
        );
        if (otherAtZeroIdx !== -1) {
          sanitizedAddresses[otherAtZeroIdx].address_index = currentMaxIndex + 1;
        }
      }

      // Assign sequential address_index to addresses missing one or with duplicates (skip default at 0)
      let nextIndex = 1;
      for (let i = 0; i < sanitizedAddresses.length; i++) {
        if (i === defaultIdx) continue;
        if (
          !Number.isInteger(sanitizedAddresses[i].address_index) ||
          sanitizedAddresses[i].address_index === 0
        ) {
          sanitizedAddresses[i].address_index = nextIndex++;
        }
      }

      // Upsert addresses with conflict resolution on id
      const { error: addrError } = await supabase
        .from('patient_addresses')
        .upsert(sanitizedAddresses, {
          onConflict: 'id',
          returning: 'representation',
        });

      if (addrError) {
        console.error('Address upsert error:', addrError);
        return NextResponse.json(
          { error: 'Failed to save patient addresses', details: addrError.message },
          { status: 500 }
        );
      }
    }

    // Save CREGNO (external key) if provided
    if (cregno) {
      try {
        const DEFAULT_LAB_ID = "b539c161-1e2b-480b-9526-d4b37bd37b1e";
        const savePatientExternalKey = require('../../../lib/savePatientExternalKey').default;
        const success = await savePatientExternalKey(patient.id, DEFAULT_LAB_ID, cregno);
        if (!success) {
          console.warn(`Failed to save CREGNO ${cregno} for patient ${patient.id}`);
        }
      } catch (keyError) {
        console.error('Error saving CREGNO:', keyError);
      }
    }

    return NextResponse.json(patient, { status: isNewPatient ? 201 : 200 });

  } catch (err) {
    console.error('Unexpected error in /api/patients:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}
