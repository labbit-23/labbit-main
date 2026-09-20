// File: /app/api/patients/addresses/set_default/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseServer';
import { deny, getSessionUser } from '@/lib/uac/authz';

// Security review, 2026-09-20 -- see app/api/patients/addresses/route.js
// for the full finding; same fix (staff session required, no new
// permission invented).
export async function POST(request) {
  const user = await getSessionUser(request);
  if (!user) return deny('Not authenticated', 401);

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
