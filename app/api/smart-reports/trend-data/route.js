import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { getTrendDataByMrno } from "@/lib/neosoft/client";
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
        top: "10mm",
        right: "8mm",
        bottom: "10mm",
        left: "8mm"
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

    const payload = await getTrendDataByMrno(mrno);
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
