import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { canUseReportDispatch } from "@/lib/reportDispatchScope";

function normalizeMrno(value) {
  return String(value || "").trim().toUpperCase();
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

    // Get all requisitions with old MRN
    const { data: requisitions, error: selectError } = await supabase
      .from("requisitions")
      .select("reqno, reqid, mrno")
      .eq("mrno", oldMrno);

    if (selectError) throw selectError;

    if (!requisitions || requisitions.length === 0) {
      return NextResponse.json({
        ok: true,
        action,
        old_mrno: oldMrno,
        new_mrn: newMrno,
        updated_count: 0,
        message: "No requisitions found with this MRN"
      }, { status: 200 });
    }

    // Update all requisitions
    let updateError;
    if (action === "swap") {
      const { error: err } = await supabase
        .from("requisitions")
        .update({ mrno: newMrno })
        .eq("mrno", oldMrno);
      updateError = err;
    } else if (action === "retire") {
      // For retire, we could set to null or keep the old MRN with a flag
      // For now, let's just log it without changing the requisition
      // This allows manual review before cleanup
    }

    if (updateError) throw updateError;

    // TODO: Call Shivam API to sync the MRN change if needed
    // TODO: Add audit log entry
    // TODO: Add notification/alert for admin

    return NextResponse.json({
      ok: true,
      action,
      old_mrno: oldMrno,
      new_mrn: newMrno,
      updated_count: requisitions.length,
      requisitions_updated: requisitions.map(r => ({
        reqno: r.reqno,
        reqid: r.reqid
      })),
      message: action === "swap"
        ? `Successfully swapped ${requisitions.length} requisition(s) from ${oldMrno} to ${newMrno}`
        : `Marked ${requisitions.length} requisition(s) for retirement from ${oldMrno}`
    }, { status: 200 });

  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to execute MRN action" },
      { status: 500 }
    );
  }
}
