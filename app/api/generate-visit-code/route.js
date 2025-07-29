// app/api/generate-visit-code/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ← Only safe here (server-side)
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const visitDate = searchParams.get('date') || new Date().toISOString();

  const dateStr = dayjs(visitDate).format('YYYYMMDD'); // e.g., 20250405

  // Get last code for this date
  const {  data, error } = await supabase
    .from('visits')
    .select('visit_code')
    .like('visit_code', `VISIT-${dateStr}%`)
    .order('visit_code', { ascending: false })
    .limit(1)
    .for('UPDATE'); // Prevents race condition!

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let nextNum = 1;
  if (data && data.length > 0) {
    const match = data[0].visit_code.match(/VISIT-\d{8}-(\d{4})/);
    nextNum = match ? parseInt(match[1]) + 1 : 1;
  }

  const suffix = nextNum.toString().padStart(4, '0');
  const visitCode = `VISIT-${dateStr}-${suffix}`;

  return NextResponse.json({ visitCode });
}