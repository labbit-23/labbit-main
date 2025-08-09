// /app/api/patient-labs/route.js
import { NextResponse } from "next/server";
import { supabase } from '@/lib/supabaseServer';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');
  if (!phone) {
    return NextResponse.json({ error: "Missing phone parameter" }, { status: 400 });
  }

  try {
    // Lookup patient ids associated with phone
    const { data: patients } = await supabase
      .from('patients')
      .select('id')
      .eq('phone', phone);

    if (!patients?.length) {
      // Return default lab if no patient found
      const { data: defaultLab } = await supabase
        .from('labs')
        .select('id')
        .eq('is_default', true)
        .single();
      return NextResponse.json({ labIds: [defaultLab.id] });
    }

    // Lookup labs associated to patient(s)
    const patientIds = patients.map(p => p.id);
    const { data: mappings } = await supabase
      .from('patient_external_keys')
      .select('lab_id')
      .in('patient_id', patientIds);

    const uniqueLabIds = [...new Set(mappings.map(m => m.lab_id))].filter(Boolean);
    return NextResponse.json({ labIds: uniqueLabIds.length ? uniqueLabIds : [] });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch patient labs" }, { status: 500 });
  }
}
