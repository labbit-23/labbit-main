// app/api/save-external-key/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseServer';

const DEFAULT_LAB_ID = "b539c161-1e2b-480b-9526-d4b37bd37b1e";

export async function POST(request) {
  try {
    const { patient_id, external_key, lab_id = DEFAULT_LAB_ID } = await request.json();

    if (!patient_id || !external_key) {
      return NextResponse.json(
        { error: 'patient_id and external_key are required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('patient_external_keys')
      .upsert({
        patient_id,
        lab_id,
        external_key
      }, {
        onConflict: 'patient_id,lab_id'
      });

    if (error) throw error;

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error('Error saving external key:', err);
    return NextResponse.json(
      { error: 'Failed to save external key' },
      { status: 500 }
    );
  }
}