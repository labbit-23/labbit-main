// File: /lib/visitSms.js

import { supabase } from "@/lib/supabaseServer";

/**
 * Utility to send an SMS using /api/send-sms.
 * @param {object} payload { phone, labId, templateName, templateVars }
 */
async function sendSmsViaApi(payload) {
  const apiBase =
    process.env.NEXT_PUBLIC_BASE_URL || "";
  const res = await fetch(`${apiBase}/api/send-sms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SMS send failed: ${text}`);
  }
  return await res.json();
}

/**
 * Send patient_visit SMS to the patient for a visit.
 * @param {string} visitId
 */
export async function sendPatientVisitSms(visitId) {
  // Fetch visit and related info for patient SMS
  const { data: visit, error } = await supabase
    .from("visits")
    .select(`
      id,
      lab_id,
      visit_date,
      status,
      patient:patient_id (name, phone),
      time_slot:time_slot (slot_name)
    `)
    .eq("id", visitId)
    .single();

  if (error || !visit) throw new Error("Visit not found for patient SMS");

  // Compose variables for patient_visit template
  const templateVars = {
    patient_name: visit.patient?.name || "",
    visit_date: visit.visit_date || "",
    slot_time: visit.time_slot?.slot_name || "",
    status: visit.status || "",
    whatsapp_number: process.env.SMS_WHATSAPP_NUMBER || "+919849110001",
    phone_number: process.env.SMS_PHONE_NUMBER || "04066004200"
  };

  // Send SMS via /api/send-sms
  return sendSmsViaApi({
    phone: visit.patient?.phone,
    labId: visit.lab_id,
    templateName: "patient_visit",
    templateVars,
  });
}

/**
 * Send phlebo_visit SMS to the assigned executive (phlebo) for a visit.
 * @param {string} visitId
 */
export async function sendPhleboVisitSms(visitId) {
  // Fetch visit and related info for phlebo SMS
  const { data: visit, error } = await supabase
    .from("visits")
    .select(`
      id,
      lab_id,
      visit_date,
      status,
      patient:patient_id (name),
      executive:executive_id (name, phone),
      time_slot:time_slot (slot_name)
    `)
    .eq("id", visitId)
    .single();

  if (
    error ||
    !visit ||
    !visit.executive?.phone ||
    !visit.patient?.name
  )
    return; // No SMS sent if no phlebo or patient info

  // Compose variables for phlebo_visit template
  const templateVars = {
    phlebo_name: visit.executive?.name || "",
    patient_name: visit.patient?.name || "",
    visit_date: visit.visit_date || "",
    slot_time: visit.time_slot?.slot_name || "",
    status: visit.status || "",
  };

  // Send SMS via /api/send-sms
  return sendSmsViaApi({
    phone: visit.executive.phone,
    labId: visit.lab_id,
    templateName: "phlebo_visit",
    templateVars,
  });
}

/**
 * Send a 'PENDING' patient_visit SMS for a quick booking.
 * @param {string} bookingId
 */
export async function sendQuickbookPatientSms(bookingId) {
  // Fetch booking info
  const { data: booking, error } = await supabase
    .from("quickbookings")
    .select(`
      id,
      lab_id,
      patient_name,
      phone,
      date,
      timeslot,
      package_name
    `)
    .eq("id", bookingId)
    .single();

  if (error || !booking) {
    throw new Error("Quick Booking not found for SMS");
  }

  // If lab_id isn't stored, fall back to default
  const labId = booking.lab_id || process.env.DEFAULT_LAB_ID;

  // Match the variables used in patient_visit template
  const templateVars = {
    patient_name: booking.patient_name || "",
    visit_date: booking.date || "",
    slot_time: booking.timeslot || "",
    status: "PENDING",
    whatsapp_number: process.env.SMS_WHATSAPP_NUMBER || "+919849110001",
    phone_number: process.env.SMS_PHONE_NUMBER || "04066004200"
  };

  return sendSmsViaApi({
    phone: booking.phone,
    labId,
    templateName: "patient_visit", // Reuse patient_visit template
    templateVars
  });
}
