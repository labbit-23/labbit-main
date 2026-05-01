import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { phoneVariantsIndia, toCanonicalIndiaPhone } from "@/lib/phone";
import {
  sendDocumentMessage,
  sendTemplateMessage,
  sendTextMessage
} from "@/lib/whatsapp/sender";
import { extractProviderMessageId, logReportDispatch } from "@/lib/reportDispatchLogs";

function buildSender(sourceService) {
  const name = String(sourceService || "System").trim();
  return {
    id: null,
    name: name || "System",
    role: "system",
    userType: "service",
    source_service: name || "system"
  };
}

function normalizeKind(input = {}) {
  const explicit = String(input?.message_type || input?.kind || input?.type || "").trim().toLowerCase();
  if (explicit) {
    if (explicit === "text") return "text";
    if (explicit === "template") return "template";
    if (explicit === "document" || explicit === "media" || explicit === "file" || explicit === "image") return "document";
  }

  const hasMediaUrl = Boolean(String(input?.document_url || input?.media_url || input?.url || "").trim());
  if (hasMediaUrl) return "document";

  const hasTemplateSignal = Boolean(
    String(input?.template_name || input?.templateName || input?.campaignName || "").trim()
  ) || Array.isArray(input?.template_params) || Array.isArray(input?.templateParams);
  if (hasTemplateSignal) return "template";

  return "text";
}

function inferReportReqidFromUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  const match = raw.match(/\/(?:report|reports|radiologyreport)\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(String(match[1]).trim()) : null;
}

function isReportLikeDocumentUrl(url) {
  const raw = String(url || "").toLowerCase();
  return (
    raw.includes("/report/") ||
    raw.includes("/reports/") ||
    raw.includes("/radiologyreport/") ||
    raw.includes("/latest-report/")
  );
}

