// Bridge from labit-app's self-serve booking into labit-core's real
// pre-requisition/payment flow (2026-09-30).
//
// Calls a SEPARATE, narrow labit-core router (app/routers/app_booking.py,
// not yet committed -- pending review, see project memory) with its OWN
// service account (`svc_labit_app_booking`, permission
// `app_booking.create_requisition` ONLY -- cannot touch billing outside
// what it itself creates). Deliberately a different credential from
// `submitWebsiteEnquiry`'s `svc_labit_app` (write-only leads) -- this one
// creates real money-bearing records, so it gets its own narrower identity
// rather than widening an existing one's blast radius.
//
// MONEY POLICY (enforced labit-core-side, not just here): convertPreRequisition
// requires a non-empty `payments` array with a real reference per line --
// only call it after a payment gateway CONFIRMS a charge (a webhook, never
// the client-side "success" redirect alone). See app_booking.py's own
// docstring for the full reasoning.
const CORE_BASE = (process.env.LABIT_CORE_API_URL || "").replace(/\/+$/, "");
const USERNAME = process.env.LABIT_CORE_APP_BOOKING_SERVICE_USERNAME || "";
const PASSWORD = process.env.LABIT_CORE_APP_BOOKING_SERVICE_PASSWORD || "";

function configured() {
  return !!(CORE_BASE && USERNAME && PASSWORD);
}

async function call(path, body) {
  if (!configured()) {
    throw new Error("[labitCoreBooking] not configured (LABIT_CORE_API_URL/APP_BOOKING_SERVICE_USERNAME/PASSWORD)");
  }
  const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64");
  const res = await fetch(`${CORE_BASE}/api/app-booking${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.detail ? JSON.stringify(data.detail) : `app-booking call failed: ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/** @param {{testIds: string[], packageIds: string[]}} args */
export function pricePreview({ testIds, packageIds }) {
  return call("/price-preview", { test_ids: testIds, package_ids: packageIds });
}

/** @param {{name: string, phone: string, testIds: string[], packageIds: string[]}} args
 *  @returns real pre_requisition row, including its id */
export function createPreRequisition({ name, phone, testIds, packageIds }) {
  return call("/pre-requisitions", { name, phone, test_ids: testIds, package_ids: packageIds });
}

/** @param {{preRequisitionId: string, amount: number, reference: string}} args
 *  `reference` MUST be the payment gateway's own confirmed payment/order id --
 *  this is the proof labit-core's money policy requires, not a formality. */
export function convertPreRequisition({ preRequisitionId, amount, reference }) {
  return call(`/pre-requisitions/${encodeURIComponent(preRequisitionId)}/convert`, {
    payments: [{ amount, mode: "online", reference }],
  });
}

export const isAppBookingConfigured = configured;
