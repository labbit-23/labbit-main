// app/api/patients/address_labels/route.js
// Fetch distinct non-null, non-empty labels from patient_addresses

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseServer';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('patient_addresses')
      .select('label', { distinct: true })
      .neq('label', null)
      .not('label', 'eq', '')
      .order('label', { ascending: true })
      .limit(100);

    if (error) {
      console.error('Error fetching distinct labels:', error);
      return NextResponse.json({ error: 'Failed to fetch labels' }, { status: 500 });
    }

    const labels = (data || []).map(item => item.label).filter(Boolean);

    console.log(`Fetched ${labels.length} distinct labels`);
    return NextResponse.json(labels, { status: 200 });
  } catch (err) {
    console.error('Unexpected error in address_labels API:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
