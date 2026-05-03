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

export async function getReportStatusByReqid(reqid, password = "") {
  const cleanReqid = String(reqid || "").trim();
  const cleanPassword = String(password || "").trim();
  if (!cleanReqid) {
    throw new Error("Report status requires reqid");
  }

  const params = new URLSearchParams();
  if (cleanPassword) params.set("password", cleanPassword);
  const query = params.toString();
  const url = query
    ? `${BASE_URL}/report-status-reqid/${encodeURIComponent(cleanReqid)}?${query}`
    : `${BASE_URL}/report-status-reqid/${encodeURIComponent(cleanReqid)}`;

  const res = await fetchWithTimeout(
    url,
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

export async function getDeliveryRequisitionsByDate(date, options = {}) {
  const cleanDate = String(date || "").trim();
  if (!cleanDate) {
    throw new Error("Delivery requisitions requires date");
  }

  const orgIds = Array.isArray(options?.orgIds)
    ? options.orgIds.map((v) => String(v || "").trim()).filter(Boolean)
    : [];

  const orgId = String(options?.orgId || orgIds[0] || "").trim();

  const buildUrl = (withOrg = false) => {
    const params = new URLSearchParams();
    if (withOrg && orgId) params.set("org_id", orgId);
    const query = params.toString();
    return query
      ? `${BASE_URL}/delivery/requisitions-by-date/${encodeURIComponent(cleanDate)}?${query}`
      : `${BASE_URL}/delivery/requisitions-by-date/${encodeURIComponent(cleanDate)}`;
  };

  async function parseResponseOrThrow(res, url) {
    const raw = await res.text();
    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    const tryJson = () => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    if (!res.ok) {
      const parsed = tryJson();
      const detail =
        (parsed && (parsed.error || parsed.message || parsed.detail)) ||
        raw.slice(0, 200) ||
        `status ${res.status}`;
      throw new Error(`NeoSoft delivery requisitions failed: ${res.status} (${detail})`);
    }

    if (contentType.includes("application/json")) {
      const parsed = tryJson();
      if (parsed && typeof parsed === "object") return parsed;
      throw new Error(`NeoSoft delivery requisitions invalid JSON from ${url}`);
    }

    const parsed = tryJson();
    if (parsed && typeof parsed === "object") return parsed;

    throw new Error(
      `NeoSoft delivery requisitions unexpected response type from ${url}: ${contentType || "unknown"}`
    );
  }

  const primaryUrl = buildUrl(Boolean(orgId));
  try {
    const res = await fetchWithTimeout(primaryUrl, { cache: "no-store" });
    return await parseResponseOrThrow(res, primaryUrl);
  } catch (error) {
    // Scoped-role fallback: retry without org_id once in case upstream org filtering is unavailable.
    if (orgId) {
      const fallbackUrl = buildUrl(false);
      const res = await fetchWithTimeout(fallbackUrl, { cache: "no-store" });
      return await parseResponseOrThrow(res, fallbackUrl);
    }
    throw error;
  }
}

export async function getDepartmentWorklist(options = {}) {
  const fromReqDate = String(options?.fromreqdate || options?.fromReqDate || "").trim();
  const toReqDate = String(options?.toreqdate || options?.toReqDate || fromReqDate).trim();
  const department = String(options?.department || "").trim();

  if (!department) {
    throw new Error("Department worklist requires department");
  }

  const payload = {
    fromreqdate: fromReqDate,
    toreqdate: toReqDate || fromReqDate,
    department
  };

  const res = await fetchWithTimeout(`${BASE_URL}/delivery/department-worklist`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify([payload])
  });

  const raw = await res.text();
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }

  if (!res.ok) {
    const detail =
      (json && (json.error || json.message || json.detail?.error || json.detail?.message)) ||
      raw.slice(0, 300) ||
      `status ${res.status}`;
    throw new Error(`NeoSoft department worklist failed: ${detail}`);
  }

  if (json && Array.isArray(json.results)) {
    return json.results[0] || { count: 0, items: [] };
  }

  if (json && typeof json === "object") {
    return json;
  }

  throw new Error("NeoSoft department worklist returned invalid payload");
}

