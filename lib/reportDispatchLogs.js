import { supabase } from "@/lib/supabaseServer";

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function extractReqidFromUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;

  const patterns = [
    /\/report\/([^/?#]+)/i,
    /\/reports\/([^/?#]+)/i,
    /\/radiologyreport\/([^/?#]+)/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      return decodeURIComponent(String(match[1]).trim());
    }
  }

  return null;
}

function buildFallbackReqid({ reqid, reqno, phone, documentUrl }) {
  const directReqid = normalizeText(reqid);
  if (directReqid) return directReqid;

  const fromUrl = extractReqidFromUrl(documentUrl);
  if (fromUrl) return fromUrl;

  const fromReqno = normalizeText(reqno);
  if (fromReqno) return `REQNO:${fromReqno}`;

  const cleanPhone = String(phone || "").replace(/\D/g, "").slice(-10);
  if (cleanPhone) return `PHONE:${cleanPhone}`;

  return "UNKNOWN";
}

export function extractProviderMessageId(responsePayload) {
  const payload = responsePayload && typeof responsePayload === "object" ? responsePayload : {};
  return normalizeText(
    payload?.messages?.[0]?.id ||
      payload?.message_id ||
      payload?.messageId ||
      payload?.id
  );
}

export async function logReportDispatch(payload = {}) {
  try {
    if (!supabase) return;

    const {
      labId,
      actorUserId = null,
      actorName = null,
      actorRole = null,
      sourcePage = "report_dispatch",
      action = "send_whatsapp",
      targetMode = "single",
      batchId = null,
      reqid = null,
      reqno = null,
      phone = null,
      reportType = "combined",
      headerMode = "default",
      status = "success",
      resultCode = null,
      resultMessage = null,
      providerMessageId = null,
      requestPayload = null,
      responsePayload = null,
      durationMs = null,
      documentUrl = null
    } = payload;

    const row = {
      lab_id: labId,
      actor_user_id: normalizeText(actorUserId),
      actor_name: normalizeText(actorName),
      actor_role: normalizeText(actorRole),
      source_page: normalizeText(sourcePage) || "report_dispatch",
      action: normalizeText(action) || "send_whatsapp",
      target_mode: normalizeText(targetMode) || "single",
      batch_id: normalizeText(batchId),
      reqid: buildFallbackReqid({ reqid, reqno, phone, documentUrl }),
      reqno: normalizeText(reqno),
      phone: normalizeText(phone),
      report_type: normalizeText(reportType) || "combined",
      header_mode: normalizeText(headerMode) || "default",
      status: normalizeText(status) || "success",
      result_code: normalizeText(resultCode),
      result_message: normalizeText(resultMessage),
      provider_message_id: normalizeText(providerMessageId),
      request_payload: requestPayload && typeof requestPayload === "object" ? requestPayload : null,
      response_payload: responsePayload && typeof responsePayload === "object" ? responsePayload : null,
      duration_ms: Number.isFinite(Number(durationMs)) ? Number(durationMs) : null
    };

    const { error } = await supabase.from("report_dispatch_logs").insert(row);
    if (error) {
      console.error("[dispatch-logs] insert failed", error);
    }
  } catch (error) {
    console.error("[dispatch-logs] unexpected log failure", error);
  }
}
