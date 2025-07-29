// lib/savePatientExternalKey.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_LAB_ID = "b539c161-1e2b-480b-9526-d4b37bd37b1e";

// ✅ Use default export
export default async function savePatientExternalKey(patientId, labId = DEFAULT_LAB_ID, externalKey) {
  if (!patientId || !externalKey) {
    console.warn('Missing patientId or externalKey');
    return false;
  }

  const { error } = await supabase
    .from('patient_external_keys')
    .upsert({
      patient_id: patientId,
      lab_id: labId,
      external_key: externalKey
    }, {
      onConflict: 'patient_id,lab_id'
    });

  if (error) {
    console.error('Error saving external key:', error);
    return false;
  }

  return true;
}