export async function updateShivamDemographics(payload) {
  const endpoint = String(
    process.env.LABBIT_PY_SHIVAM_DEMOGRAPHICS_UPDATE_URL ||
    process.env.LABBIT_PY_SHIVAM_DEMOGRAPHICS_PUT_URL ||
    process.env.NEOSOFT_UPDATE_DEMOGRAPHICS_URL ||
    ""
  ).trim();
  if (!endpoint) {
    throw new Error("LABBIT_PY_SHIVAM_DEMOGRAPHICS_UPDATE_URL is not configured");
  }

  const res = await fetchWithTimeout(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload || {})
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const detail =
      (json && (json.error || json.message || json.detail)) ||
      `status ${res.status}`;
    throw new Error(`NeoSoft demographics update failed: ${detail}`);
  }

  return json || { ok: true };
}

export async function getShivamPriceList(options = {}) {
  const endpoint = String(
    process.env.LABBIT_PY_SHIVAM_PRICELIST_URL ||
      process.env.NEOSOFT_PRICELIST_EXPORT_URL ||
      ""
  ).trim();
  const legacyBase = String(process.env.NEOSOFT_API_BASE_URL || "").replace(/\/+$/, "");

  const labId = String(options?.labId || "").trim();
  const params = new URLSearchParams();
  if (labId) params.set("lab_id", labId);
  let url = "";
  if (endpoint) {
    url = params.toString() ? `${endpoint}?${params.toString()}` : endpoint;
  } else if (legacyBase) {
    const baseUrl = `${legacyBase}/shivam/pricelist`;
    url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
  } else {
    throw new Error("LABBIT_PY_SHIVAM_PRICELIST_URL is not configured");
  }

  let res = await fetchWithTimeout(url, { cache: "no-store" });
  if (!res.ok && !endpoint && legacyBase) {
    const legacyUrl = `${legacyBase}/pricelist`;
    const fallbackUrl = params.toString() ? `${legacyUrl}?${params.toString()}` : legacyUrl;
    res = await fetchWithTimeout(fallbackUrl, { cache: "no-store" });
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const detailObj = json && typeof json?.detail === "object" ? json.detail : null;
    const detail =
      (detailObj && (detailObj.error || detailObj.message)) ||
      (json && (json.error || json.message || json.detail)) ||
      `status ${res.status}`;
    throw new Error(`NeoSoft pricelist fetch failed: ${detail}`);
  }

  return json || {};
}

export async function getShivamDemographicsByMrno(mrno) {
  const cleanMrno = String(mrno || "").trim();
  if (!cleanMrno) {
    throw new Error("MRNO is required");
  }

  const template = String(process.env.LABBIT_PY_SHIVAM_DEMOGRAPHICS_GET_URL_TEMPLATE || "").trim();
  const endpoint = String(process.env.LABBIT_PY_SHIVAM_DEMOGRAPHICS_GET_URL || "").trim();
  const legacyBase = String(process.env.NEOSOFT_API_BASE_URL || "").replace(/\/+$/, "");

  let url = "";
  if (template) {
    url = template.replace("{mrno}", encodeURIComponent(cleanMrno));
  } else if (endpoint) {
    const params = new URLSearchParams({ mrno: cleanMrno });
    url = `${endpoint}${endpoint.includes("?") ? "&" : "?"}${params.toString()}`;
  } else if (legacyBase) {
    // Backward-compatible fallback when explicit Shivam env vars are missing.
    // Prefer the new py route, then allow legacy path as a second attempt.
    url = `${legacyBase}/shivam/demographics/${encodeURIComponent(cleanMrno)}`;
  }

  if (!url) {
    throw new Error("LABBIT_PY_SHIVAM_DEMOGRAPHICS_GET_URL_TEMPLATE is not configured");
  }

  let res = await fetchWithTimeout(url, { cache: "no-store" });
  if (!res.ok && !template && !endpoint && legacyBase) {
    const legacyUrl = `${legacyBase}/demographics/${encodeURIComponent(cleanMrno)}`;
    res = await fetchWithTimeout(legacyUrl, { cache: "no-store" });
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const detail =
      (json && (json.error || json.message || json.detail)) ||
      `status ${res.status}`;
    throw new Error(`NeoSoft demographics fetch failed: ${detail}`);
  }

  return json || {};
}
