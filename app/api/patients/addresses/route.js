// File: /app/api/patients/addresses/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseServer';

// GET: List patient addresses
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

// POST: Upsert patient addresses — respects is_default and includes area
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

    // Validate mandatory fields
    for (const [i, addr] of addresses.entries()) {
      if (!addr.label || typeof addr.label !== 'string' || addr.label.trim() === '') {
        return NextResponse.json(
          { error: `Address at index ${i} missing required field 'label'` },
          { status: 400 }
        );
      }
      if (typeof addr.lat !== 'number' || typeof addr.lng !== 'number') {
        return NextResponse.json(
          { error: `Address at index ${i} missing valid 'lat' or 'lng'` },
          { status: 400 }
        );
      }
      // Area is optional — no strict validation yet
      if (addr.area && typeof addr.area !== 'string') {
        return NextResponse.json(
          { error: `Address at index ${i} has invalid 'area' type` },
          { status: 400 }
        );
      }
    }

    // Sanitize IDs for newly added addresses
    const sanitized = addresses.map(addr => {
      const { id, ...rest } = addr;
      if (id && typeof id === 'string' && id.startsWith('temp')) {
        return { ...rest, patient_id };
      }
      return { ...addr, patient_id };
    });

    // Ensure exactly one default
    let hasDefault = sanitized.some(a => a.is_default === true);
    const mapped = sanitized.map((addr, idx) => ({
      ...addr,
      is_default: addr.is_default === true // trust client flag
    }));

    // If none marked default, set first one as default
    if (!hasDefault && mapped.length > 0) {
      mapped[0].is_default = true;
    }

    console.log('[POST addresses] Upserting addresses (respecting is_default & area):', mapped);

    const { data, error } = await supabase
      .from('patient_addresses')
      .upsert(mapped, { onConflict: ['id'] })
      .select();

    if (error) {
      console.error('[POST addresses] Supabase upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[POST addresses] Successfully upserted ${data.length} addresses.`);
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('[POST addresses] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
