// File: app/api/webhooks/bonvoice-ivr/route.js
//
// Receives Bonvoice's DTMF-on-hangup webhook (Phase 1 IVR, see
// BONVOICE_IVR_PHASE1_OUTLINE.md). Bonvoice POSTs this once per call, on
// hangup -- not a live conversation, no session/state to manage.
//
// Auth: a dedicated shared-secret token (BONVOICE_WEBHOOK_TOKEN), passed
// as a query param (?token=...) since PBX webhook URL fields universally
// support a query string but not always custom headers. Same "one
// compromised integration should not hand over every other one" posture
// as every other per-integration token in this app (DELIVER_INTERNAL_TOKEN,
// PATIENT_LOOKUP_INTERNAL_TOKEN, etc.) -- this is its own, not reused.
//
// Per the spec's own guiding rule ("Return HTTP 200 to Bonvoice immediately
// in all cases"): this route NEVER returns a non-200 status, including on
// auth failure or an internal error -- Bonvoice has no retry/backoff logic
// to react to a 4xx/5xx, so a stricter status code would only risk PBX-side
// confusion, not add any real protection. Auth failures are logged
// server-side instead.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { phoneLast10 } from "@/lib/phone";
import { lookupReports } from "@/lib/neosoft/client";

async function logCall({ callId, sourceNumber, dtmf, actionTaken, whatsappStatus, payload }) {
  try {
    await supabase.from("ivr_call_log").insert({
      call_id: callId || null,
      source_number: sourceNumber || null,
      dtmf: dtmf || null,
      action_taken: actionTaken,
      whatsapp_status: whatsappStatus || null,
      bonvoice_payload: payload || null,
    });
  } catch (err) {
    console.error("[bonvoice-ivr] failed to write ivr_call_log", err);
  }
}

async function sendReportTemplate({ phone10, patientName, reportSource, mrno, reportLabel }) {
  const base = String(process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  const token = process.env.WHATSAPP_INTERNAL_SEND_TOKEN || "";
  const labId = process.env.DEFAULT_LAB_ID || "";
  if (!base || !token || !labId) {
    throw new Error("Missing PUBLIC_BASE_URL/WHATSAPP_INTERNAL_SEND_TOKEN/DEFAULT_LAB_ID for report send");
  }

  const body = {
    lab_id: labId,
    phone: phone10,
    registered_phone: phone10, // the IVR caller's own number IS the registered number being verified against
    patient_name: patientName,
    report_label: reportLabel,
    report_source: reportSource,
    source_service: "bonvoice_ivr",
    ...(mrno ? { mrno } : {}),
  };

  const res = await fetch(`${base}/api/internal/whatsapp/report-template-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": token },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`report-template-send ${res.status}: ${text.slice(0, 300)}`);
  return "sent";
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    // malformed body -- still 200, still worth logging as best-effort
  }

  const callId = String(body?.callID || "").trim();
  const sourceNumber = String(body?.SourceNumber || "").trim();
  const dtmf = String(body?.DTMF || "").trim();
  const dataSource = String(body?.DataSource || "").trim();

  try {
    const url = new URL(request.url);
    const providedToken = url.searchParams.get("token") || request.headers.get("x-bonvoice-token") || "";
    const expectedToken = process.env.BONVOICE_WEBHOOK_TOKEN || "";
    if (!expectedToken || providedToken !== expectedToken) {
      console.warn("[bonvoice-ivr] rejected: bad or missing token", { callId, sourceNumber });
      await logCall({ callId, sourceNumber, dtmf, actionTaken: "rejected_bad_token", payload: body });
      return NextResponse.json({ ok: true });
    }

    if (dataSource !== "Bonvoice") {
      await logCall({ callId, sourceNumber, dtmf, actionTaken: "ignored_unexpected_source", payload: body });
      return NextResponse.json({ ok: true });
    }

    const phone10 = phoneLast10(sourceNumber);
    let actionTaken = "logged_only";
    let whatsappStatus = null;

    // DTMF paths that need a WhatsApp send. Everything else (WhatsApp "no"
    // branches, direct transfer to CX/Report Dispatch groups) is handled
    // entirely by Bonvoice's own PBX -- this webhook only logs those, it
    // never triggers a transfer itself (that's a Phase 2/WebSocket concept,
    // not this DTMF-only phase).
    if ((dtmf === "1,1" || dtmf === "2,1") && phone10) {
      let latest = null;
      try {
        const reports = await lookupReports(phone10);
        latest = Array.isArray(reports) ? reports[0] : null;
      } catch (lookupErr) {
        console.warn("[bonvoice-ivr] lookupReports failed", lookupErr?.message || lookupErr);
      }
      const patientName = String(latest?.patient_name || "Patient").trim();
      const mrno = String(latest?.mrno || "").trim() || null;

      if (dtmf === "1,1") {
        try {
          whatsappStatus = await sendReportTemplate({
            phone10, patientName, reportSource: "latest_report", reportLabel: "Latest",
          });
          actionTaken = "sent_latest_report";
        } catch (sendErr) {
          console.error("[bonvoice-ivr] latest_report send failed", sendErr?.message || sendErr);
          whatsappStatus = `failed: ${sendErr?.message || sendErr}`;
          actionTaken = "latest_report_send_failed";
        }
      } else if (dtmf === "2,1") {
        if (!mrno) {
          actionTaken = "trend_report_no_mrno";
          whatsappStatus = "skipped: no mrno resolved for this phone";
        } else {
          try {
            whatsappStatus = await sendReportTemplate({
              phone10, patientName, reportSource: "trend_report", mrno, reportLabel: "Trend",
            });
            actionTaken = "sent_trend_report";
          } catch (sendErr) {
            console.error("[bonvoice-ivr] trend_report send failed", sendErr?.message || sendErr);
            whatsappStatus = `failed: ${sendErr?.message || sendErr}`;
            actionTaken = "trend_report_send_failed";
          }
        }
      }
    } else if (dtmf === "3,1") {
      // Schedules -- depends on the not-yet-built sdrc_schedule table
      // (see BONVOICE_IVR_PHASE1_OUTLINE.md Section "Schedule table").
      // Deliberately a no-op until that table + query exist, not a guess.
      actionTaken = "schedule_not_yet_implemented";
    }

    await logCall({ callId, sourceNumber, dtmf, actionTaken, whatsappStatus, payload: body });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[bonvoice-ivr] unhandled error", err);
    await logCall({ callId, sourceNumber, dtmf, actionTaken: "error", whatsappStatus: String(err?.message || err), payload: body });
    return NextResponse.json({ ok: true });
  }
}
