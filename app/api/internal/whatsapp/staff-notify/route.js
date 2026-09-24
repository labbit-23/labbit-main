import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { toCanonicalIndiaPhone } from "@/lib/phone";
import { sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp/sender";

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
    const templateName = String(body?.template_name || body?.templateName || "").trim();
    const templateParams = Array.isArray(body?.template_params)
      ? body.template_params
      : Array.isArray(body?.templateParams)
        ? body.templateParams
        : [];
    const languageCode = String(body?.language_code || body?.languageCode || "en").trim();
    const sourceService = String(body?.source_service || "internal-service").trim();

    if (!labId || (!text && !templateName)) {
      return NextResponse.json({ error: "Missing lab_id and (text or template_name)" }, { status: 400 });
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

    const sender = { id: null, name: sourceService || "System", role: "system", userType: "service" };

    // A template send is required here whenever the internal number hasn't
    // messaged the bot in the last 24h (the common case for an unattended
    // infra alert firing at 3am) -- free text outside that session window is
    // silently rejected by the Cloud API. Callers that know they're inside
    // an active session (e.g. labit-core's "request a printed copy" reply
    // flow, the first caller here) can still pass plain `text`.
    const sendResult = templateName
      ? await sendTemplateMessage({
          labId,
          phone: notifyPhone,
          templateName,
          languageCode,
          templateParams,
          sender
        })
      : await sendTextMessage({
          labId,
          phone: notifyPhone,
          text,
          sender
        });

    return NextResponse.json(
      { success: true, ok: true, notified_phone: notifyPhone, kind: templateName ? "template" : "text", provider_response: sendResult },
      { status: 200 }
    );
  } catch (err) {
    console.error("[internal/whatsapp/staff-notify] error", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
