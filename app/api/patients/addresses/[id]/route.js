//app/api/patients/addresses/[id]/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseServer';
import { deny, getSessionUser } from '@/lib/uac/authz';

// Security review, 2026-09-20 -- see app/api/patients/addresses/route.js
// for the full finding; same fix (staff session required, no new
// permission invented).
export async function DELETE(request, { params }) {
  const user = await getSessionUser(request);
  if (!user) return deny('Not authenticated', 401);

  const { id } = params;

  const url = new URL(request.url);
  const patient_id = url.searchParams.get('patient_id');

  if (!patient_id || !id) {
    return NextResponse.json({ error: 'Missing patient_id or address id' }, { status: 400 });
  }

  const { error } = await supabase
    .from('patient_addresses')
    .delete()
    .eq('id', id)
    .eq('patient_id', patient_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
