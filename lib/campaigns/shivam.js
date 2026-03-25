import { toCanonicalIndiaPhone } from "@/lib/phone";

function ensureUrl(value, envName) {
  const url = String(value || "").trim();
  if (!url) throw new Error(`${envName} is not configured`);
  return url;
}

function addDateParam(baseUrl, inactiveSince) {
  const url = new URL(baseUrl);
  if (inactiveSince) url.searchParams.set("inactive_since", inactiveSince);
  return url.toString();
}

function normalizePatientRow(row) {
  const name = String(row?.name || row?.patient_name || "").trim();
  const mobileRaw = row?.mobile || row?.phone || row?.whatsapp || "";
  const mobile = toCanonicalIndiaPhone(mobileRaw);
  const mrno = String(
    row?.mrno || row?.MRNO || row?.mrn || row?.MRN || ""
  ).trim();
  const lastHealthCheckup =
    row?.last_health_checkup ||
    row?.last_checkup ||
    row?.last_visit_at ||
    row?.last_visit_date ||
    row?.last_report_date ||
    row?.reqdt ||
    row?.REQDT ||
    null;
  const lastReqNo = String(row?.reqno || row?.REQNO || "").trim();
  const lastReqId = String(row?.reqid || row?.REQID || "").trim();

  if (!mobile) return null;

  return {
    name: name || "Patient",
    mobile,
    mrno: mrno || null,
    last_health_checkup: lastHealthCheckup ? String(lastHealthCheckup) : null,
    last_reqno: lastReqNo || null,
    last_reqid: lastReqId || null
  };
}

export async function fetchInactivePatients({ inactiveSince }) {
  const endpoint = ensureUrl(
    process.env.SHIVAM_CAMPAIGN_PATIENTS_ENDPOINT,
    "SHIVAM_CAMPAIGN_PATIENTS_ENDPOINT"
  );
  const url = addDateParam(endpoint, inactiveSince);

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shivam patients fetch failed: ${res.status} ${text}`);
  }

  const body = await res.json();
  const sourceRows = Array.isArray(body) ? body : Array.isArray(body?.patients) ? body.patients : [];

  return sourceRows
    .map(normalizePatientRow)
    .filter(Boolean);
}
