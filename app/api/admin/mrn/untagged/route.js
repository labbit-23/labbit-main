import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
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

    // Find requisitions with this phone but NO MRN (or empty MRN)
    const { data: untaggedReqs, error: queryError } = await supabase
      .from("requisitions")
      .select("reqno, reqid, mrno, reqdt, patient_name, mobileno")
      .eq("mobileno", cleanedPhone)
      .or("mrno.is.null,mrno.eq.''") // No MRN or empty MRN
      .order("reqdt", { ascending: false })
      .limit(100);

    if (queryError) throw queryError;

    // Also find requisitions with this phone to show MRNs already linked
    const { data: allPhoneReqs, error: allError } = await supabase
      .from("requisitions")
      .select("reqno, reqid, mrno, reqdt, patient_name, mobileno")
      .eq("mobileno", cleanedPhone)
      .order("reqdt", { ascending: false })
      .limit(100);

    if (allError) throw allError;

    // Count unique MRNs for this phone
    const uniqueMrns = new Set(
      (allPhoneReqs || [])
        .map(r => r.mrno)
        .filter(m => m && String(m).trim())
    );

    return NextResponse.json({
      ok: true,
      phone,
      cleaned_phone: cleanedPhone,
      untagged_count: (untaggedReqs || []).length,
      untagged_requisitions: (untaggedReqs || []).map(r => ({
        reqno: r.reqno,
        reqid: r.reqid,
        mrno: r.mrno || null,
        reqdt: r.reqdt,
        patient_name: r.patient_name,
        phone: r.mobileno
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
