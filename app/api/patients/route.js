// app/api/patients/route.js

import { NextResponse } from 'next/server';
import savePatientExternalKey from '../../../lib/savePatientExternalKey';
import { supabase } from '../../../lib/supabaseServer'; // ✅ Use server client

const DEFAULT_LAB_ID = "b539c161-1e2b-480b-9526-d4b37bd37b1e";

export async function POST(request) {
  try {
    const body = await request.json();
    console.log('Received payload:', body);

    const {
      id, // Patient ID for update
      mrn,
      phone,
      name,
      dob,
      gender,
      email,
      // Fields for the *default* address (if provided during patient creation/update)
      address_line,
      pincode,
      lat,
      lng,
      cregno // External key
    } = body;

    if (!phone || !name) {
      return NextResponse.json(
        { error: 'Phone and name are required' },
        { status: 400 }
      );
    }

    let patient;
    let isNewPatient = false;

    if (id) {
      // ✅ Update existing patient
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
      // ✅ Create new patient
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
      return NextResponse.json(
        { error: 'No patient data returned' },
        { status: 500 }
      );
    }

    // ✅ Save/Update the DEFAULT address IF coordinates are provided
    // This part now correctly uses the partial unique index for conflict resolution
    if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
      // Decide if this should be default. For this route, we'll assume
      // it's intended to be the default if coordinates are given during patient save.
      // A more robust system would have a separate address management flow.
      const addressPayload = {
        patient_id: patient.id,
        address_line: address_line || '', // Provide defaults if not given
        pincode: pincode || '',
        lat,
        lng,
        is_default: true // This route manages the default address
      };

      // Upsert the default address
      // The onConflict clause matches the partial unique index:
      // CREATE UNIQUE INDEX unique_default_address_per_patient ON patient_addresses (patient_id) WHERE is_default = true;
      // Therefore, conflict is resolved based on patient_id when is_default=true.
      const { error: addrError } = await supabase
        .from('patient_addresses')
        .upsert(addressPayload, {
          // ✅ Correct onConflict for the partial index
          onConflict: 'patient_id' // Conflict is detected on patient_id where is_default=true
        });

      if (addrError) {
        console.error('Default Address upsert error:', addrError);
        // Consider if this should fail the whole patient save or just log the error
        // For now, we log and continue, as the patient itself was saved.
        // return NextResponse.json(
        //   { error: 'Failed to save default address', details: addrError.message },
        //   { status: 500 }
        // );
      } else {
         console.log(`Default address ${isNewPatient ? 'created' : 'updated'} for patient ${patient.id}`);
      }
    } else {
      console.log("No coordinates provided, skipping default address upsert in /api/patients");
    }

    // ✅ Save CREGNO if provided
    if (cregno) {
      try {
        const success = await savePatientExternalKey(patient.id, DEFAULT_LAB_ID, cregno);
        if (!success) {
           console.warn(`Failed to save CREGNO ${cregno} for patient ${patient.id}`);
           // Decide if this failure should be reported to the frontend
        }
      } catch (keyError) {
        console.error('Error saving CREGNO:', keyError);
        // Decide if this should fail the whole request
        // For now, log and continue
      }
    }

    return NextResponse.json(patient, { status: 201 });
  } catch (err) {
    console.error('Unexpected error in /api/patients:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}