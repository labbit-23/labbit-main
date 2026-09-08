// Shared WhatsApp delivery-status correlation.
//
// One place to answer "did this outbound message get delivered / read?" from
// the whatsapp_messages status callbacks. Used by the report-dispatch monitor
// and the patient-message-jobs activity view. The hard part: our aggregator
// returns one message_id synchronously, but Meta's status webhooks often
// carry a *different* id for the same message — so id-matching alone loses a
// large fraction of correlations. Fall back to same-phone / first-status-
// after-sent.

export function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
}

export function deliveryRank(status) {
  const k = String(status || "").toLowerCase();
  if (k === "failed") return 0;
  if (k === "sent") return 1;
  if (k === "delivered") return 2;
  if (k === "read") return 3;
  return -1;
}

export function normalizeMessageId(v) {
  return String(v || "").trim().toLowerCase();
}

export function phoneLast10(v) {
  const d = String(v || "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

export function parseUtcishDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw)) {
    const dt = new Date(`${raw.replace(" ", "T")}Z`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function statusEventAtMs(row) {
  const payload = parseMaybeJson(row?.payload);
  const cands = [
    payload?.timestamp,
    payload?.raw_status?.timestamp,
    payload?.statuses?.[0]?.timestamp,
    row?.created_at
  ];
  for (const c of cands) {
    if (c == null || c === "") continue;
    if (typeof c === "number" || /^\d{10,13}$/.test(String(c))) {
      const n = Number(c);
      const ms = String(c).length >= 13 ? n : n * 1000;
      if (Number.isFinite(ms)) return ms;
      continue;
    }
    const dt = parseUtcishDate(c);
    if (dt) return dt.getTime();
  }
  return null;
}

export function statusEventKey(row) {
  const payload = parseMaybeJson(row?.payload);
  return String(
    payload?.status || payload?.raw_status?.status || payload?.statuses?.[0]?.status || ""
  ).trim().toLowerCase();
}

// Every id a status callback might be keyed by (its own id, our synchronous
// id echoed as biz_opaque_callback_data, ...).
export function statusEventIds(row) {
  const payload = parseMaybeJson(row?.payload);
  return [
    row?.message_id,
    payload?.provider_message_id,
    payload?.raw_status?.id,
    payload?.statuses?.[0]?.id,
    payload?.raw_status?.biz_opaque_callback_data,
    payload?.statuses?.[0]?.biz_opaque_callback_data
  ]
    .map(normalizeMessageId)
    .filter(Boolean);
}

/**
 * @param {Array} statusRows  whatsapp_messages rows, direction='status'
 * @returns {{ byId: Map<string,string>, byPhone: Map<string,Array<{status:string,atMs:number}>> }}
 *          byId: id -> best (highest-rank) status seen for it
 */
export function buildDeliveryIndex(statusRows) {
  const byId = new Map();
  const byPhone = new Map();
  for (const row of statusRows || []) {
    const status = statusEventKey(row);
    if (!status) continue;
    const atMs = statusEventAtMs(row);
    const payload = parseMaybeJson(row?.payload);
    const p10 = phoneLast10(row?.phone || payload?.recipient_id);
    if (p10 && Number.isFinite(atMs)) {
      if (!byPhone.has(p10)) byPhone.set(p10, []);
      byPhone.get(p10).push({ status, atMs });
    }
    for (const id of statusEventIds(row)) {
      const prev = byId.get(id);
      if (prev == null || deliveryRank(status) > deliveryRank(prev)) byId.set(id, status);
    }
  }
  return { byId, byPhone };
}

/**
 * @param {{providerMessageId?:string, phone?:string, sentAt?:string|number}} send
 * @param {{byId:Map, byPhone:Map}} index
 * @param {{windowHours?:number}} [opts]
 * @returns {"read"|"delivered"|"sent"|null}
 */
export function resolveDelivery(send, index, opts = {}) {
  const pid = normalizeMessageId(send?.providerMessageId);
  const byId = pid ? index.byId.get(pid) : null;
  if (byId) return byId;

  const p10 = phoneLast10(send?.phone);
  const sentMs =
    typeof send?.sentAt === "number" ? send.sentAt : parseUtcishDate(send?.sentAt)?.getTime();
  if (!p10 || !Number.isFinite(sentMs)) return null;

  const horizonMs = (Number(opts.windowHours) || 12) * 60 * 60 * 1000;
  let best = null;
  for (const c of index.byPhone.get(p10) || []) {
    if (c.atMs < sentMs - 30_000 || c.atMs > sentMs + horizonMs) continue;
    if (best == null || deliveryRank(c.status) >= deliveryRank(best)) best = c.status;
  }
  return best;
}
