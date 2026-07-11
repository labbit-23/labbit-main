import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ironOptions } from "@/lib/session";
import { lookupReports } from "@/lib/neosoft/client";
import { supabase } from "@/lib/supabaseServer";
import { canUseReportDispatch } from "@/lib/reportDispatchScope";

function normalizeMrno(value) {
  return String(value || "").trim().toUpperCase();
}

function cleanPhone(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const sessionData = await getIronSession(cookieStore, ironOptions);
    const user = sessionData?.user;

    if (!user || !canUseReportDispatch(user)) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    const oldMrno = normalizeMrno(body?.old_mrno);
    const newMrno = body?.new_mrn ? normalizeMrno(body.new_mrn) : null;
    const phone = body?.phone ? cleanPhone(body.phone) : null;

    if (!oldMrno) {
      return NextResponse.json({ error: "old_mrno is required" }, { status: 400 });
    }

    if (!["swap", "retire"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (action === "swap" && !newMrno) {
      return NextResponse.json({ error: "new_mrn is required for swap action" }, { status: 400 });
    }

    if (action === "swap" && oldMrno === newMrno) {
      return NextResponse.json({ error: "old_mrno and new_mrn cannot be the same" }, { status: 400 });
    }

    // Requisitions are in NeoSoft, so we look them up via phone
    // We need the phone number to look up requisitions
    let requisitionsToUpdate = [];

    if (phone) {
      const allReqs = await lookupReports(phone);
      // Find those matching the old MRN
      requisitionsToUpdate = (allReqs || []).filter(r =>
        String(r?.mrno || "").toUpperCase() === oldMrno
      );
    }

    if (!requisitionsToUpdate || requisitionsToUpdate.length === 0) {
      return NextResponse.json({
        ok: true,
        action,
        old_mrno: oldMrno,
        new_mrn: newMrno,
        updated_count: 0,
        message: "No requisitions found with this MRN"
      }, { status: 200 });
    }

    // TODO: IMPORTANT - Need Shivam/NeoSoft API to update MRN in requisitions table
    // The actual update needs to happen in the NeoSoft database
    // This would require a backend endpoint in the NeoSoft/Shivam system to:
    // - UPDATE requisitions SET mrno = new_mrn WHERE mrno = old_mrn

    // Also update Supabase patients table (CREGNO field) if doing swap
    let supabaseUpdateCount = 0;
    if (action === "swap") {
      try {
        // Update all records in patients table where cregno matches old MRN
        const { error: updateError, count } = await supabase
          .from("patients")
          .update({ cregno: newMrno })
          .eq("cregno", oldMrno);

        if (updateError) {
          // Log error but don't fail - NeoSoft update is primary
          console.warn(`Supabase patients update warning: ${updateError.message}`);
        } else {
          supabaseUpdateCount = count || 0;
        }
      } catch (e) {
        console.warn(`Supabase patients update error: ${e.message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      action,
      old_mrno: oldMrno,
      new_mrn: newMrno,
      phone,
      requisition_count: requisitionsToUpdate.length,
      requisitions_found: requisitionsToUpdate.map(r => ({
        reqno: r.reqno,
        reqid: r.reqid,
        current_mrno: r.mrno
      })),
      supabase_patients_updated: supabaseUpdateCount,
      message: action === "swap"
        ? `Found ${requisitionsToUpdate.length} requisition(s) to swap from ${oldMrno} to ${newMrno}. Updated ${supabaseUpdateCount} patient record(s) in Supabase. Requires Shivam API to execute update in NeoSoft requisitions table.`
        : `Found ${requisitionsToUpdate.length} requisition(s) to retire with ${oldMrno}. Requires Shivam API to execute actual update.`,
      status: "ready_for_approval",
      next_step: "Call Shivam/NeoSoft API to update MRN in requisitions table"
    }, { status: 200 });

  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to execute MRN action" },
      { status: 500 }
    );
  }
}
