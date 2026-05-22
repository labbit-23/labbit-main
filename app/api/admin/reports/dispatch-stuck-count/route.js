import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { canUseReportDispatch } from "@/lib/reportDispatchScope";
import { hasPermission } from "@/lib/uac/policy";

const JOBS_TABLE = "report_auto_dispatch_jobs";

function normalizeLabIds(user) {
  const ids = Array.isArray(user?.labIds) ? user.labIds : [];
  return ids.map((id) => String(id || "").trim()).filter(Boolean);
}

function applyLabScope(query, labIds) {
  if (!labIds?.length) return query;
  if (labIds.length === 1) return query.eq("lab_id", labIds[0]);
  return query.in("lab_id", labIds);
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession(cookieStore, ironOptions);
    const user = session?.user;
    if (!user || !canUseReportDispatch(user)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const canView =
      hasPermission(user, "reports.auto_dispatch.view", { labId: normalizeLabIds(user)[0] || null }) ||
      hasPermission(user, "reports.dispatch", { labId: normalizeLabIds(user)[0] || null });
    if (!canView) return new Response("Forbidden", { status: 403 });

    const labIds = normalizeLabIds(user);
    if (!labIds.length) return NextResponse.json({ stuck_count: 0 });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Count distinct requisitions with recent failures — not raw job count
    let query = supabase
      .from(JOBS_TABLE)
      .select("reqno", { count: "exact", head: false })
      .eq("status", "failed")
      .gte("updated_at", sevenDaysAgo);

    query = applyLabScope(query, labIds);

    const { data, error } = await query;
    if (error) throw error;

    const uniqueReqnos = new Set((data || []).map((r) => r.reqno).filter(Boolean));
    return NextResponse.json({ stuck_count: uniqueReqnos.size });
  } catch (err) {
    console.error("[dispatch-stuck-count]", err);
    return NextResponse.json({ stuck_count: 0 });
  }
}
