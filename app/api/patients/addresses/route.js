// app/api/patients/addresses/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseServer'; // Adjust the path to your supabase client

export async function GET(request) {
  const url = new URL(request.url);
  const patient_id = url.searchParams.get('patient_id');

  if (!patient_id) {
    console.log('[GET addresses] Missing patient_id in query');
    return NextResponse.json({ error: 'Missing patient_id' }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from('patient_addresses')
      .select('*')
      .eq('patient_id', patient_id)
      .order('address_index', { ascending: true });

    if (error) {
      console.error('[GET addresses] Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[GET addresses] Retrieved ${data.length} addresses for patient_id: ${patient_id}`);
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('[GET addresses] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { patient_id, addresses } = body;

    console.log('[POST addresses] Received payload:', { patient_id, addresses });

    if (!patient_id || !Array.isArray(addresses)) {
      console.warn('[POST addresses] Missing required fields:', { patient_id, addresses });
      return NextResponse.json(
        { error: 'patient_id and addresses array are required' },
        { status: 400 }
      );
    }

    // Validate required fields on each address
    for (const [i, addr] of addresses.entries()) {
      if (!addr.label) {
        console.warn(`[POST addresses] Address at index ${i} missing label`);
        return NextResponse.json(
          { error: `Address at index ${i} missing required field 'label'` },
          { status: 400 }
        );
      }
      if (typeof addr.lat !== 'number' || typeof addr.lng !== 'number') {
        console.warn(`[POST addresses] Address at index ${i} missing valid lat/lng`);
        return NextResponse.json(
          { error: `Address at index ${i} missing valid 'lat' or 'lng'` },
          { status: 400 }
        );
      }
    }

    // Set only the last address in the list as default; unset is_default on others
    const mappedAddresses = addresses.map((addr, idx, arr) => {
      // Remove pin_code if present to avoid schema conflict
      const { pin_code, ...cleanAddr } = addr;

      return {
        ...cleanAddr,
        patient_id,
        is_default: idx === arr.length - 1,
      };
    });

    console.log('[POST addresses] Upserting addresses with last set as default:', mappedAddresses);

    // Use upsert with onConflict on 'id' (primary key) for inserts/updates
    const { data, error } = await supabase
      .from('patient_addresses')
      .upsert(mappedAddresses, { onConflict: ['id'] })
      .select();

    if (error) {
      console.error('[POST addresses] Supabase upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[POST addresses] Successfully upserted ${data.length} addresses for patient_id: ${patient_id}`);

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('[POST addresses] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
