import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { toCanonicalIndiaPhone } from "@/lib/phone";
import { sendTextMessage } from "@/lib/whatsapp/sender";

// Generic "flag this for a human" free-text notify to the lab's internal
// WhatsApp number. Same phone-resolution shape as quickbook's own
// sendInternalBookingRequestNotify() (app/api/quickbook/route.js) --
// pulled out as its own internal route (not a shared lib function,
// consistent with how /api/internal/whatsapp/send is already its own
// route rather than a shared helper) so OTHER internal callers can reuse
// it without duplicating the labs_apis/labs lookup a second time. First
// caller: labit-core's patient app, for "request a printed copy of this
// archived finding" -- a stopgap so staff can act on the request manually
// instead of this app generating a PDF itself (2026-09-12, user: "keep
// that as a request path... free flowing text how we do in labit-main").
function getAuthToken(request) {
  return (
    request.headers.get("x-ingest-token") ||
    request.headers.get("x-internal-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
}

function parseTemplates(templates) {
  if (!templates) return {};
  if (typeof templates === "string") {
    try {
      return JSON.parse(templates);
    } catch {
      return {};
    }
  }
  return typeof templates === "object" ? templates : {};
}

function resolveInternalNotifyPhone({ templates = {}, lab = null }) {
  const botFlow = templates?.bot_flow || {};
  const candidate =
    botFlow?.report_notify_number ||
    templates?.report_notify_number ||
    lab?.internal_whatsapp_number ||
    "";
  return toCanonicalIndiaPhone(candidate) || String(candidate || "").replace(/\D/g, "") || null;
}

export async function POST(request) {
  try {
    const expectedToken =
      process.env.WHATSAPP_INTERNAL_SEND_TOKEN ||
      process.env.WHATSAPP_EXTERNAL_INGEST_TOKEN ||
      "";
    const providedToken = getAuthToken(request);

    if (!expectedToken || providedToken !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const labId = String(body?.lab_id || process.env.DEFAULT_LAB_ID || "").trim();
    const text = String(body?.text || "").trim();
    const sourceService = String(body?.source_service || "internal-service").trim();

    if (!labId || !text) {
      return NextResponse.json({ error: "Missing lab_id or text" }, { status: 400 });
    }

    const [{ data: apiRow }, { data: labRow }] = await Promise.all([
      supabase
        .from("labs_apis")
        .select("templates")
        .eq("lab_id", labId)
        .eq("api_name", "whatsapp_outbound")
        .maybeSingle(),
      supabase
        .from("labs")
        .select("name,internal_whatsapp_number")
        .eq("id", labId)
        .maybeSingle()
    ]);

    const templates = parseTemplates(apiRow?.templates);
    const notifyPhone = resolveInternalNotifyPhone({ templates, lab: labRow || null });
    if (!notifyPhone) {
      return NextResponse.json(
        { error: "No internal notify number configured for this lab (bot_flow.report_notify_number / labs.internal_whatsapp_number)" },
        { status: 422 }
      );
    }

    const sendResult = await sendTextMessage({
      labId,
      phone: notifyPhone,
      text,
      sender: { id: null, name: sourceService || "System", role: "system", userType: "service" }
    });

    return NextResponse.json(
      { success: true, ok: true, notified_phone: notifyPhone, provider_response: sendResult },
      { status: 200 }
    );
  } catch (err) {
    console.error("[internal/whatsapp/staff-notify] error", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
