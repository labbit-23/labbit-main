import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseServer';

export async function GET(request) {
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
