import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { normalizeNeosoftTrendPayload } from "@/lib/trendReports/normalizeNeosoft";
import { evaluateTrendRules } from "@/lib/trendReports/ruleEngine";
import { buildReportFacts } from "@/lib/trendReports/buildReportFacts";
import { renderReportHtml } from "@/lib/trendReports/renderReportHtml";

function asText(value) {
  return String(value || "").trim();
}

const DEFAULT_SDRC_LAB_ID = String(
  process.env.DEFAULT_SDRC_LAB_ID ||
  process.env.DEFAULT_LAB_ID ||
  "b539c161-1e2b-480b-9526-d4b37bd37b1e"
).trim();
const DEFAULT_SDRC_COVER = "https://sdrc.in/assets/sdrc-services.png";
const DEFAULT_SDRC_LOGO = "https://sdrc.in/assets/sdrc-logo.png";
const NEOSOFT_BASE_URL = String(process.env.NEOSOFT_API_BASE_URL || "").replace(/\/+$/, "");
const TREND_FETCH_TIMEOUT_MS = Number(process.env.NEOSOFT_TIMEOUT_MS || 15000);

function parseTemplates(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? raw : {};
}

function boolFlag(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(text)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(text)) return false;
  return fallback;
}

function hasUsablePayload(payload) {
  if (Array.isArray(payload)) return payload.length > 0;
  if (!payload || typeof payload !== "object") return false;
  if (Array.isArray(payload?.table?.rows) && payload.table.rows.length > 0) return true;
  if (Array.isArray(payload?.parameters) && payload.parameters.length > 0) return true;
  if (Array.isArray(payload?.tests) && payload.tests.length > 0) return true;
  if (Array.isArray(payload?.markers) && payload.markers.length > 0) return true;
  if (Array.isArray(payload?.items) && payload.items.length > 0) return true;
  return false;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TREND_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`NeoSoft trend data timed out after ${TREND_FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSmartTrendPayload(mrno) {
  const cleanMrno = asText(mrno);
  if (!cleanMrno) {
    throw new Error("mrno is required");
  }

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
  if (pythonTemplate) urls.push(pythonTemplate.replace("{mrno}", encodeURIComponent(cleanMrno)));
  if (genericTemplate) urls.push(genericTemplate.replace("{mrno}", encodeURIComponent(cleanMrno)));
  if (NEOSOFT_BASE_URL) {
    urls.push(
      `${NEOSOFT_BASE_URL}/trend-data/${encodeURIComponent(cleanMrno)}`,
      `${NEOSOFT_BASE_URL}/trend-report-data/${encodeURIComponent(cleanMrno)}`,
      `${NEOSOFT_BASE_URL}/trend-report-json/${encodeURIComponent(cleanMrno)}`
    );
  }

  let lastError = null;
  for (const endpoint of urls) {
    try {
      const res = await fetchWithTimeout(endpoint, {
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      if (res.status === 404) continue;
      if (!res.ok) {
        let detail = "";
        try { detail = (await res.text()).slice(0, 240); } catch {}
        lastError = new Error(`NeoSoft trend data failed: ${res.status}${detail ? ` | ${detail}` : ""}`);
        continue;
      }

      const json = await res.json();
      if (hasUsablePayload(json)) return json;
      if (json && typeof json === "object" && hasUsablePayload(json.data)) return json.data;
      if (
        json &&
        typeof json === "object" &&
        json.standardized &&
        Array.isArray(json.standardized.parameters) &&
        json.standardized.parameters.length
      ) {
        return json.standardized;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("NeoSoft trend data endpoint not reachable");
}

async function resolveLabBrandAndFlag(labId) {
  const cleanLabId = asText(labId) || DEFAULT_SDRC_LAB_ID;
  if (!cleanLabId) {
    return { smartReportEnabled: true, brand: null };
  }

  const [{ data: lab }, { data: waCfg }] = await Promise.all([
    supabase.from("labs").select("*").eq("id", cleanLabId).maybeSingle(),
    supabase
      .from("labs_apis")
      .select("templates")
      .eq("lab_id", cleanLabId)
      .eq("api_name", "whatsapp_outbound")
      .maybeSingle()
  ]);

  const templates = parseTemplates(waCfg?.templates);
  const smartReportEnabled = boolFlag(
    templates?.smart_report_enabled ?? templates?.bot_flow?.smart_report_enabled,
    true
  );

  const logoUrl =
    asText(templates?.smart_report_logo_url) ||
    asText(templates?.logo_url) ||
    asText(lab?.smart_report_logo_url) ||
    asText(lab?.logo_url) ||
    asText(lab?.lab_logo_url) ||
    asText(lab?.logo) ||
    DEFAULT_SDRC_LOGO;

  return {
    smartReportEnabled,
    brand: {
      lab_id: cleanLabId,
      lab_name: asText(lab?.name) || "SDRC",
      logo_url: logoUrl || null,
      cover_url: asText(templates?.smart_report_cover_url) || DEFAULT_SDRC_COVER,
      design_variant: asText(templates?.smart_report_design_variant) || "basic"
    }
  };
}

async function htmlToPdfBuffer(html) {
  const playwright = await import("playwright");
  let browser;
  try {
    browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  } catch {
    browser = await playwright.chromium.launch({ headless: true });
  }
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      if (document?.fonts?.ready) {
        try { await document.fonts.ready; } catch {}
      }
      if (window.__smartReportImagesReady) {
        try { await window.__smartReportImagesReady; } catch {}
      }
    });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0mm",
        right: "0mm",
        bottom: "0mm",
        left: "0mm"
      }
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const mrno = asText(url.searchParams.get("mrno"));
    const labId = asText(url.searchParams.get("lab_id"));
    const format = asText(url.searchParams.get("format")).toLowerCase() || "html";
    const asOfDate = asText(url.searchParams.get("asof")) || new Date().toISOString().slice(0, 10);
    const psyntaxMode = asText(url.searchParams.get("psyntax_mode")).toLowerCase() || "neutral";
    const requestedReportMode = asText(url.searchParams.get("report_mode")).toLowerCase();
    const designVariant = asText(url.searchParams.get("design_variant")).toLowerCase();
    const force = boolFlag(url.searchParams.get("force"), false);

    if (!mrno) {
      return NextResponse.json({ error: "mrno is required" }, { status: 400 });
    }

    const { smartReportEnabled, brand } = await resolveLabBrandAndFlag(labId);

    const payload = await fetchSmartTrendPayload(mrno);
    const normalized = normalizeNeosoftTrendPayload(payload, { asOfDate });
    const evaluation = evaluateTrendRules({ normalizedTrend: normalized, asOfDate });
    const brandResolved = {
      ...(brand || {}),
      design_variant: ["basic", "executive"].includes(designVariant)
        ? designVariant
        : asText(brand?.design_variant || "basic").toLowerCase()
    };

    const resolvedReportMode = ["smart", "trends"].includes(requestedReportMode)
      ? requestedReportMode
      : (smartReportEnabled ? "smart" : "trends");

    const facts = buildReportFacts({
      normalizedTrend: normalized,
      evaluation,
      maxChartPoints: 5,
      brand: brandResolved,
      psyntaxMode,
      reportMode: resolvedReportMode
    });
    const html = renderReportHtml(facts);

    const baseName = `${resolvedReportMode === "trends" ? "SDRC_Trend_Report" : "SDRC_Smart_Trend"}_${mrno}`;
    const download = boolFlag(url.searchParams.get("download"), false);

    if (format === "pdf") {
      try {
        const pdf = await htmlToPdfBuffer(html);
        return new NextResponse(pdf, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `${download ? "attachment" : "inline"}; filename=\"${baseName}.pdf\"`,
            "cache-control": "no-store"
          }
        });
      } catch (error) {
        return NextResponse.json(
          {
            error: "PDF renderer unavailable. Install playwright on this service.",
            details: error?.message || String(error),
            html_fallback_url: `${url.pathname}?mrno=${encodeURIComponent(mrno)}${labId ? `&lab_id=${encodeURIComponent(labId)}` : ""}&format=html`
          },
          { status: 501 }
        );
      }
    }

    return new NextResponse(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `${download ? "attachment" : "inline"}; filename=\"${baseName}.html\"`,
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error?.message || "Failed to build smart trend report"
      },
      { status: 500 }
    );
  }
}
