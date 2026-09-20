//app/api/patients/address_labels/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseServer';
import { deny, getSessionUser } from '@/lib/uac/authz';

// Security review, 2026-09-20 -- see app/api/patients/addresses/route.js
// for the full finding; same fix. Also note: without patient_id this
// returns the distinct label vocabulary across ALL patients org-wide
// (an autocomplete suggestion list, e.g. "Home"/"Office") -- low-value
// info on its own, but gated the same way for consistency since it reads
// from the same patient_addresses table.
export async function GET(request) {
  const user = await getSessionUser(request);
  if (!user) return deny('Not authenticated', 401);

  try {
    const url = new URL(request.url);
    const patient_id = url.searchParams.get('patient_id');

    let query = supabase
      .from('patient_addresses')
      .select('label', { distinct: true })
      .neq('label', null)
      .not('label', 'eq', '');

    if (patient_id) {
      query = query.eq('patient_id', patient_id);
    }

    const { data, error } = await query
      .order('label', { ascending: true })
      .limit(100);

    if (error) {
      console.error('Error fetching distinct labels:', error);
      return NextResponse.json({ error: 'Failed to fetch labels' }, { status: 500 });
    }

    const labels = (data || []).map(item => item.label).filter(Boolean);

    console.log(`Fetched ${labels.length} distinct labels${patient_id ? ` for patient ${patient_id}` : '' }`);
    return NextResponse.json(labels, { status: 200 });
  } catch (err) {
    console.error('Unexpected error in address_labels API:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
