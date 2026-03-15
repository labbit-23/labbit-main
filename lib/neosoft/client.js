const BASE_URL = process.env.NEOSOFT_API_BASE_URL;

if (!BASE_URL) {
  throw new Error("NEOSOFT_API_BASE_URL is not defined");
}

export async function lookupReports(phone) {

const cleanPhone = String(phone)
  .replace(/\D/g, "")
  .slice(-10);
  
  const res = await fetch(
    `${process.env.NEOSOFT_API_BASE_URL}/lookup/${cleanPhone}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error(`NeoSoft lookup failed: ${res.status}`);
  }

  const data = await res.json();

  return data?.latest_reports || [];
}

export async function getReportStatus(reqno) {
  const cleanReqno = String(reqno || "").trim();

  if (!cleanReqno) {
    throw new Error("Report status requires reqno");
  }

  const res = await fetch(
    `${BASE_URL}/report-status/${encodeURIComponent(cleanReqno)}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error(`NeoSoft report status failed: ${res.status}`);
  }

  return res.json();
}

export function getReportUrl(reqid) {
  return `${BASE_URL}/report/${encodeURIComponent(String(reqid || "").trim())}`;
}

export function getTrendReportUrl(mrno) {
  return `${BASE_URL}/trend-report/${encodeURIComponent(String(mrno || "").trim())}`;
}
