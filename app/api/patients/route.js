// app/api/patients/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseServer'; // Adjust this import path accordingly

// Helper function to get max address_index for a patient (or -1 if none)
async function getMaxAddressIndex(patientId) {
  const { data, error } = await supabase
    .from('patient_addresses')
    .select('address_index')
    .eq('patient_id', patientId)
    .order('address_index', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('Error fetching max address_index:', error);
    return -1;
  }
  return data?.address_index ?? -1;
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

      // Instead of single default address props, expect `addresses` array with label, lat, lng, etc.
      addresses = [], // array of addresses from frontend including their indices and labels
    } = body;

    if (!phone || !name) {
      return NextResponse.json({ error: 'Phone and name are required' }, { status: 400 });
    }

    let patient;
    let isNewPatient = false;

    if (id) {
      // Update existing patient
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
      // Create new patient
      isNewPatient = true;
      const { data, error: insertError } = await supabase
        .from('patients')
        .insert([{ phone, name, dob, gender, email, mrn }])
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
      console.error('No data returned from Supabase after insert/update');
      return NextResponse.json({ error: 'No patient data returned' }, { status: 500 });
    }

    // *** Handle Addresses and `address_index` update logic here ***

    if (addresses.length > 0) {
      // Find index of address marked as default (if any)
      const defaultIdx = addresses.findIndex(addr => addr.is_default === true);

      // Fetch current max address_index to use if needed
      const currentMaxIndex = await getMaxAddressIndex(patient.id);

      // If a default address exists in sent addresses
      if (defaultIdx !== -1) {
        // Assign index 0 to the default address
        addresses[defaultIdx].address_index = 0;

        // Find if any other address currently has address_index 0 (except defaultIdx address)
        const otherAtZero = addresses.findIndex(
          (addr, idx) => idx !== defaultIdx && addr.address_index === 0
        );

        if (otherAtZero !== -1) {
          // Move that 'otherAtZero' address to max index +1 to avoid conflict
          addresses[otherAtZero].address_index = currentMaxIndex + 1;
        }
      }

      // For addresses without address_index or duplicate indices, assign indices sequentially starting from 1
      // Skip the address with index 0 (default). Make unique indices for others.
      let nextIndex = 1;
      for (let i = 0; i < addresses.length; i++) {
        if (i === defaultIdx) continue;
        if (
          !Number.isInteger(addresses[i].address_index) ||
          addresses[i].address_index === 0
        ) {
          // Assign next available index
          addresses[i].address_index = nextIndex++;
        }
      }

      // Prepare upsert payload: add patient_id to each address
      const addressesToUpsert = addresses.map(addr => ({
        ...addr,
        patient_id: patient.id,
      }));

      // Upsert all addresses with conflict resolution on id
      const { error: addrError } = await supabase
        .from('patient_addresses')
        .upsert(addressesToUpsert, {
          onConflict: 'id',
          returning: 'representation',  // to get updated rows back in PostgreSQL
        });

      if (addrError) {
        console.error('Address upsert error:', addrError);
        return NextResponse.json(
          { error: 'Failed to save patient addresses', details: addrError.message },
          { status: 500 }
        );
      }
    }

    // Save CREGNO if provided
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
