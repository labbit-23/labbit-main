// File: /app/api/patients/addresses/set_default/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseServer';

export async function POST(request) {
  try {
    const { patient_id, address_id } = await request.json();

    if (!patient_id || !address_id) {
      return NextResponse.json({ error: 'Missing patient_id or address_id' }, { status: 400 });
    }

    // clear existing defaults
    await supabase
      .from('patient_addresses')
      .update({ is_default: false })
      .eq('patient_id', patient_id);

    // set new default
    const { data, error } = await supabase
      .from('patient_addresses')
      .update({ is_default: true })
      .eq('id', address_id)
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