function getAuthToken(request) {
  return (
    request.headers.get("x-ingest-token") ||
    request.headers.get("x-internal-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
}

async function resolveChatSession({ labId, phone }) {
  const candidates = phoneVariantsIndia(phone);
  const { data: rows } = await supabase
    .from("chat_sessions")
    .select("id, lab_id, phone, patient_name, unread_count, last_user_message_at")
    .eq("lab_id", labId)
    .in("phone", candidates)
    .order("last_message_at", { ascending: false })
    .limit(1);

  if (rows?.[0]) return rows[0];

  const canonicalPhone = toCanonicalIndiaPhone(phone) || phone;
  const { data: created, error } = await supabase
    .from("chat_sessions")
    .insert({
      lab_id: labId,
      phone: canonicalPhone,
      patient_name: null,
      status: "active",
      current_state: "HUMAN_HANDOVER",
      unread_count: 0,
      last_message_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    })
    .select("id, lab_id, phone, patient_name, unread_count, last_user_message_at")
    .single();

  if (error) throw error;
  return created;
}

async function touchSession(sessionId) {
  await supabase
    .from("chat_sessions")
    .update({
      unread_count: 0,
      last_message_at: new Date(),
      updated_at: new Date()
    })
    .eq("id", sessionId);
}

async function resolveDefaultTemplateName(labId) {
  const { data, error } = await supabase
    .from("labs_apis")
    .select("templates, default_campaign")
    .eq("lab_id", labId)
    .eq("api_name", "whatsapp_outbound")
    .maybeSingle();

  if (error) throw error;

  const templates = data?.templates && typeof data.templates === "object" ? data.templates : {};
  return (
    String(templates?.default_campaign || "").trim() ||
    String(data?.default_campaign || "").trim() ||
    ""
  );
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
    const phone = String(body?.phone || body?.destination || body?.to || "").trim();
    const kind = normalizeKind(body);
    const sourceService = String(body?.source_service || body?.source || "internal-service").trim();

    if (!labId || !phone) {
      return NextResponse.json({ error: "Missing lab_id or phone" }, { status: 400 });
    }

    const session = await resolveChatSession({ labId, phone });
    const sender = buildSender(sourceService);

    if (kind === "text") {
      const text = String(body?.text || body?.message || "").trim();
      if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 });

      await sendTextMessage({
        labId: session.lab_id,
        phone: session.phone,
        text,
        sender
      });
      await touchSession(session.id);
      return NextResponse.json({ success: true, ok: true, kind: "text" }, { status: 200 });
    }

    if (kind === "document") {
      const documentUrl = String(body?.document_url || body?.media_url || body?.url || "").trim();
      if (!documentUrl) {
        return NextResponse.json({ error: "Missing document_url/media_url/url" }, { status: 400 });
      }
      const reportLikeDispatch = isReportLikeDocumentUrl(documentUrl);
      const dispatchStartedAt = Date.now();

      try {
        const sendResult = await sendDocumentMessage({
          labId: session.lab_id,
          phone: session.phone,
          documentUrl,
          filename: String(body?.filename || "document.pdf"),
          caption: String(body?.caption || ""),
          sender
        });

        if (reportLikeDispatch) {
          const readyLabTestKeys = Array.isArray(body?.ready_lab_test_keys) ? body.ready_lab_test_keys : [];
          await logReportDispatch({
            labId: session.lab_id,
            actorName: sourceService,
            actorRole: sourceService.toLowerCase().includes("bot") ? "bot" : "system",
            sourcePage: "report_dispatch",
            action: "send_whatsapp",
            targetMode: "single",
            reqid: inferReportReqidFromUrl(documentUrl),
            reqno: String(body?.reqno || "").trim() || null,
            phone: session.phone,
            reportType: "combined",
            headerMode: "default",
            status: "success",
            resultCode: "INTERNAL_SEND_OK",
            resultMessage: "Report sent via internal whatsapp endpoint",
            providerMessageId: extractProviderMessageId(sendResult),
            requestPayload: {
              source_service: sourceService,
              document_url: documentUrl,
              ready_lab_test_keys: readyLabTestKeys
            },
            responsePayload: sendResult,
            durationMs: Date.now() - dispatchStartedAt,
            documentUrl
          });
        }
      } catch (sendError) {
        if (reportLikeDispatch) {
          const readyLabTestKeys = Array.isArray(body?.ready_lab_test_keys) ? body.ready_lab_test_keys : [];
          await logReportDispatch({
            labId: session.lab_id,
            actorName: sourceService,
            actorRole: sourceService.toLowerCase().includes("bot") ? "bot" : "system",
            sourcePage: "report_dispatch",
            action: "send_whatsapp",
            targetMode: "single",
            reqid: inferReportReqidFromUrl(documentUrl),
            reqno: String(body?.reqno || "").trim() || null,
            phone: session.phone,
            reportType: "combined",
            headerMode: "default",
            status: "failed",
            resultCode: "INTERNAL_SEND_FAILED",
            resultMessage: sendError?.message || "Unknown send error",
            requestPayload: {
              source_service: sourceService,
              document_url: documentUrl,
              ready_lab_test_keys: readyLabTestKeys
            },
            durationMs: Date.now() - dispatchStartedAt,
            documentUrl
          });
        }
        throw sendError;
      }

      await touchSession(session.id);
      return NextResponse.json({ success: true, ok: true, kind: "document" }, { status: 200 });
    }

    const templateParams = Array.isArray(body?.template_params)
      ? body.template_params
      : Array.isArray(body?.templateParams)
        ? body.templateParams
        : [];
    const templateName =
      String(body?.template_name || body?.templateName || body?.campaign_name || body?.campaignName || "").trim() ||
      (await resolveDefaultTemplateName(session.lab_id));

    if (!templateName) {
      return NextResponse.json({ error: "Missing template_name and no default_campaign found" }, { status: 400 });
    }

    const templateResult = await sendTemplateMessage({
      labId: session.lab_id,
      phone: session.phone,
      templateName,
      languageCode: String(body?.language_code || "en"),
      templateParams,
      sender
    });
    await touchSession(session.id);

    return NextResponse.json(
      {
        success: true,
        ok: true,
        kind: "template",
        template_name: templateName,
        provider_message_id: extractProviderMessageId(templateResult),
        provider_response: templateResult
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[internal/whatsapp/send] error", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
