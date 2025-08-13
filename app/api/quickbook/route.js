// =============================================
// File: app/api/quickbook/route.js
// =============================================
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

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
      agree,
    } = body;

    if (!patientName || !phone || !date || !timeslot || !agree) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

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
          agree,
        },
      ])
      .select();

    if (error) {
      console.error("[Supabase Insert Error]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Optionally trigger WhatsApp message here if whatsapp = true
    // e.g., call /api/whatsapp/send

    return NextResponse.json({ success: true, booking: data[0] }, { status: 200 });
  } catch (err) {
    console.error("[QuickBook POST Error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
