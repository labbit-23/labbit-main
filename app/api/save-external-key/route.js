// app/api/save-external-key/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseServer';
import { checkPermission, deny, getSessionUser } from '@/lib/uac/authz';
import { writeAuditLog } from '@/lib/audit/logger';

const DEFAULT_LAB_ID = "b539c161-1e2b-480b-9526-d4b37bd37b1e";

// Security review, 2026-09-20 (Labit App session): this route wrote
// patient_external_keys -- the real patient<->labit-core-MRN link (963
// patients depend on it; the public_patient_id bridge is empty) -- with
// no auth check at all. Any caller who could guess/enumerate a
// patient_id UUID could silently overwrite this link for any patient.
// Locked down to the same permission app/api/patients/route.js already
// requires for identity-changing edits (patients.update_identity) --
// this route changes a patient's identity link just as much as editing
// name/phone does, so it should require the same gate, not a new one.
// Only caller found (app/components/PatientsTab.js's saveExternalKey())
// is a staff-only "link Shivam MRNO" admin action gated by its own UI
// confirm dialog -- runs from a logged-in staff session, so this is a
// pure hardening, not a behavior change for that caller.
export async function POST(request) {
  let user = null;
  let roleKey = 'viewer';
  try {
    user = await getSessionUser(request);
    if (!user) return deny('Not authenticated', 401);

    const { patient_id, external_key, lab_id = DEFAULT_LAB_ID } = await request.json();

    if (!patient_id || !external_key) {
      return NextResponse.json(
        { error: 'patient_id and external_key are required' },
        { status: 400 }
      );
    }

    const permissionCheck = await checkPermission(user, 'patients.update_identity');
    roleKey = permissionCheck.roleKey;
    if (!permissionCheck.ok) {
      await writeAuditLog({
        request,
        user,
        roleKey,
        action: 'patients.update_identity',
        entityType: 'patient_external_keys',
        entityId: patient_id,
        status: 'denied',
        metadata: { reason: 'missing patients.update_identity', lab_id }
      });
      return deny(
        'You do not have permission to link a patient identity key.',
        403,
        { permission: 'patients.update_identity' }
      );
    }

    const { error } = await supabase
      .from('patient_external_keys')
      .upsert({
        patient_id,
        lab_id,
        external_key
      }, {
        onConflict: 'patient_id,lab_id'
      });

    if (error) throw error;

    await writeAuditLog({
      request,
      user,
      roleKey,
      action: 'patients.update_identity',
      entityType: 'patient_external_keys',
      entityId: patient_id,
      status: 'success',
      metadata: { lab_id, external_key }
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error('Error saving external key:', err);
    return NextResponse.json(
      { error: 'Failed to save external key' },
      { status: 500 }
    );
  }
}