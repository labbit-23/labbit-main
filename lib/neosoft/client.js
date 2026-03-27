//lib/neosoft/client.js

const BASE_URL = String(process.env.NEOSOFT_API_BASE_URL || "").replace(/\/+$/, "");
const NEOSOFT_TIMEOUT_MS = 6000;

if (!BASE_URL) {
  throw new Error("NEOSOFT_API_BASE_URL is not defined");
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NEOSOFT_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`NeoSoft request timed out after ${NEOSOFT_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupReports(phone) {
  const cleanPhone = String(phone)
    .replace(/\D/g, "")
    .slice(-10);
  
  const res = await fetchWithTimeout(
    `${process.env.NEOSOFT_API_BASE_URL}/lookup/${cleanPhone}`,
    { cache: "no-store" }
  );

  if (res.status === 404) {
    return [];
  }

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

  const res = await fetchWithTimeout(
    `${BASE_URL}/report-status/${encodeURIComponent(cleanReqno)}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error(`NeoSoft report status failed: ${res.status}`);
  }

  return res.json();
}

export async function getReportStatusByReqid(reqid) {
  const cleanReqid = String(reqid || "").trim();
  if (!cleanReqid) {
    throw new Error("Report status requires reqid");
  }

  const res = await fetchWithTimeout(
    `${BASE_URL}/report-status-reqid/${encodeURIComponent(cleanReqid)}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error(`NeoSoft report status by reqid failed: ${res.status}`);
  }

  return res.json();
}

export function getReportUrl(reqid, options = {}) {
  const cleanReqid = encodeURIComponent(String(reqid || "").trim());
  const reqno = options?.reqno;
  const printType = options?.printtype;
  const chkrephead = options?.chkrephead;
  const headerMode = options?.header_mode;
  const withoutHeaderBackground = options?.without_header_background;

  const params = new URLSearchParams();
  if (reqno !== undefined && reqno !== null && String(reqno).trim() !== "") {
    params.set("reqno", String(reqno).trim());
  }
  if (printType !== undefined && printType !== null && String(printType).trim() !== "") {
    params.set("printtype", String(printType).trim());
  }
  if (chkrephead !== undefined && chkrephead !== null && String(chkrephead).trim() !== "") {
    params.set("chkrephead", String(chkrephead).trim());
  }
  if (headerMode !== undefined && headerMode !== null && String(headerMode).trim() !== "") {
    params.set("header_mode", String(headerMode).trim());
  }
  if (withoutHeaderBackground !== undefined && withoutHeaderBackground !== null && String(withoutHeaderBackground).trim() !== "") {
    params.set("without_header_background", String(withoutHeaderBackground).trim());
  }

  const query = params.toString();
  if (query) return `${BASE_URL}/report/${cleanReqid}?${query}`;
  return `${BASE_URL}/report/${cleanReqid}`;
}

export function getRadiologyReportUrl(reqid, options = {}) {
  const cleanReqid = encodeURIComponent(String(reqid || "").trim());
  const params = new URLSearchParams();
  const chkrephead = options?.chkrephead;
  const headerMode = options?.header_mode;
  const withoutHeaderBackground = options?.without_header_background;

  if (chkrephead !== undefined && chkrephead !== null && String(chkrephead).trim() !== "") {
    params.set("chkrephead", String(chkrephead).trim());
  }
  if (headerMode !== undefined && headerMode !== null && String(headerMode).trim() !== "") {
    params.set("header_mode", String(headerMode).trim());
  }
  if (withoutHeaderBackground !== undefined && withoutHeaderBackground !== null && String(withoutHeaderBackground).trim() !== "") {
    params.set("without_header_background", String(withoutHeaderBackground).trim());
  }

  const query = params.toString();
  if (query) return `${BASE_URL}/radiologyreport/${cleanReqid}?${query}`;
  return `${BASE_URL}/radiologyreport/${cleanReqid}`;
}

export function getReportsUrl(reqid, reqno, options = {}) {

  const cleanReqid = encodeURIComponent(String(reqid || "").trim());
  const cleanReqno = encodeURIComponent(String(reqno || "").trim());
  const printType = options?.printtype;
  const chkrephead = options?.chkrephead;
  const headerMode = options?.header_mode;
  const withoutHeaderBackground = options?.without_header_background;

  const params = new URLSearchParams();
  if (cleanReqno) params.set("reqno", cleanReqno);
  if (printType !== undefined && printType !== null && String(printType).trim() !== "") {
    params.set("printtype", String(printType).trim());
  }
  if (chkrephead !== undefined && chkrephead !== null && String(chkrephead).trim() !== "") {
    params.set("chkrephead", String(chkrephead).trim());
  }
  if (headerMode !== undefined && headerMode !== null && String(headerMode).trim() !== "") {
    params.set("header_mode", String(headerMode).trim());
  }
  if (withoutHeaderBackground !== undefined && withoutHeaderBackground !== null && String(withoutHeaderBackground).trim() !== "") {
    params.set("without_header_background", String(withoutHeaderBackground).trim());
  }

  const query = params.toString();
  if (query) return `${BASE_URL}/reports/${cleanReqid}?${query}`;

  // fallback (lab only)
  return `${BASE_URL}/reports/${cleanReqid}`;
}

export function getPendingDispatchReportUrl(reqid, reqno, options = {}) {
  return getReportsUrl(reqid, reqno, {
    ...options,
    printtype: 0
  });
}

export function getTrendReportUrl(mrno) {
  return `${BASE_URL}/trend-report/${encodeURIComponent(String(mrno || "").trim())}`;
}

export function getLatestReportUrl(phone) {
  const cleanPhone = String(phone || "")
    .replace(/\D/g, "")
    .slice(-10);
  return `${BASE_URL}/latest-report/${encodeURIComponent(cleanPhone)}`;
}

export async function getLatestReportMeta(phone) {
  const cleanPhone = String(phone || "")
    .replace(/\D/g, "")
    .slice(-10);

  if (!cleanPhone) return null;

  const res = await fetchWithTimeout(
    `${BASE_URL}/latest-report-meta/${encodeURIComponent(cleanPhone)}`,
    { cache: "no-store" }
  );

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`NeoSoft latest report meta failed: ${res.status}`);
  }

  return res.json();
}

export async function getDeliveryRequisitionsByDate(date) {
  const cleanDate = String(date || "").trim();
  if (!cleanDate) {
    throw new Error("Delivery requisitions requires date");
  }

  const res = await fetchWithTimeout(
    `${BASE_URL}/delivery/requisitions-by-date/${encodeURIComponent(cleanDate)}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error(`NeoSoft delivery requisitions failed: ${res.status}`);
  }

  return res.json();
}
