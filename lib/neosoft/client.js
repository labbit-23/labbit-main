//lib/neosoft/client.js

const BASE_URL = String(process.env.NEOSOFT_API_BASE_URL || "").replace(/\/+$/, "");
const NEOSOFT_TIMEOUT_MS = Number(process.env.NEOSOFT_TIMEOUT_MS || 15000);

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

function hasUsableTrendPayload(payload) {
  if (!payload || typeof payload !== "object") return false;

  if (Array.isArray(payload?.table?.rows) && payload.table.rows.length > 0) return true;
  if (Array.isArray(payload?.parameters) && payload.parameters.length > 0) return true;
  if (Array.isArray(payload?.tests) && payload.tests.length > 0) return true;
  if (Array.isArray(payload?.markers) && payload.markers.length > 0) return true;
  if (Array.isArray(payload?.items) && payload.items.length > 0) return true;

  return false;
}

function hasUsableStandardizedWrapper(wrapper) {
  if (!wrapper || typeof wrapper !== "object") return false;
  const standardized = wrapper.standardized;
  if (!standardized || typeof standardized !== "object") return false;
  return Array.isArray(standardized.parameters) && standardized.parameters.length > 0;
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

export async function getTrendDataByMrno(mrno) {
  const cleanMrno = String(mrno || "").trim();
  if (!cleanMrno) {
    throw new Error("Trend data requires mrno");
  }

  const pythonTemplate = String(
    process.env.LABBIT_PY_TREND_DATA_URL_TEMPLATE ||
      process.env.LABBIT_PY_GETTRENDSDATAAPI ||
      process.env.LABBIT_PY_GET_TRENDS_DATA_API ||
      ""
  ).trim();
  const template = String(
    process.env.NEOSOFT_TREND_DATA_URL_TEMPLATE ||
      process.env.GETTRENDSDATAAPI ||
      process.env.GET_TRENDS_DATA_API ||
      ""
  ).trim();
  const internalToken = String(
    process.env.LABBIT_PY_INTERNAL_TOKEN ||
      process.env.INTERNAL_API_TOKEN ||
      ""
  ).trim();

  const headers = {
    Accept: "application/json"
  };
  if (internalToken) {
    headers.Authorization = `Bearer ${internalToken}`;
    headers["x-internal-token"] = internalToken;
  }

  const urls = [];

  if (pythonTemplate) {
    urls.push(pythonTemplate.replace("{mrno}", encodeURIComponent(cleanMrno)));
  }

  if (template) {
    urls.push(template.replace("{mrno}", encodeURIComponent(cleanMrno)));
  }

  urls.push(
    `${BASE_URL}/trend-data/${encodeURIComponent(cleanMrno)}`,
    `${BASE_URL}/trend-report-data/${encodeURIComponent(cleanMrno)}`,
    `${BASE_URL}/trend-report-json/${encodeURIComponent(cleanMrno)}`
  );

  let lastError = null;

  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, {
        cache: "no-store",
        headers
      });
      if (res.status === 404) continue;
      if (!res.ok) {
        let detail = "";
        try {
          detail = (await res.text()).slice(0, 300);
        } catch {
          detail = "";
        }
        lastError = new Error(
          `NeoSoft trend data failed: ${res.status}${detail ? ` | ${detail}` : ""}`
        );
        continue;
      }
      const json = await res.json();

      // If py gateway wrapper is returned, prefer raw payload from `data`.
      if (json && typeof json === "object" && json.data && typeof json.data === "object") {
        if (hasUsableTrendPayload(json.data)) {
          return json.data;
        }
        // wrapper exists but raw data is missing/unusable; try next URL fallback.
        continue;
      }

      // If wrapper has usable standardized payload, use it as fallback.
      if (hasUsableStandardizedWrapper(json)) {
        return json.standardized;
      }

      // Helpful diagnostic when py returns row_count but no raw/usable standardized.
      if (
        json &&
        typeof json === "object" &&
        Number(json.row_count || 0) > 0 &&
        !json.data
      ) {
        lastError = new Error(
          "Trend data wrapper returned rows but no raw payload. Ensure include_raw=1 in trend-data template URL."
        );
        continue;
      }

      if (!hasUsableTrendPayload(json)) {
        // non-empty 200 response but unusable structure; try next URL fallback.
        continue;
      }

      return json;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("NeoSoft trend data endpoint not reachable");
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
