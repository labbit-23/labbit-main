import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const MANAGEMENT_ROLES = new Set(["director", "director_ceo"]);

function canAccessManagement(user) {
  const role = String(user?.roleKey || user?.executiveType || user?.userType || "").toLowerCase();
  return user?.userType === "executive" && MANAGEMENT_ROLES.has(role);
}

function istDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const today = parts.year + "-" + parts.month + "-" + parts.day;
  return { today, monthStart: parts.year + "-" + parts.month + "-01" };
}

function summarize(rows, predicate = () => true) {
  const selected = rows.filter(predicate);
  return {
    total: selected.length,
    completed: selected.filter((row) => String(row.status || "").toLowerCase() === "completed").length,
    pending: selected.filter((row) => String(row.status || "").toLowerCase() === "pending").length,
    assigned: selected.filter((row) => row.executive_id).length,
    unassigned: selected.filter((row) => !row.executive_id).length,
  };
}

export async function GET(req) {
  const res = NextResponse.next();
  const session = await getIronSession(req, res, ironOptions);
  const user = session?.user || null;

  if (!canAccessManagement(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const requestedLabId = String(url.searchParams.get("lab_id") || "").trim();
  const assignedLabIds = Array.isArray(user?.labIds) ? user.labIds.filter(Boolean).map(String) : [];
  const productMode = assignedLabIds.length === 0;

  if (!productMode && requestedLabId && !assignedLabIds.includes(requestedLabId)) {
    return NextResponse.json({ error: "Forbidden for selected lab" }, { status: 403 });
  }

  const labId = requestedLabId || assignedLabIds[0] || null;
  const { today, monthStart } = istDateParts();

  let query = supabase
    .from("visits")
    .select("id,status,visit_date,executive_id,executive:executive_id(id,name)")
    .gte("visit_date", monthStart)
    .lte("visit_date", today)
    .not("status", "eq", "disabled")
    .order("visit_date", { ascending: false })
    .limit(10000);

  if (labId) query = query.eq("lab_id", labId);

  const { data, error } = await query;
  if (error) {
    console.error("[management/visits] fetch error", error);
    return NextResponse.json({ error: "Failed to load visit metrics" }, { status: 500 });
  }

  const rows = Array.isArray(data) ? data : [];
  const byExecutiveMap = new Map();

  for (const row of rows) {
    const id = row.executive_id || "unassigned";
    const current = byExecutiveMap.get(id) || {
      executive_id: row.executive_id || null,
      name: row.executive?.name || "Unassigned",
      total: 0,
      completed: 0,
      pending: 0,
    };
    current.total += 1;
    if (String(row.status || "").toLowerCase() === "completed") current.completed += 1;
    if (String(row.status || "").toLowerCase() === "pending") current.pending += 1;
    byExecutiveMap.set(id, current);
  }

  const byExecutive = Array.from(byExecutiveMap.values()).sort((a, b) => b.total - a.total);

  return NextResponse.json({
    lab_id: labId,
    today_date: today,
    month_start: monthStart,
    today: summarize(rows, (row) => row.visit_date === today),
    mtd: summarize(rows),
    byExecutive,
  });
}
