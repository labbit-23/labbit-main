// lib/savePatientExternalKey.js
import { supabase } from './supabaseServer'; // ✅ Use server client

const DEFAULT_LAB_ID = "b539c161-1e2b-480b-9526-d4b37bd37b1e";

export default async function savePatientExternalKey(patientId, labId = DEFAULT_LAB_ID, externalKey = null) {
  // 2026-09-14: externalKey used to be required, so a brand-new patient
  // with no legacy/NeoSoft match (a genuine first-time contact) never got
  // a patient_external_keys row at all -- permanently invisible to any
  // lab-scoped query (RLS hardening tranche 1's mode="lab" policies key
  // off this table). external_key is nullable at the schema level; this
  // was an app-code choice, not a real constraint. lab_id is what actually
  // matters for scoping -- external_key is optional metadata for when a
  // legacy identifier exists.
  if (!patientId || !labId) {
    console.warn('Missing patientId or labId');
    return false;
  }

  const { error } = await supabase
    .from('patient_external_keys')
    .upsert({
      patient_id: patientId,
      lab_id: labId,
      external_key: externalKey || null
    }, {
      onConflict: 'patient_id,lab_id'
    });

  if (error) {
    console.error('Error saving external key:', error);
    return false;
  }

  return true;
}