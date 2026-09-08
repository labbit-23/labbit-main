import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { canUseReportDispatch } from "@/lib/reportDispatchScope";
import {
  buildDeliveryIndex,
  resolveDelivery,
  phoneLast10
} from "@/lib/whatsappDeliveryStatus";

const SOURCE_PAGE = "patient_message_jobs";

function istDayRange(dateStr) {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const base = m ? new Date(`${dateStr}T00:00:00+05:30`) : new Date(Date.now() + 5.5 * 3600 * 1000);
  const y = base.getUTCFullYear();
  const mo = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  const startIso = new Date(`${y}-${mo}-${d}T00:00:00+05:30`).toISOString();
  const endIso = new Date(new Date(startIso).getTime() + 24 * 3600 * 1000).toISOString();
  return { startIso, endIso, ymd: `${y}-${mo}-${d}` };
}

function parseTemplates(t) {
  if (!t) return {};
  if (typeof t === "string") { try { return JSON.parse(t); } catch { return {}; } }
  return typeof t === "object" ? t : {};
}

export async function GET(request) {
  try {
    const session = await getIronSession(await cookies(), ironOptions);
    if (!session?.user || !canUseReportDispatch(session.user)) {
      return new Response("Forbidden", { status: 403 });
    }

    const url = new URL(request.url);
    const labId = String(url.searchParams.get("lab_id") || process.env.DEFAULT_LAB_ID || "").trim();
    const { startIso, endIso, ymd } = istDayRange(url.searchParams.get("date"));

    // configured jobs (labs_apis.templates.patient_message_jobs)
    const { data: waCfg } = await supabase
      .from("labs_apis")
      .select("templates")
      .eq("lab_id", labId)
      .eq("api_name", "whatsapp_outbound")
      .maybeSingle();
    const jobs = (parseTemplates(waCfg?.templates)?.patient_message_jobs || []).map((j) => ({
      key: String(j?.key || "").trim(),
      template: j?.template?.name || null,
      attachment: j?.attachment?.kind || null,
      recipient: j?.recipient || "patient",
      trial: j?.trial || null
    }));

    // the day's send/fail rows
    let logQ = supabase
      .from("report_dispatch_logs")
      .select("reqid,reqno,phone,report_type,status,result_code,result_message,provider_message_id,request_payload,created_at")
      .eq("source_page", SOURCE_PAGE)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(3000);
    if (labId) logQ = logQ.eq("lab_id", labId);
    const { data: logs, error: logErr } = await logQ;
    if (logErr) throw logErr;
    const rows = Array.isArray(logs) ? logs : [];

    // status callbacks for correlation (id + phone, 7-day window)
    let statusRows = [];
    if (rows.length > 0) {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const phones = [...new Set(rows.map((r) => `91${phoneLast10(r.phone)}`).filter((p) => p.length === 12))];
      const { data: st } = await supabase
        .from("whatsapp_messages")
        .select("message_id,phone,payload,created_at")
        .eq("direction", "status")
        .gte("created_at", since)
        .in("phone", phones.slice(0, 400))
        .order("created_at", { ascending: false })
        .limit(5000);
      statusRows = Array.isArray(st) ? st : [];
    }
    const idx = buildDeliveryIndex(statusRows);

    const byKey = new Map();
    for (const j of jobs) {
      byKey.set(j.key, {
        ...j,
        sent: 0, delivered: 0, read: 0, failed: 0, no_callback: 0,
        recent: []
      });
    }
    for (const r of rows) {
      const k = String(r.report_type || "").trim();
      if (!byKey.has(k)) byKey.set(k, { key: k, template: null, sent: 0, delivered: 0, read: 0, failed: 0, no_callback: 0, recent: [] });
      const g = byKey.get(k);
      const failed = String(r.status || "").toLowerCase() === "failed";
      const ds = failed ? null : resolveDelivery(
        { providerMessageId: r.provider_message_id, phone: r.phone, sentAt: r.created_at },
        idx
      );
      if (failed) g.failed += 1;
      else {
        g.sent += 1;
        if (ds === "read") g.read += 1;
        else if (ds === "delivered") g.delivered += 1;
        else g.no_callback += 1;
      }
      if (g.recent.length < 60) {
        g.recent.push({
          reqno: r.reqno, phone: phoneLast10(r.phone),
          at: r.created_at, status: failed ? "failed" : (ds || "sent"),
          result_code: r.result_code,
          result_message: failed ? r.result_message : null,
          params: r.request_payload?.params || null,
          attachment: r.request_payload?.attachment || null
        });
      }
    }

    return NextResponse.json({
      date: ymd,
      jobs: [...byKey.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)))
    });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}
