// lib/getNextMrn.js
import { supabase } from './supabaseServer';

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