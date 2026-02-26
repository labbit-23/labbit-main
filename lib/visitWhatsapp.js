// File: /lib/visitWhatsapp.js

import { supabase } from "@/lib/supabaseServer";

async function sendWhatsapp(payload) {
  const apiBase = process.env.NEXT_PUBLIC_BASE_URL || "";

  const res = await fetch(`${apiBase}/api/whatsapp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp send failed: ${text}`);
  }

  return await res.json();
}

export async function sendPatientVisitWhatsapp(visitId) {
  const { data: visit, error } = await supabase
    .from("visits")
    .select(`
      id,
      lab_id,
      visit_date,
      status,
      patient:patient_id (name, phone),
      executive:executive_id (name, phone),
      time_slot:time_slot (slot_name)
    `)
    .eq("id", visitId)
    .single();

  if (error || !visit) throw new Error("Visit not found");

  const phone = visit.patient?.phone;
  if (!phone) return;

  // Format phone to 91XXXXXXXXXX
  const formattedPhone = phone.startsWith("91")
    ? phone
    : `91${phone.replace(/^0/, "")}`;

  // If unassigned → lab contact
  const contactName = visit.executive?.name || "SDRC Lab";
  const contactPhone = visit.executive?.phone || "9849110001";

  const templateParams = [
    visit.patient?.name || "",
    visit.status || "",
    visit.visit_date || "",
    visit.time_slot?.slot_name || "",
    contactName,
    contactPhone
  ];

  return sendWhatsapp({
    destination: formattedPhone,
    userName: visit.patient?.name || "",
    templateParams
  });
}