// File: /app/api/patients/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseServer';
import { checkPermission, deny, getSessionUser } from '@/lib/uac/authz';
import { writeAuditLog } from '@/lib/audit/logger';

async function getMaxAddressIndex(patientId) {
  const { data, error } = await supabase
    .from('patient_addresses')
    .select('address_index')
    .eq('patient_id', patientId)
    .order('address_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching max address_index:', error);
    return -1;
  }
  if (!data) return -1;

  return data.address_index ?? -1;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function findPhoneConflicts(phone, excludePatientId = null) {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];

  let query = supabase
    .from('patients')
    .select('id, name, phone')
    .ilike('phone', `%${normalized}`)
    .limit(200);

  if (excludePatientId) query = query.neq('id', excludePatientId);

  const { data, error } = await query;
  if (error) {
    console.error('Phone conflict lookup failed:', error);
    return [];
  }

  return (data || []).filter((row) => normalizePhone(row.phone) === normalized);
}

export async function POST(request) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return deny('Not authenticated', 401);
    }

    const body = await request.json();

    const {
      id,
      mrn,
      phone,
      name,
      dob,
      gender,
      email,
      cregno,
      external_key,
      lab_id,
      addresses = [],
    } = body;

    if (!phone || !name) {
      return NextResponse.json({ error: 'Phone and name are required' }, { status: 400 });
    }

    let patient;
    let isNewPatient = false;
    let roleKey = 'viewer';
    let beforePatient = null;
    let phoneRelationCandidates = [];

    if (id) {
      const permissionCheck = checkPermission(user, 'patients.update');
      roleKey = permissionCheck.roleKey;
      if (!permissionCheck.ok) {
        await writeAuditLog({
          request,
          user,
          roleKey,
          action: 'patients.update',
          entityType: 'patients',
          entityId: id,
          status: 'denied',
          metadata: { reason: 'missing patients.update' }
        });
        return deny('You do not have permission to update patients.', 403, { permission: 'patients.update' });
      }

      const { data: existingPatient, error: fetchExistingError } = await supabase
        .from('patients')
        .select('id, name, phone, dob, gender, email, mrn')
        .eq('id', id)
        .single();

      if (fetchExistingError || !existingPatient) {
        return NextResponse.json(
          { error: 'Patient not found', details: fetchExistingError?.message || null },
          { status: 404 }
        );
      }
      beforePatient = existingPatient;

      const normalizedOldName = String(existingPatient.name || '').trim().toLowerCase();
      const normalizedNewName = String(name || '').trim().toLowerCase();
      const normalizedOldPhone = normalizePhone(existingPatient.phone);
      const normalizedNewPhone = normalizePhone(phone);
      const identityChanged = normalizedOldName !== normalizedNewName || normalizedOldPhone !== normalizedNewPhone;

      if (identityChanged) {
        const identityCheck = checkPermission(user, 'patients.update_identity');
        if (!identityCheck.ok) {
          await writeAuditLog({
            request,
            user,
            roleKey,
            action: 'patients.update_identity',
            entityType: 'patients',
            entityId: id,
            status: 'denied',
            before: { id: existingPatient.id, name: existingPatient.name, phone: existingPatient.phone },
            after: { name, phone },
            metadata: { reason: 'missing patients.update_identity' }
          });
          return deny(
            'You do not have permission to edit patient identity fields (name/phone).',
            403,
            { permission: 'patients.update_identity' }
          );
        }
      }

      phoneRelationCandidates = await findPhoneConflicts(phone, id);

      const { data, error: updateError } = await supabase
        .from('patients')
        .update({ phone, name, dob, gender, email, mrn })
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        console.error('Update error:', updateError);
        return NextResponse.json(
          { error: 'Failed to update patient', details: updateError.message },
          { status: 500 }
        );
      }
      patient = data;

      await writeAuditLog({
        request,
        user,
        roleKey,
        action: identityChanged ? 'patients.update_identity' : 'patients.update',
        entityType: 'patients',
        entityId: patient?.id || id,
        before: beforePatient,
        after: patient,
        status: 'success',
        metadata: {
          shared_phone_detected: phoneRelationCandidates.length > 0,
          shared_phone_candidates: phoneRelationCandidates.map((row) => ({
            id: row.id,
            name: row.name,
            phone: row.phone
          }))
        }
      });
    } else {
      const permissionCheck = checkPermission(user, 'patients.create');
      roleKey = permissionCheck.roleKey;
      if (!permissionCheck.ok) {
        await writeAuditLog({
          request,
          user,
          roleKey,
          action: 'patients.create',
          entityType: 'patients',
          entityId: null,
          status: 'denied',
          metadata: { reason: 'missing patients.create' }
        });
        return deny('You do not have permission to create patients.', 403, { permission: 'patients.create' });
      }

      phoneRelationCandidates = await findPhoneConflicts(phone, null);

      isNewPatient = true;

      const { data: seqData, error: seqError } = await supabase.rpc('nextval_patient_mrn_seq');
      if (seqError) {
        console.error('Sequence nextval error:', seqError);
        return NextResponse.json(
          { error: 'Failed to generate MRN', details: seqError.message },
          { status: 500 }
        );
      }

      const newMrn = `L${seqData}`;

      const { data, error: insertError } = await supabase
        .from('patients')
        .insert([{ phone, name, dob, gender, email, mrn: newMrn, is_lead: false }])
        .select()
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        return NextResponse.json(
          { error: 'Failed to create patient', details: insertError.message },
          { status: 500 }
        );
      }
      patient = data;

      await writeAuditLog({
        request,
        user,
        roleKey,
        action: 'patients.create',
        entityType: 'patients',
        entityId: patient?.id || null,
        before: null,
        after: patient,
        status: 'success',
        metadata: {
          shared_phone_detected: phoneRelationCandidates.length > 0,
          shared_phone_candidates: phoneRelationCandidates.map((row) => ({
            id: row.id,
            name: row.name,
            phone: row.phone
          }))
        }
      });
    }

    if (!patient) {
      console.error('No patient data returned after insert/update');
      return NextResponse.json({ error: 'No patient data returned' }, { status: 500 });
    }

    if (addresses.length > 0) {
      const sanitizedAddresses = addresses.map((addr) => {
        if (addr.id && typeof addr.id === 'string' && addr.id.startsWith('temp')) {
          const { id: _id, ...rest } = addr;
          return { ...rest, patient_id: patient.id };
        }
        return { ...addr, patient_id: patient.id };
      });

      const currentMaxIndex = await getMaxAddressIndex(patient.id);

      const defaultIdx = sanitizedAddresses.findIndex((addr) => addr.is_default === true);
      if (defaultIdx !== -1) {
        sanitizedAddresses[defaultIdx].address_index = 0;
        const otherAtZeroIdx = sanitizedAddresses.findIndex(
          (addr, idx) => idx !== defaultIdx && addr.address_index === 0
        );
        if (otherAtZeroIdx !== -1) {
          sanitizedAddresses[otherAtZeroIdx].address_index = currentMaxIndex + 1;
        }
      }

      let nextIndex = 1;
      for (let i = 0; i < sanitizedAddresses.length; i += 1) {
        if (i === defaultIdx) continue;
        if (!Number.isInteger(sanitizedAddresses[i].address_index) || sanitizedAddresses[i].address_index === 0) {
          sanitizedAddresses[i].address_index = nextIndex;
          nextIndex += 1;
        }
      }

      const { error: addrError } = await supabase
        .from('patient_addresses')
        .upsert(sanitizedAddresses, {
          onConflict: 'id',
          returning: 'representation',
        });

      if (addrError) {
        console.error('Address upsert error:', addrError);
        return NextResponse.json(
          { error: 'Failed to save patient addresses', details: addrError.message },
          { status: 500 }
        );
      }
    }

    const sessionLabId =
      Array.isArray(user?.labIds) && user.labIds.length > 0
        ? user.labIds.find(Boolean) || null
        : user?.labId || null;
    const resolvedLabId = String(lab_id || sessionLabId || '').trim() || undefined;
    const resolvedExternalKey = String(external_key || cregno || '').trim();
    if (resolvedExternalKey) {
      try {
        const savePatientExternalKey = require('../../../lib/savePatientExternalKey').default;
        const success = await savePatientExternalKey(patient.id, resolvedLabId, resolvedExternalKey);
        if (!success) {
          console.warn(`Failed to save external key ${resolvedExternalKey} for patient ${patient.id}`);
        }
      } catch (keyError) {
        console.error('Error saving external key:', keyError);
      }
    }

    const responsePayload =
      phoneRelationCandidates.length > 0
        ? {
            ...patient,
            warnings: [
              {
                code: 'SHARED_PHONE_DETECTED',
                message: 'Same phone exists on other patient records. Verify relationship before proceeding.',
                related_patients: phoneRelationCandidates.map((row) => ({
                  id: row.id,
                  name: row.name,
                  phone: row.phone,
                })),
              },
            ],
          }
        : patient;

    return NextResponse.json(responsePayload, { status: isNewPatient ? 201 : 200 });
  } catch (err) {
    console.error('Unexpected error in /api/patients:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}
