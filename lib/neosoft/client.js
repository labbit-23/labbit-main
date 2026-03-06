const BASE_URL = process.env.NEOSOFT_API_BASE_URL;

if (!BASE_URL) {
  throw new Error("NEOSOFT_API_BASE_URL is not defined");
}

export async function lookupReports(phone) {
  const response = await fetch(`${BASE_URL}/lookup/${phone}`);

  if (!response.ok) {
    throw new Error("NeoSoft lookup failed");
  }

  const data = await response.json();
  return data?.latest_reports || [];
}

export function getReportUrl(reqid) {
  return `${BASE_URL}/report/${reqid}`;
}