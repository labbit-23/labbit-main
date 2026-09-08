import { supabase } from "@/lib/supabaseServer";

const JOBS_TABLE = "report_auto_dispatch_jobs";
const DISPATCH_LOGS_TABLE = "report_dispatch_logs";
const STATUS_WINDOW_DAYS = 14;

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function phoneLast10(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function extractProviderMessageId(job) {
  const payload = parseMaybeJson(job?.provider_response);
  return String(
    payload?.provider_message_id ||
      payload?.provider_response?.messages?.[0]?.id ||
      payload?.messages?.[0]?.id ||
      ""
  ).trim() || null;
}

function deliveryRank(status) {
  const key = String(status || "").toLowerCase();
  if (key === "failed") return 0;
  if (key === "sent") return 1;
  if (key === "delivered") return 2;
  if (key === "read") return 3;
  return -1;
}

// Same-status-row-set semantics as auto-dispatch-logs/route.js's statusRows lookup
// (direction="status", message_id-keyed) -- kept as one shared implementation so the
// two callers can't quietly drift into different answers for the same message.
export async function fetchDeliveryStatusByMessageId(providerIds) {
  const byMessageId = new Map();
  if (!providerIds.length) return byMessageId;

  const sinceIso = new Date(Date.now() - STATUS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // Chunked: a GET .in() filter embeds the list straight into the URL, and
  // Supabase's proxy 502s past ~130 values (confirmed live 2026-09-04) --
  // per-reqno this list is normally tiny, but chunk anyway rather than trust
  // that forever.
  const CHUNK_SIZE = 60;
  const rows = [];
  for (let i = 0; i < providerIds.length; i += CHUNK_SIZE) {
    const chunk = providerIds.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("message_id,payload,created_at")
      .eq("direction", "status")
      .gte("created_at", sinceIso)
      .in("message_id", chunk)
      .order("created_at", { ascending: true })
      .limit(5000);
    if (error) continue;
    if (Array.isArray(data)) rows.push(...data);
  }

  for (const row of rows) {
    const payload = parseMaybeJson(row?.payload) || {};
    const statusKey = String(
      payload?.status || payload?.raw_status?.status || payload?.statuses?.[0]?.status || ""
    ).trim().toLowerCase();
    if (!statusKey) continue;
    const messageId = String(row?.message_id || "").trim();
    if (!messageId) continue;
    const prev = byMessageId.get(messageId);
    if (!prev || deliveryRank(statusKey) >= deliveryRank(prev.status)) {
      byMessageId.set(messageId, { status: statusKey, at: row?.created_at || null });
    }
  }
  return byMessageId;
}

// A row whose `message` is one of these means the bot actually transmitted a file,
// not just a status-text reply ("Lab reports are not ready yet." must NOT count --
// surveyed live message labels 2026-09-04 to build this allowlist; do not loosen to
// a substring match on "report", which also matches negative/pending status text).
function isDocumentDeliveredMessage(message) {
  const text = String(message || "");
  return text === "reports_pdf" || text.startsWith("Document sent:");
}

// Bot pickup is a heuristic, not a delivery guarantee: an inbound message from the
// patient followed by the bot actually sending a document in reply. Callers should
// treat it as a soft signal, distinct from the hard delivered/read WhatsApp status --
// and note it is phone-wide, not reqno-scoped (whatsapp_messages carries no reqno),
// so a multi-requisition patient's pickup event may belong to a different reqno than
// the one being queried.
async function fetchBotPickupEvents(phoneVariants) {
  if (!phoneVariants.length) return [];
  const sinceIso = new Date(Date.now() - STATUS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("direction,message,created_at")
    .in("phone", phoneVariants)
    .neq("direction", "status")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(500);

  const rows = data || [];
  const events = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.direction !== "inbound") continue;
    const next = rows[i + 1];
    if (!next || next.direction !== "outbound") continue;
    if (!isDocumentDeliveredMessage(next.message)) continue;
    events.push({
      requested_at: row.created_at,
      requested_message: row.message,
      replied_at: next.created_at,
      replied_message: next.message
    });
  }
  return events;
}

/**
 * Aggregates everything labit-main knows about whether/how a report reached a
 * patient (or a staff member) for one reqno -- auto WhatsApp dispatch (with
 * per-test breakdown from the job's own send-time snapshot), WhatsApp delivery/
 * read receipts, a heuristic bot-pickup signal, and staff manual actions from
 * the Report Dispatch UI. Read-only; callers use `summary.locked_from_unapprove`
 * as the single field to gate an unapprove action on, everything else is detail.
 */
export async function getDeliveryStatusForReqno(reqno, { testid } = {}) {
  const cleanReqno = String(reqno || "").trim();
  if (!cleanReqno) {
    return { reqno: cleanReqno, auto_dispatch: [], bot_pickup: { picked_up: false, events: [] }, staff_actions: [], summary: emptySummary() };
  }

  const { data: jobs } = await supabase
    .from(JOBS_TABLE)
    .select("id,reqno,phone,status,report_label,sent_at,provider_response,last_status_snapshot,created_at,updated_at")
    .eq("reqno", cleanReqno)
    .order("created_at", { ascending: false })
    .limit(200);

  const jobRows = jobs || [];
  const providerIds = Array.from(new Set(jobRows.map(extractProviderMessageId).filter(Boolean)));
  const statusByMessageId = await fetchDeliveryStatusByMessageId(providerIds);

  const autoDispatch = jobRows.map((job) => {
    const snapshot = parseMaybeJson(job?.last_status_snapshot);
    const tests = Array.isArray(snapshot?.tests) ? snapshot.tests : [];
    const testIds = tests.map((t) => String(t?.TEST_ID || "").trim()).filter(Boolean);
    const providerMessageId = extractProviderMessageId(job);
    const delivery = providerMessageId ? statusByMessageId.get(providerMessageId) : null;
    return {
      job_id: job.id,
      report_label: job.report_label,
      status: job.status,
      sent_at: job.sent_at,
      provider_message_id: providerMessageId,
      delivery_status: delivery?.status || (job.status === "sent" ? "sent" : null),
      delivery_status_at: delivery?.at || null,
      test_ids: testIds
    };
  }).filter((row) => !testid || row.test_ids.includes(String(testid)));

  const phone = jobRows.find((j) => j.phone)?.phone || null;
  const phoneVariants = phone ? Array.from(new Set([phoneLast10(phone), `91${phoneLast10(phone)}`])) : [];
  const botPickupEvents = await fetchBotPickupEvents(phoneVariants);

  const { data: dispatchLogRows } = await supabase
    .from(DISPATCH_LOGS_TABLE)
    .select("actor_user_id,actor_name,actor_role,action,report_type,status,result_code,created_at")
    .eq("reqno", cleanReqno)
    .neq("actor_role", "system")
    .order("created_at", { ascending: false })
    .limit(200);

  const staffActions = (dispatchLogRows || []).map((row) => ({
    actor_user_id: row.actor_user_id,
    actor_name: row.actor_name,
    action: row.action,
    report_type: row.report_type,
    status: row.status,
    result_code: row.result_code,
    at: row.created_at
  }));

  const everDelivered = autoDispatch.some((r) => ["delivered", "read"].includes(String(r.delivery_status)));
  const everRead = autoDispatch.some((r) => r.delivery_status === "read");
  const everPickedUpByPatient = botPickupEvents.length > 0;
  const everViewedByStaff = staffActions.some((r) => ["preview", "download", "send_whatsapp"].includes(String(r.action)) && r.status === "success");

  let lockReason = null;
  if (everRead) {
    const readAt = autoDispatch.find((r) => r.delivery_status === "read")?.delivery_status_at;
    lockReason = `Read by patient on WhatsApp${readAt ? ` at ${readAt}` : ""}.`;
  } else if (everDelivered) {
    const deliveredAt = autoDispatch.find((r) => ["delivered", "read"].includes(String(r.delivery_status)))?.delivery_status_at;
    lockReason = `Delivered to patient on WhatsApp${deliveredAt ? ` at ${deliveredAt}` : ""}.`;
  } else if (everPickedUpByPatient) {
    lockReason = `Patient requested and received this report via the WhatsApp bot at ${botPickupEvents[0].replied_at}.`;
  } else if (everViewedByStaff) {
    const staffEvent = staffActions.find((r) => r.status === "success");
    lockReason = `Printed/sent by staff (${staffEvent?.actor_name || "unknown"}) at ${staffEvent?.at}.`;
  }

  return {
    reqno: cleanReqno,
    auto_dispatch: autoDispatch,
    bot_pickup: { picked_up: everPickedUpByPatient, events: botPickupEvents },
    staff_actions: staffActions,
    summary: {
      ever_delivered: everDelivered,
      ever_read: everRead,
      ever_picked_up_by_patient: everPickedUpByPatient,
      ever_viewed_by_staff: everViewedByStaff,
      locked_from_unapprove: Boolean(lockReason),
      lock_reason: lockReason
    }
  };
}

function emptySummary() {
  return {
    ever_delivered: false,
    ever_read: false,
    ever_picked_up_by_patient: false,
    ever_viewed_by_staff: false,
    locked_from_unapprove: false,
    lock_reason: null
  };
}
