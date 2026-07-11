import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ironOptions } from "@/lib/session";
import { lookupReports, getShivamDemographicsByMrno } from "@/lib/neosoft/client";
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

    // Get patient demographics from Shivam via NeoSoft API
    let demographics = null;
    try {
      demographics = await getShivamDemographicsByMrno(mrno);
    } catch (e) {
      // Continue - demographics may not exist in Shivam
    }

    const patientName = demographics?.patient_name || null;
    const patientPhone = demographics?.mobile_no || null;

    // Requisitions with this MRN must be looked up via NeoSoft
    // Since we don't have a direct MRN lookup in NeoSoft, we use phone lookup if available
    let mrnRequisitions = [];
    let duplicatePhoneRequisitions = [];

    if (patientPhone) {
      const cleanedPhone = cleanPhone(patientPhone);
      // Look up all requisitions for this phone via NeoSoft
      const allPhoneReqs = await lookupReports(cleanedPhone);

      // Filter to only ones matching this MRN
      mrnRequisitions = (allPhoneReqs || []).filter(r =>
        String(r?.mrno || "").toUpperCase() === mrno
      );

      // Find duplicates: same phone, different MRN
      duplicatePhoneRequisitions = (allPhoneReqs || []).filter(r =>
        String(r?.mrno || "").toUpperCase() !== mrno
      );
    }

    return NextResponse.json({
      ok: true,
      mrno,
      patient_name: patientName,
      mobile_no: patientPhone,
      requisition_count: mrnRequisitions.length,
      requisitions: mrnRequisitions.map(r => ({
        reqno: r.reqno,
        reqid: r.reqid,
        mrno: r.mrno,
        reqdt: r.reqdt,
        patient_name: r.patient_name,
        phone: patientPhone,
        test_count: 0
      })),
      duplicate_phone_requisitions: duplicatePhoneRequisitions.map(r => ({
        reqno: r.reqno,
        reqid: r.reqid,
        mrno: r.mrno,
        reqdt: r.reqdt,
        patient_name: r.patient_name,
        phone: r.phone || patientPhone
      })),
      duplicate_phone_count: duplicatePhoneRequisitions.length,
      note: patientPhone ? `Found ${mrnRequisitions.length} requisitions with MRN ${mrno} and ${duplicatePhoneRequisitions.length} with same phone but different MRN` : "No phone found in Shivam for this MRN"
    }, { status: 200 });

  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to lookup MRN" },
      { status: 500 }
    );
  }
}
