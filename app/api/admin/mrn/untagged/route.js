import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ironOptions } from "@/lib/session";
import { lookupReports } from "@/lib/neosoft/client";
import { canUseReportDispatch } from "@/lib/reportDispatchScope";

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
    const phone = String(url.searchParams.get("phone") || "").trim();

    if (!phone) {
      return NextResponse.json({ error: "phone is required" }, { status: 400 });
    }

    const cleanedPhone = cleanPhone(phone);
    if (!cleanedPhone || cleanedPhone.length < 10) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }

    // Look up all requisitions with this phone via NeoSoft
    const allPhoneReqs = await lookupReports(cleanedPhone);

    // Find untagged: those with no MRN or empty MRN
    const untaggedReqs = (allPhoneReqs || []).filter(r =>
      !r.mrno || String(r.mrno || "").trim() === ""
    );

    // Collect unique MRNs that ARE tagged
    const uniqueMrns = new Set(
      (allPhoneReqs || [])
        .map(r => r.mrno)
        .filter(m => m && String(m).trim())
    );

    return NextResponse.json({
      ok: true,
      phone,
      cleaned_phone: cleanedPhone,
      untagged_count: untaggedReqs.length,
      untagged_requisitions: untaggedReqs.map(r => ({
        reqno: r.reqno,
        reqid: r.reqid,
        mrno: r.mrno || null,
        reqdt: r.reqdt,
        patient_name: r.patient_name,
        phone: r.phone || cleanedPhone
      })),
      linked_mrns: Array.from(uniqueMrns),
      total_requisitions_for_phone: (allPhoneReqs || []).length
    }, { status: 200 });

  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to find untagged requisitions" },
      { status: 500 }
    );
  }
}
