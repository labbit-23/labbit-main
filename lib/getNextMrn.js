// lib/getNextMrn.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function getNextMrn() {
  const { data, error } = await supabase.rpc('nextval', {
    sequencename: 'patient_mrn_seq',
  });

  if (error) {
    console.error('Error fetching next MRN:', error);
    throw error;
  }

  return `L${data}`;
}