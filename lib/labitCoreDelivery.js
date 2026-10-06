const CORE_BASE = String(
  process.env.LABIT_CORE_BASE_URL || process.env.LABIT_CORE_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

function coreHeaders() {
  const token = String(process.env.DELIVER_INTERNAL_TOKEN || "").trim();
  if (!token) throw new Error("DELIVER_INTERNAL_TOKEN is not configured");
  const headers = { Accept: "application/json", "X-Internal-Token": token };
  return headers;
}

async function coreJson(path, init = {}) {
  const response = await fetch(`${CORE_BASE}${path}`, {
    ...init,
    headers: { ...coreHeaders(), ...(init.headers || {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { detail: text };
  }
  if (!response.ok) {
    const error = new Error(body?.detail || body?.message || `Labit Core returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export function getCorePrintPending(day) {
  return coreJson(`/internal/dispatch/print-pending?day=${encodeURIComponent(day)}&limit=2000`);
}

export function getCoreDeliveryHistory(reference) {
  return coreJson(`/internal/dispatch/requisitions/${encodeURIComponent(reference)}/delivery-history`);
}

export function confirmCorePrintReceipt(payload) {
  return coreJson("/internal/dispatch/mark-requisition-delivered", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
