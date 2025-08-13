// =============================================
// File: app/api/quickbook/route.js
// =============================================
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { sendQuickbookPatientSms } from "@/lib/visitSms";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      patientName,
      phone,
      packageName,
      area,
      date,
      timeslot,
      persons,
      whatsapp,
      agree
    } = body;

    if (!patientName || !phone || !date || !timeslot || !agree) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 1️⃣ Insert booking into quickbookings table
    const { data, error } = await supabase
      .from("quickbookings")
      .insert([
        {
          patient_name: patientName,
          phone,
          package_name: packageName,
          area,
          date,
          timeslot,
          persons,
          whatsapp,
          agree
        }
      ])
      .select();

    if (error) {
      console.error("[Supabase Insert Error]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const booking = data[0];

    // 2️⃣ Send patient_visit SMS with status = PENDING
    try {
      await sendQuickbookPatientSms(booking.id);
      console.log("Quick Book PENDING SMS sent to patient:", booking.phone);
    } catch (smsErr) {
      console.error("Failed to send Quick Book SMS:", smsErr);
    }

    return NextResponse.json({ success: true, booking }, { status: 200 });

  } catch (err) {
    console.error("[QuickBook POST Error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
