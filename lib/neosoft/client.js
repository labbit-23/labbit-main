const BASE_URL = process.env.NEOSOFT_API_BASE_URL;

if (!BASE_URL) {
  throw new Error("NEOSOFT_API_BASE_URL is not defined");
}

export async function lookupReports(phone) {

  const cleanPhone = String(phone).replace(/^91/, "");

  const res = await fetch(
    `${process.env.NEOSOFT_API_BASE_URL}/lookup/${cleanPhone}`,
    { cache: "no-store" }
  );

  const data = await res.json();

  return data?.latest_reports || [];
}

export function getReportUrl(reqid) {
  return `${BASE_URL}/report/${reqid}`;
}