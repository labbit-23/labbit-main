// app/api/patients/address_labels/route.js

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseServer' // Adjust path if needed

export async function GET() {
  try {
    // Use Supabase to select distinct labels from patient_addresses
    // Note: supabase-js supports distinct select with `{ distinct: true }`
    const { data, error } = await supabase
      .from('patient_addresses')
      .select('label', { distinct: true })
      .neq('label', null)
      .not('label', 'eq', '')
      .order('label', { ascending: true })
      .limit(100) // Optional: limit for performance

    if (error) {
      console.error('Error fetching distinct labels:', error)
      return NextResponse.json({ error: 'Failed to fetch labels' }, { status: 500 })
    }

    // Extract unique label strings; filter out any falsy values just in case
    const labels = (data || []).map((item) => item.label).filter(Boolean)

    console.log(`Fetched ${labels.length} distinct labels`)

    // Return the labels array as JSON
    return NextResponse.json(labels, { status: 200 })

  } catch (err) {
    console.error('Unexpected error in address_labels API:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
