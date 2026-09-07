// lib/trendReports/fetchTrendPayload.js
//
// Single shared client for MRNO-keyed trend data. Every labit-main surface
// that needs trend points (the Trend Report route
// app/api/smart-reports/trend-data/route.js and the patient portal payload
// app/api/patient/portal/route.js) goes through here instead of keeping its
// own copy of the fetch/fallback logic.
//
// Source of truth is labit-py's `/trend-data/{mrno}` (which itself proxies
// into labit-core -- the labit_core + Shivam-archive merge). The old
// labit-deliver facade and the NeoSoft `/trend-report-data` / `/trend-report-json`
// variants are deliberately gone: labit-py is the one upstream now.
//
// Return contract -- a discriminated result, never a bare throw for the
// "patient simply has no trend history" case:
//   { status: "ok", payload }        usable { parameters:[...] } shape
//   { status: "unavailable", reason, message }
//                                    upstream answered cleanly (404, or 200
//                                    with no points -- e.g. a rapid/walk-in
//                                    MRN that is deliberately non-trendable)
// Throws only on a real transport failure (connection refused, timeout,
// 5xx from every candidate) -- i.e. something is actually broken.

const BASE_URL = String(process.env.NEOSOFT_API_BASE_URL || "").replace(/\/+$/, "");
const TREND_FETCH_TIMEOUT_MS = Number(process.env.NEOSOFT_TIMEOUT_MS || 15000);

const DEFAULT_UNAVAILABLE_MESSAGE =
  "Trend data is not available for this patient. Please contact the lab for trend data reports.";

function asText(value) {
  return String(value ?? "").trim();
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

function candidateUrls(cleanMrno) {
  const pythonTemplate = asText(
    process.env.LABBIT_PY_TREND_DATA_URL_TEMPLATE ||
      process.env.LABBIT_PY_GETTRENDSDATAAPI ||
      process.env.LABBIT_PY_GET_TRENDS_DATA_API
  );
  const genericTemplate = asText(
    process.env.NEOSOFT_TREND_DATA_URL_TEMPLATE ||
      process.env.GETTRENDSDATAAPI ||
      process.env.GET_TRENDS_DATA_API
  );

  const urls = [];
  const enc = encodeURIComponent(cleanMrno);
  if (pythonTemplate) urls.push(pythonTemplate.replace("{mrno}", enc));
  if (genericTemplate) urls.push(genericTemplate.replace("{mrno}", enc));
  if (BASE_URL) urls.push(`${BASE_URL}/trend-data/${enc}`);
  return [...new Set(urls)];
}

function authHeaders() {
  const headers = { Accept: "application/json" };
  const internalToken = asText(
    process.env.LABBIT_PY_INTERNAL_TOKEN || process.env.INTERNAL_API_TOKEN
  );
  if (internalToken) {
    headers.Authorization = `Bearer ${internalToken}`;
    headers["x-internal-token"] = internalToken;
  }
  return headers;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TREND_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Trend data request timed out after ${TREND_FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// labit-core / labit-py answered, but there are no trend points. Pull the
// most specific reason it gave us so callers can show a better message than
// the generic fallback (e.g. the rapid/walk-in "standalone visits" note).
function unavailableFrom(json) {
  const reason =
    asText(json?.reason) ||
    (json?.trend_available === false ? "unavailable" : "") ||
    "no_data";
  const message =
    asText(json?.message) ||
    asText(json?.archive_error) ||
    asText(json?.detail?.error) ||
    DEFAULT_UNAVAILABLE_MESSAGE;
  return { status: "unavailable", reason, message };
}

/**
 * @param {string} mrno
 * @returns {Promise<{status:"ok", payload:object} | {status:"unavailable", reason:string, message:string}>}
 */
export async function fetchTrendPayloadByMrno(mrno) {
  const cleanMrno = asText(mrno);
  if (!cleanMrno) {
    return { status: "unavailable", reason: "missing_mrno", message: DEFAULT_UNAVAILABLE_MESSAGE };
  }

  const urls = candidateUrls(cleanMrno);
  if (urls.length === 0) {
    throw new Error("No trend data upstream configured (LABBIT_PY_TREND_DATA_URL_TEMPLATE / NEOSOFT_API_BASE_URL)");
  }

  const headers = authHeaders();
  let transportError = null;
  let sawCleanAnswer = false;
  let lastUnavailable = null;

  for (const url of urls) {
    let res;
    try {
      res = await fetchWithTimeout(url, { cache: "no-store", headers });
    } catch (error) {
      transportError = error;
      continue;
    }

    if (res.status === 404) {
      sawCleanAnswer = true;
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      lastUnavailable = unavailableFrom(body?.detail || body || {});
      continue;
    }

    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 240);
      } catch {
        detail = "";
      }
      transportError = new Error(`Trend data upstream ${res.status}${detail ? ` | ${detail}` : ""}`);
      continue;
    }

    let json;
    try {
      json = await res.json();
    } catch (error) {
      transportError = error;
      continue;
    }

    sawCleanAnswer = true;

    if (hasUsableTrendPayload(json)) return { status: "ok", payload: json };
    if (json && typeof json === "object" && hasUsableTrendPayload(json.data)) {
      return { status: "ok", payload: json.data };
    }
    if (
      json &&
      typeof json === "object" &&
      json.standardized &&
      Array.isArray(json.standardized.parameters) &&
      json.standardized.parameters.length
    ) {
      return { status: "ok", payload: json.standardized };
    }

    // 200 but no points -- a deliberately non-trendable patient (rapid /
    // walk-in), or a patient with genuinely no history. Not an error.
    lastUnavailable = unavailableFrom(json || {});
  }

  if (sawCleanAnswer) {
    return lastUnavailable || {
      status: "unavailable",
      reason: "no_data",
      message: DEFAULT_UNAVAILABLE_MESSAGE,
    };
  }

  throw transportError || new Error("Trend data endpoint not reachable");
}

export { DEFAULT_UNAVAILABLE_MESSAGE };
