import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { normalizeNeosoftTrendPayload } from "@/lib/trendReports/normalizeNeosoft";
import { evaluateTrendRules } from "@/lib/trendReports/ruleEngine";
import { buildReportFacts } from "@/lib/trendReports/buildReportFacts";
import { renderReportHtml } from "@/lib/trendReports/renderReportHtml";
import { fetchTrendPayloadByMrno } from "@/lib/trendReports/fetchTrendPayload";

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
// Trend data is fetched through lib/trendReports/fetchTrendPayload -- a
// single shared client pointed at labit-py's /trend-data/{mrno} (which
// proxies into labit-core's labit_core + Shivam-archive merge). No
// labit-deliver hop and no NeoSoft /trend-report-* fallbacks: labit-py is
// the one upstream.
const TREND_REPORT_DEFAULT_DESIGN_VARIANT = String(
  process.env.TREND_REPORT_DEFAULT_DESIGN_VARIANT ||
  process.env.SMART_REPORT_DEFAULT_DESIGN_VARIANT ||
  ""
).trim().toLowerCase();

function normalizedDesignVariant(value, fallback = "basic") {
  const text = asText(value).toLowerCase();
  if (text === "basic" || text === "executive") return text;
  return fallback;
}

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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

// Rendered (200, not an error) when the upstream answered cleanly but the
// patient has no trend history to report -- most often a rapid/walk-in MRN
// (the 500000001-899999999 range) that labit-core deliberately treats as
// non-trendable. A patient reaching this via a WhatsApp/portal link should
// see a plain message, never a 500.
function renderTrendUnavailableHtml({ mrno, message, brand }) {
  const logo = asText(brand?.logo_url) || DEFAULT_SDRC_LOGO;
  const labName = asText(brand?.lab_name) || "SDRC";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Trend Report unavailable</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #f4f6f8; }
  body { font: 15px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2933; }
  .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 40px 20px; box-sizing: border-box; }
  .card { background: #fff; border-radius: 14px; box-shadow: 0 8px 30px rgba(20,30,40,.12); max-width: 460px; width: 100%; padding: 36px 32px; text-align: center; }
  .card img { max-height: 46px; margin-bottom: 22px; }
  h1 { font-size: 19px; margin: 0 0 10px; color: #141e28; }
  p { margin: 8px 0; color: #52606d; }
  .mrno { display: inline-block; margin-top: 14px; font-size: 12px; color: #7b8794; letter-spacing: .04em; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <img src="${escapeHtml(logo)}" alt="${escapeHtml(labName)}" />
      <h1>Trend report not available</h1>
      <p>${escapeHtml(message)}</p>
      <p class="mrno">MRN ${escapeHtml(mrno)}</p>
    </div>
  </div>
</body>
</html>`;
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
    asText(lab?.logo_url) ||
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

    const download = boolFlag(url.searchParams.get("download"), false);

    const trendResult = await fetchTrendPayloadByMrno(mrno);
    if (trendResult.status !== "ok") {
      const message = trendResult.message;
      const unavailableHtml = renderTrendUnavailableHtml({ mrno, message, brand });
      if (format === "pdf") {
        try {
          const pdf = await htmlToPdfBuffer(unavailableHtml);
          return new NextResponse(pdf, {
            status: 200,
            headers: {
              "content-type": "application/pdf",
              "content-disposition": `${download ? "attachment" : "inline"}; filename=\"SDRC_Trend_Report_${mrno}.pdf\"`,
              "cache-control": "no-store",
              "x-trend-status": trendResult.reason || "unavailable"
            }
          });
        } catch {
          // fall through to HTML if the PDF renderer is unavailable
        }
      }
      return new NextResponse(unavailableHtml, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-trend-status": trendResult.reason || "unavailable"
        }
      });
    }
    const payload = trendResult.payload;
    const normalized = normalizeNeosoftTrendPayload(payload, { asOfDate });
    const evaluation = evaluateTrendRules({ normalizedTrend: normalized, asOfDate });
    const envDesignVariant = normalizedDesignVariant(TREND_REPORT_DEFAULT_DESIGN_VARIANT, "");
    const brandResolved = {
      ...(brand || {}),
      design_variant: normalizedDesignVariant(
        designVariant,
        normalizedDesignVariant(envDesignVariant, normalizedDesignVariant(brand?.design_variant, "basic"))
      )
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

    if (format === "pdf") {
      try {
        const pdf = await htmlToPdfBuffer(html);
        return new NextResponse(pdf, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `${download ? "attachment" : "inline"}; filename=\"${baseName}.pdf\"`,
            "cache-control": "no-store",
            "x-report-mode": resolvedReportMode,
            "x-design-variant": String(brandResolved?.design_variant || "")
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
        "cache-control": "no-store",
        "x-report-mode": resolvedReportMode,
        "x-design-variant": String(brandResolved?.design_variant || "")
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
