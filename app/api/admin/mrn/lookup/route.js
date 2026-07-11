import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ironOptions } from "@/lib/session";
import { lookupReports, getShivamDemographicsByMrno } from "@/lib/neosoft/client";
import { supabase } from "@/lib/supabaseServer";
import { canUseReportDispatch } from "@/lib/reportDispatchScope";

function normalizeMrno(value) {
  return String(value || "").trim().toUpperCase();
}

function cleanPhone(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const sessionData = await getIronSession(cookieStore, ironOptions);
    const user = sessionData?.user;

    if (!user || !canUseReportDispatch(user)) {
      return new Response("Forbidden", { status: 403 });
    }

    const url = new URL(request.url);
    const mrno = normalizeMrno(url.searchParams.get("mrno"));

    if (!mrno) {
      return NextResponse.json({ error: "mrno is required" }, { status: 400 });
    }

    // Get patient demographics from Shivam
    const demographics = await getShivamDemographicsByMrno(mrno).catch(() => null);
    const patientName = demographics?.patient_name || null;
    const patientPhone = demographics?.mobile_no || null;

    // Look up all requisitions with this MRN from database
    const { data: mrnRequisitions, error: mrnError } = await supabase
      .from("requisitions")
      .select("reqno, reqid, mrno, reqdt, patient_name, mobileno")
      .eq("mrno", mrno)
      .order("reqdt", { ascending: false })
      .limit(100);

    if (mrnError) throw mrnError;

    // If we have a phone, find requisitions with same phone but different/no MRN
    let duplicatePhoneRequisitions = [];
    if (patientPhone) {
      const cleanedPhone = cleanPhone(patientPhone);
      const { data: phoneReqs, error: phoneError } = await supabase
        .from("requisitions")
        .select("reqno, reqid, mrno, reqdt, patient_name, mobileno")
        .eq("mobileno", cleanedPhone)
        .neq("mrno", mrno) // Different MRN
        .order("reqdt", { ascending: false })
        .limit(50);

      if (phoneError) throw phoneError;
      duplicatePhoneRequisitions = phoneReqs || [];
    }

    return NextResponse.json({
      ok: true,
      mrno,
      patient_name: patientName,
      mobile_no: patientPhone,
      requisition_count: (mrnRequisitions || []).length,
      requisitions: (mrnRequisitions || []).map(r => ({
        reqno: r.reqno,
        reqid: r.reqid,
        mrno: r.mrno,
        reqdt: r.reqdt,
        patient_name: r.patient_name,
        phone: r.mobileno,
        test_count: 0
      })),
      duplicate_phone_requisitions: duplicatePhoneRequisitions.map(r => ({
        reqno: r.reqno,
        reqid: r.reqid,
        mrno: r.mrno,
        reqdt: r.reqdt,
        patient_name: r.patient_name,
        phone: r.mobileno
      })),
      duplicate_phone_count: duplicatePhoneRequisitions.length
    }, { status: 200 });

  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to lookup MRN" },
      { status: 500 }
    );
  }
}
