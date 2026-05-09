import { NextResponse } from "next/server";
import { getRadiologyReportUrl, getReportStatus } from "@/lib/neosoft/client";
import { normalizeNeosoftTrendPayload } from "@/lib/trendReports/normalizeNeosoft";
import zlib from "zlib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

function asText(value) {
  return String(value || "").trim();
}

const NEOSOFT_BASE_URL = String(process.env.NEOSOFT_API_BASE_URL || "").replace(/\/+$/, "");
const FETCH_TIMEOUT_MS = Number(process.env.NEOSOFT_TIMEOUT_MS || 15000);

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
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSmartTrendPayload(mrno) {
  const cleanMrno = asText(mrno);
  if (!cleanMrno) throw new Error("mrno is required");

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
      if (json && typeof json === "object" && json.standardized && Array.isArray(json.standardized.parameters) && json.standardized.parameters.length) {
        return json.standardized;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("NeoSoft trend data endpoint not reachable");
}

function cleanFlatText(text) {
  return String(text || "")
    .replace(/\\[0-7]{1,3}/g, " ")
    .replace(/\\[nrtbf]/g, " ")
    .replace(/\\[()\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodePdfTokenBytes(token) {
  const b = Buffer.isBuffer(token) ? token : Buffer.from(token || "");
  if (!b.length) return "";
  const zeroBytes = [...b].filter((x) => x === 0x00).length;
  if (zeroBytes > Math.floor(b.length / 4)) {
    // Likely UTF-16BE text runs from PDF streams.
    let out = "";
    for (let i = 0; i + 1 < b.length; i += 2) {
      const code = (b[i] << 8) | b[i + 1];
      if (code) out += String.fromCharCode(code);
    }
    return out;
  }
  return b.toString("latin1");
}

function extractPdfStreamsText(buffer) {
  const raw = Buffer.from(buffer);
  const out = [];
  let cursor = 0;

  while (cursor < raw.length) {
    const streamPos = raw.indexOf("stream", cursor, "latin1");
    if (streamPos === -1) break;
    const endPos = raw.indexOf("endstream", streamPos, "latin1");
    if (endPos === -1) break;

    let start = streamPos + "stream".length;
    if (raw[start] === 0x0d && raw[start + 1] === 0x0a) start += 2;
    else if (raw[start] === 0x0a || raw[start] === 0x0d) start += 1;
    const chunk = raw.subarray(start, endPos);
    cursor = endPos + "endstream".length;

    let candidate = null;
    try {
      candidate = zlib.inflateSync(chunk);
    } catch {
      candidate = chunk;
    }

    if (!candidate || candidate.length === 0) continue;
    const txt = extractPdfTextLoose(candidate);
    if (txt) out.push(txt);
  }

  return cleanFlatText(out.join(" "));
}

function extractPdfTextLoose(buffer) {
  const raw = Buffer.from(buffer).toString("latin1");
  const parts = [];

  const plainMatches = raw.matchAll(/\(([^()]*)\)\s*Tj/g);
  for (const m of plainMatches) {
    if (m?.[1]) parts.push(decodePdfTokenBytes(Buffer.from(m[1], "latin1")));
  }

  const arrayMatches = raw.matchAll(/\[(.*?)\]\s*TJ/gs);
  for (const m of arrayMatches) {
    const inner = String(m?.[1] || "").matchAll(/\(([^()]*)\)/g);
    for (const chunk of inner) {
      if (chunk?.[1]) parts.push(decodePdfTokenBytes(Buffer.from(chunk[1], "latin1")));
    }
  }

  return cleanFlatText(parts.join(" "));
}

function oneLine(text) {
  return String(text || "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function normalizeSearchText(text) {
  return oneLine(text)
    .replace(/\bX\s*-\s*RAY\b/gi, "X-RAY")
    .replace(/\bP\s*\.\s*A\s*\.\s*VIEW\b/gi, "PA VIEW")
    .replace(/\bBIRADS?\s+Score\b/gi, "BIRADS Score");
}

function cleanLabText(text) {
  return oneLine(String(text || ""))
    .replace(/Page \d+ of \d+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function captureNumberWithUnit(text, label, unitPattern = "[A-Za-z%/^0-9.-]+") {
  const rx = new RegExp(`${label}\\s+([0-9]+(?:\\.[0-9]+)?)\\s*(${unitPattern})?`, "i");
  const m = String(text || "").match(rx);
  if (!m) return "";
  return `${m[1]}${m[2] ? ` ${m[2]}` : ""}`.trim();
}

function captureValueBeforeLabel(text, label, unitPattern = "[A-Za-z%/^0-9.-]+") {
  const rx = new RegExp(`([0-9]+(?:\\.[0-9]+)?)\\s*(${unitPattern})?[\\s\\S]{0,80}${label}`, "i");
  const m = String(text || "").match(rx);
  if (!m) return "";
  return `${m[1]}${m[2] ? ` ${m[2]}` : ""}`.trim();
}

function captureTrailingValueAfterLabel(text, label, unitPattern = "[A-Za-z%/^0-9.-]+") {
  const rx = new RegExp(`${label}[\\s\\S]{0,120}?([0-9]+(?:\\.[0-9]+)?)\\s*(${unitPattern})?`, "i");
  const m = String(text || "").match(rx);
  if (!m) return "";
  return `${m[1]}${m[2] ? ` ${m[2]}` : ""}`.trim();
}

function cleanSmearValue(value) {
  return oneLine(String(value || ""))
    .replace(/\b(?:WBC|Platelets)\b[\s\S]*$/i, "")
    .replace(/\bReq\b[\s\S]*$/i, "")
    .trim();
}

function extractGlucoseRows(rawText) {
  const raw = String(rawText || "");
  const t = raw.replace(/\s+/g, " ");
  const fbs = firstCapture(t, [
    /([0-9]+(?:\.[0-9]+)?)\s+70\s*-\s*100[\s\S]{0,120}Fasting\s+Glucose/i,
    /Fasting\s+Glucose[\s\S]{0,160}?([0-9]+(?:\.[0-9]+)?)\s+mg\/dL/i
  ]);
  const ppbsLoose = firstCapture(t, [
    /([0-9]+(?:\.[0-9]+)?)\s+100\s*-\s*140[\s\S]{0,140}Post[\s-]*Lunch\s*\/\s*Post[\s-]*Prandial\s+Glucose/i,
    /Post[\s-]*Lunch\s*\/\s*Post[\s-]*Prandial\s+Glucose[\s\S]{0,180}?([0-9]+(?:\.[0-9]+)?)\s+mg\/dL/i,
    /(?:PPBS|PLBS|Post\s*Prandial\s*Blood\s*Glucose)[\s\S]{0,120}?([0-9]+(?:\.[0-9]+)?)\s+mg\/dL/i,
    /([0-9]+(?:\.[0-9]+)?)\s+100\s*-\s*140/i
  ]);
  // Raw-text fallback with minimal normalization for stubborn layout/order cases.
  const rawNorm = raw.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const ppbsHard = firstCapture(rawNorm, [
    /([0-9]+(?:\.[0-9]+)?)\s+100\s*-\s*140\b/,
    /Post[\s-]*Lunch\s*\/\s*Post[\s-]*Prandial\s+Glucose[\s\S]{0,120}?([0-9]+(?:\.[0-9]+)?)/i,
    /\b(?:PPBS|PLBS)\b[\s\S]{0,80}?([0-9]+(?:\.[0-9]+)?)/i
  ]);
  return { fbs, ppbs: ppbsLoose || ppbsHard };
}

function parseLabSummaryFromRaw(labRawText) {
  const t = cleanLabText(labRawText);
  if (!t) return {};
  const thyroidTripletMatch = String(t || "").match(
    /([0-9]+(?:\.[0-9]+)?)\s+Adult:\s*0\.75\s*-\s*2\.1\s*ng\/mL[\s\S]{0,140}?([0-9]+(?:\.[0-9]+)?)\s+Adult:\s*5\.0\s*-\s*13\.0\s*ug\/dL[\s\S]{0,140}?([0-9]+(?:\.[0-9]+)?)\s+0\.3\s*-\s*4\.5\s*IU\/mL/i
  );
  const thyroidTriplet = {
    t3: thyroidTripletMatch?.[1] || "",
    t4: thyroidTripletMatch?.[2] || "",
    tsh: thyroidTripletMatch?.[3] || ""
  };

  const hemo = sectionBetween(t, "Haemogram and ESR");
  const lftSec = sectionBetween(t, "Bilirubin Total");
  const rftSec = sectionBetween(t, "Renal Function Tests");
  const lipidSec = sectionBetween(t, "Lipid Profile");
  const urineSec = sectionBetween(t, "Urine Examination");
  const thyroidSec = sectionBetween(t, "0.3 - 4.5 IU/mL");
  const glucoseSec = sectionBetween(t, "Fasting Glucose");
  const hbaSec = sectionBetween(t, "Glycosylated Haemoglobin");
  const hormonalSec = sectionBetween(t, "Serum FSH");
  const vitaminDSec = sectionBetween(t, "Deficiency : less than 20");

  const tc = flaggedValueFromSection(lipidSec, "Total Cholesterol", "mg/dL");
  const ldl = flaggedValueFromSection(lipidSec, "LDL Cholesterol", "mg/dL");
  const hdl = flaggedValueFromSection(lipidSec, "HDL Cholesterol", "mg/dL");
  const tg = flaggedValueFromSection(lipidSec, "Triglycerides", "mg/dL");
  const vldl = flaggedValueFromSection(lipidSec, "VLDL Cholesterol", "mg/dL");
  const tcHdl = flaggedValueFromSection(lipidSec, "Total Cholesterol\\/HDL Ratio", "");
  const ldlHdl = flaggedValueFromSection(lipidSec, "LDL Cholesterol\\/HDL Ratio", "");
  const lftSgotSgptFallback = (() => {
    const m = String(lftSec || "").match(/Up to\s*34\s+([0-9]+(?:\.[0-9]+)?)\s+[A-Za-z ]*U\/L[\s\S]{0,120}?Up to\s*31\s+([0-9]+(?:\.[0-9]+)?)\s+[A-Za-z ]*U\/L/i);
    if (m) return { sgot: m[1] || "", sgpt: m[2] || "" };
    const n = String(lftSec || "").match(/Bilirubin[\s\S]{0,260}?([0-9]+(?:\.[0-9]+)?)\s+[A-Za-z ]*U\/L[\s\S]{0,120}?([0-9]+(?:\.[0-9]+)?)\s+[A-Za-z ]*U\/L/i);
    if (n) return { sgot: n[1] || "", sgpt: n[2] || "" };
    return { sgot: "", sgpt: "" };
  })();

  const glucoseTableFallback = extractGlucoseRows(t);

  const cue = [
    captureNumberWithUnit(urineSec, "\\bpH\\b", "") ? `pH ${captureNumberWithUnit(urineSec, "\\bpH\\b", "")}` : "",
    captureNumberWithUnit(urineSec, "Specific Gravity", "") ? `SG ${captureNumberWithUnit(urineSec, "Specific Gravity", "")}` : "",
    (() => {
      const v = firstCapture(urineSec, [
        /MICROSCOPIC EXAMINATION[\s\S]{0,160}?Up to\s*5\s+([0-9]+\s*-\s*[0-9]+\s*\/Hpf)/i,
        /Pus\s*Cells\s+([0-9]+\s*-\s*[0-9]+\s*\/Hpf)/i,
        /WBCs?\s+([0-9]+\s*-\s*[0-9]+\s*\/Hpf)/i,
        /Urine Examination[\s\S]{0,500}?Up to\s*5\s+([0-9]+\s*-\s*[0-9]+\s*\/Hpf)/i
      ]);
      return v ? `Pus cells ${v}` : "";
    })(),
    (() => {
      const v = firstCapture(urineSec, [
        /Epithelial Cells\s+([0-9]+\s*-\s*[0-9]+\s*\/Hpf)/i,
        /Up to\s*5\s+[0-9]+\s*-\s*[0-9]+\s*\/Hpf\s+0\s*-\s*2\s+Epithelial Cells\s+([0-9]+\s*-\s*[0-9]+\s*\/Hpf)/i
      ]) || firstCapture(t, [/Urine Examination[\s\S]{0,700}?Epithelial Cells\s+([0-9]+\s*-\s*[0-9]+\s*\/Hpf)/i]);
      return v ? `Epithelial cells ${v}` : "";
    })()
  ]
    .filter(Boolean)
    .map((x) => oneLine(String(x)).slice(0, 80))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(" | ");

  return {
    cbp: [
      (() => { const v = flaggedValueFromSection(hemo, "Haemoglobin", "gm/dL|g/dL"); return v ? `Hb ${v}` : ""; })(),
      (() => { const v = flaggedValueFromSection(hemo, "Platelet Count", "10\\^3/L"); return v ? `Platelets ${v}` : ""; })(),
      (() => { const v = flaggedValueFromSection(hemo, "\\b(?:LEUCOCYTES|WBC)\\b", "10\\^3/L"); return v ? `WBC ${v}` : ""; })(),
      (() => {
        const v = flaggedValueFromSection(hemo, "E\\.?S\\.?R\\.?\\s*-?\\s*I\\s*Hr\\.", "mm");
        return v ? `ESR ${v}` : "";
      })(),
      (() => {
        const rbc = firstCapture(hemo, [/PERIPHERAL SMEAR[\s\S]{0,180}?RBC\s+([A-Za-z ]{5,80})/i]);
        const wbc = firstCapture(hemo, [/PERIPHERAL SMEAR[\s\S]{0,180}?WBC\s+([A-Za-z ]{5,80})/i]);
        const plt = firstCapture(hemo, [/PERIPHERAL SMEAR[\s\S]{0,180}?Platelets\s+([A-Za-z ]{5,80})/i]);
        const parts = [];
        const rbcClean = cleanSmearValue(rbc);
        const wbcClean = oneLine(String(wbc || "")).replace(/\bPlatelets\b[\s\S]*$/i, "").trim();
        const pltClean = oneLine(String(plt || "")).replace(/\bReq\b[\s\S]*$/i, "").trim();
        if (rbcClean) parts.push(`RBC ${rbcClean}`);
        if (wbcClean) parts.push(`WBC ${wbcClean}`);
        if (pltClean) parts.push(`Platelets ${pltClean}`);
        return parts.join(" | ");
      })()
    ].filter(Boolean).join(" | "),
    lft: [
      (() => { const v = flaggedValueFromSection(lftSec, "Bilirubin Total", "mg/dL"); return v ? `Bilirubin ${v}` : ""; })(),
      (() => { const v = flaggedValueFromSection(lftSec, "Direct Bilirubin", "mg/dL"); return v ? `Direct ${v}` : ""; })(),
      (() => { const v = flaggedValueFromSection(lftSec, "Indirect Bilirubin", "mg/dL"); return v ? `Indirect ${v}` : ""; })(),
      (() => {
        const v = flaggedValueFromSection(lftSec, "\\b(?:AST|SGOT)\\b", "U/L") || lftSgotSgptFallback.sgot;
        return v ? `SGOT ${v}` : "";
      })(),
      (() => {
        const v = flaggedValueFromSection(lftSec, "\\b(?:ALT|SGPT)\\b", "U/L") || lftSgotSgptFallback.sgpt;
        return v ? `SGPT ${v}` : "";
      })(),
      (() => { const v = flaggedValueFromSection(lftSec, "Albumin", "g/dL"); return v ? `Albumin ${v}` : ""; })(),
      (() => { const v = flaggedValueFromSection(lftSec, "Globulin", "g/dL"); return v ? `Globulin ${v}` : ""; })()
    ].filter(Boolean).join(" | "),
    rft: [
      (() => { const v = flaggedValueFromSection(rftSec, "Urea", "mg/dL"); return v ? `Urea ${v}` : ""; })(),
      (() => { const v = flaggedValueFromSection(rftSec, "Creatinine", "mg/dL"); return v ? `Creatinine ${v}` : ""; })(),
      (() => { const v = flaggedValueFromSection(rftSec, "Sodium", "mmol/L"); return v ? `Na ${v}` : ""; })(),
      (() => { const v = flaggedValueFromSection(rftSec, "Potassium", "mmol/L"); return v ? `K ${v}` : ""; })(),
      (() => { const v = flaggedValueFromSection(rftSec, "Chloride", "mmol/L"); return v ? `Cl ${v}` : ""; })()
    ].filter(Boolean).join(" | "),
    uricAcid: flaggedValueFromSection(rftSec, "Uric Acid", "mg/dL"),
    lipid: [
      tc ? `TC ${tc}` : "",
      ldl ? `LDL ${ldl}` : "",
      hdl ? `HDL ${hdl}` : "",
      tg ? `TG ${tg}` : "",
      vldl ? `VLDL ${vldl}` : "",
      tcHdl ? `TC/HDL ${tcHdl}` : "",
      ldlHdl ? `LDL/HDL ${ldlHdl}` : ""
    ].filter(Boolean).join(" | "),
    vitaminD: flaggedValueFromSection(vitaminDSec, "\\b(?:25-Hydroxyvitamin D|Vitamin D)\\b", "ng/mL") || captureValueBeforeLabel(vitaminDSec, "\\b(?:25-Hydroxyvitamin D|Vitamin D)\\b", "ng/mL"),
    t3: captureNumberWithUnit(thyroidSec, "\\bT3\\b", "ng/mL") || thyroidTriplet.t3,
    t4: captureNumberWithUnit(thyroidSec, "\\bT4\\b", "ug/dL|µg/dL") || thyroidTriplet.t4,
    tsh: captureNumberWithUnit(thyroidSec, "\\bTSH\\b", "IU/mL|µIU/mL") || thyroidTriplet.tsh,
    fbs:
      flaggedValueFromSection(glucoseSec, "Fasting Glucose", "mg/dL") ||
      captureValueBeforeLabel(glucoseSec, "Fasting Glucose", "mg/dL") ||
      captureTrailingValueAfterLabel(glucoseSec, "Fasting Glucose", "mg/dL") ||
      glucoseTableFallback.fbs,
    ppbs:
      flaggedValueFromSection(glucoseSec, "Post-Lunch\\s*\\/\\s*Post-\\s*Prandial Glucose", "mg/dL") ||
      flaggedValueFromSection(glucoseSec, "(?:PPBS|PLBS|Post\\s*Prandial\\s*Blood\\s*Glucose)", "mg/dL") ||
      captureValueBeforeLabel(glucoseSec, "Post-Lunch\\s*\\/\\s*Post-\\s*Prandial Glucose", "mg/dL") ||
      captureValueBeforeLabel(glucoseSec, "(?:PPBS|PLBS|Post\\s*Prandial\\s*Blood\\s*Glucose)", "mg/dL") ||
      captureTrailingValueAfterLabel(glucoseSec, "Post-Lunch\\s*\\/\\s*Post-\\s*Prandial Glucose", "mg/dL") ||
      captureTrailingValueAfterLabel(glucoseSec, "(?:PPBS|PLBS|Post\\s*Prandial\\s*Blood\\s*Glucose)", "mg/dL") ||
      captureValueBeforeLabel(t, "Post-Lunch\\s*\\/\\s*Post-\\s*Prandial Glucose", "mg/dL") ||
      captureValueBeforeLabel(t, "(?:PPBS|PLBS|Post\\s*Prandial\\s*Blood\\s*Glucose)", "mg/dL") ||
      firstCapture(glucoseSec, [/([0-9]+(?:\.[0-9]+)?)\s+100\s*-\s*140[\s\S]{0,60}?Post-Lunch\s*\/\s*Post-\s*Prandial Glucose/i]) ||
      glucoseTableFallback.ppbs,
    hba1c: flaggedValueFromSection(hbaSec, "Glycosylated Haemoglobin", "%"),
    hormonal: (() => {
      const v = flaggedValueFromSection(hormonalSec, "\\bFSH\\b", "mIU/mL") || captureValueBeforeLabel(hormonalSec, "\\bFSH\\b", "mIU/mL");
      return v ? `FSH ${v}` : "";
    })(),
    cue,
    others: [
      (() => {
        const v = flaggedValueFromSection(lipidSec, "Total Cholesterol", "mg/dL");
        return String(v).includes("[[B]]") ? `TC ${stripBoldMarkers(v)}` : "";
      })(),
      (() => {
        const v = flaggedValueFromSection(lipidSec, "Triglycerides", "mg/dL");
        return String(v).includes("[[B]]") ? `TG ${stripBoldMarkers(v)}` : "";
      })(),
      (() => {
        const v = flaggedValueFromSection(lipidSec, "VLDL Cholesterol", "mg/dL");
        return String(v).includes("[[B]]") ? `VLDL ${stripBoldMarkers(v)}` : "";
      })(),
      (() => {
        const v = flaggedValueFromSection(hemo, "Absolute Lymphocyte Count", "10\\^3/L");
        return String(v).includes("[[B]]") ? `ALC ${stripBoldMarkers(v)} 10^3/L` : "";
      })(),
      (() => {
        const v = flaggedValueFromSection(glucoseSec, "Fasting Glucose", "mg/dL");
        return String(v).includes("[[B]]") ? `FBS ${stripBoldMarkers(v)}` : "";
      })(),
      (() => {
        const v = flaggedValueFromSection(glucoseSec, "Post-Lunch\\s*\\/\\s*Post-\\s*Prandial Glucose", "mg/dL");
        return String(v).includes("[[B]]") ? `PPBS ${stripBoldMarkers(v)}` : "";
      })(),
      (() => {
        const v = flaggedValueFromSection(hbaSec, "Glycosylated Haemoglobin", "%");
        return String(v).includes("[[B]]") ? `HbA1c ${stripBoldMarkers(v)}` : "";
      })()
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" | ")
  };
}

function parsePatientFromLabRaw(labRawText) {
  const t = cleanLabText(labRawText);
  const name = firstCapture(t, [
    /\bName:\s*([A-Za-z .]+?)\s+Age\/Gender:/i,
    /Age\/Gender:\s*(?:Mr|Ms|Mrs)\.?\s*([A-Za-z .]+?)\s+\d+\s+Years/i,
    /Age\/Gender:\s*([A-Za-z .]+?)\s+\d+\s+Years/i,
    /\bMs\.\s*([A-Za-z .]+?)\s+\d+\s+Years/i
  ]);
  const age = firstCapture(t, [/(\d{1,3})\s+Years\s*\/\s*(?:Male|Female)/i]);
  const sex = firstCapture(t, [/\d{1,3}\s+Years\s*\/\s*(Male|Female)/i]);
  return { name, age, sex };
}

function parseGroupingFromLabRaw(labRawText) {
  const t = cleanLabText(labRawText);
  const bg = firstCapture(t, [/Blood Group\s+\"?\s*([ABO]{1,2})\s*\"?/i]);
  const rh = firstCapture(t, [/RH Typing\s+(Positive|Negative)/i]);
  return [bg, rh].filter(Boolean).join(" ");
}

function looksLikeUnicodeGibberish(text) {
  const s = String(text || "");
  if (!s) return false;
  if (/[尀屜琀昀崀䠀儀]/.test(s)) return true;
  const weird = (s.match(/[\u2E80-\u9FFF]/g) || []).length; // CJK range
  return weird > 20;
}

async function extractTextWithPyMuPDF(pdfBuffer) {
  const tmpPdf = path.join(os.tmpdir(), `labbit-rad-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  const py = `
import json, sys
pdf_path = sys.argv[1]
text = ""
meta = {"engine":"pymupdf","ocr_used":False,"ocr_error":""}
try:
    import fitz
    doc = fitz.open(pdf_path)
    parts = []
    for p in doc:
        parts.append(p.get_text("text") or "")
    text = "\\n".join(parts)
    doc.close()
except Exception as e:
    print(json.dumps({"ok":False,"error":f"pymupdf_failed:{e}"}))
    raise SystemExit(0)

def gibberish(s):
    if not s:
        return True
    marks = ["尀","屜","琀","昀","崀","䠀","儀"]
    if any(m in s for m in marks):
        return True
    cjk = sum(1 for ch in s if 0x2E80 <= ord(ch) <= 0x9FFF)
    return cjk > 20

if gibberish(text):
    try:
        import pytesseract
        from PIL import Image
        import io
        import fitz
        meta["ocr_used"] = True
        doc = fitz.open(pdf_path)
        ocr_parts = []
        for p in doc:
            pix = p.get_pixmap(matrix=fitz.Matrix(2,2), alpha=False)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            ocr_parts.append(pytesseract.image_to_string(img))
        doc.close()
        ocr_text = "\\n".join(ocr_parts).strip()
        if ocr_text:
            text = ocr_text
    except Exception as oe:
        meta["ocr_error"] = str(oe)

print(json.dumps({"ok":True,"text":text,"meta":meta}))
`;
  try {
    await writeFile(tmpPdf, Buffer.from(pdfBuffer));
    const { stdout } = await execFileAsync("python3", ["-c", py, tmpPdf], { maxBuffer: 20 * 1024 * 1024 });
    const parsed = JSON.parse(String(stdout || "{}").trim() || "{}");
    if (!parsed?.ok) return { text: "", meta: { engine: "pymupdf", error: parsed?.error || "unknown" } };
    return { text: String(parsed?.text || ""), meta: parsed?.meta || { engine: "pymupdf" } };
  } catch (error) {
    return { text: "", meta: { engine: "pymupdf", error: error?.message || String(error) } };
  } finally {
    try { await unlink(tmpPdf); } catch {}
  }
}

function firstCapture(text, patterns = []) {
  for (const rx of patterns) {
    const m = String(text || "").match(rx);
    if (m?.[1]) return oneLine(m[1]);
  }
  return "";
}

const REPORT_SECTION_MARKERS = [
  "ECG",
  "2D ECHO",
  "ECHO",
  "USG ABDOMEN",
  "ULTRASOUND SCAN OF ABDOMEN",
  "CHEST X-RAY",
  "X-RAY",
  "CHEST PA VIEW",
  "PA VIEW",
  "TMT",
  "MAMMOGRAM",
  "MAMMOGRAPHY",
  "PAP SMEAR",
  "PAP",
  "IMPRESSION",
  "FINDINGS",
  "CONCLUSION"
];

function sectionSlice(text, sectionLabel) {
  const body = normalizeSearchText(text);
  const startRx = new RegExp(`\\b${sectionLabel}\\b`, "i");
  const startMatch = body.match(startRx);
  if (!startMatch || startMatch.index === undefined) return "";
  const start = startMatch.index;
  const after = body.slice(start + startMatch[0].length);
  const nextMarkers = REPORT_SECTION_MARKERS
    .filter((m) => m.toLowerCase() !== String(sectionLabel).toLowerCase())
    .map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const endRx = new RegExp(`\\b(?:${nextMarkers})\\b`, "i");
  const endMatch = after.match(endRx);
  const sectionText = endMatch && endMatch.index !== undefined ? after.slice(0, endMatch.index) : after.slice(0, 600);
  return oneLine(sectionText);
}

function summarizeFromSection(text, sectionLabel, { allowLooseLine = false } = {}) {
  const sec = sectionSlice(text, sectionLabel);
  if (!sec) return "";
  const tagged = firstCapture(sec, [
    /Impression\s*[:\-]\s*([^\n]{4,240})/i,
    /Findings?\s*[:\-]\s*([^\n]{4,240})/i,
    /Conclusion\s*[:\-]\s*([^\n]{4,240})/i
  ]);
  if (tagged) return tagged;
  if (!allowLooseLine) return "";
  return firstCapture(sec, [/([A-Za-z0-9,%()\/\- ]{12,220})/i]);
}

function parseRadiologyImpressions(text, modalityHints = {}) {
  const rawBody = String(text || "");
  const body = normalizeSearchText(text);
  const echoSignature = firstCapture(body, [
    /(GOOD\s+LV\s*\/\s*RV\s+FUNCTION[\s\S]{0,260}?NO\s+PE\s*\/\s*NO\s+CLOT\s*\/\s*NO\s+VEGETATION\.?)/i
  ]);
  const tmtNegativeIschemia = firstCapture(body, [
    /(NEGATIVE\s+FOR\s+INDUCIBLE\s+ISCHEMIA)/i,
    /(POSITIVE\s+FOR\s+INDUCIBLE\s+ISCHEMIA)/i
  ]);
  const tmtExplicitImpression = firstCapture(body, [
    /TMT[\s\S]{0,1200}?Final\s*Impression\s*[:\-]?\s*([A-Za-z0-9 ,().\/\-]{4,220})/i,
    /Treadmill[\s\S]{0,1200}?Final\s*Impression\s*[:\-]?\s*([A-Za-z0-9 ,().\/\-]{4,220})/i,
    /TMT[\s\S]{0,1200}?Impression\s*[:\-]?\s*([A-Za-z0-9 ,().\/\-]{4,220})/i,
    /Treadmill[\s\S]{0,1200}?Impression\s*[:\-]?\s*([A-Za-z0-9 ,().\/\-]{4,220})/i
  ]);
  const usgFattyLiver = firstCapture(body, [
    /(IMPRESSION\s*[:\-]?\s*GRADE\s*I\s*FATTY\s*LIVER\.?)/i,
    /(GRADE\s*I\s*FATTY\s*LIVER\.?)/i,
    /(Liver[\s\S]{0,120}?increased\s+echotexture[\s\S]{0,40})/i
  ]);
  const usgImpressionOnly = firstCapture(body, [
    /USG[\s\S]{0,1200}?IMPRESSION\s*[:\-]?\s*([A-Za-z0-9 ,.\-\/]{4,200})/i,
    /ULTRASOUND\s*SCAN\s*OF\s*ABDOMEN[\s\S]{0,1200}?IMPRESSION\s*[:\-]?\s*([A-Za-z0-9 ,.\-\/]{4,200})/i
  ]);
  const cxrNormalStudy = firstCapture(body, [
    /(IMPRESSION\s*[:\-]?\s*NORMAL\s+STUDY)/i,
    /(NORMAL\s+STUDY)/i
  ]);
  const cxrImpressionOnly = firstCapture(body, [
    /X\s*-\s*RAY[\s\S]{0,1200}?IMPRESSION\s*[:\-]?\s*([A-Z][A-Za-z0-9 ,.\-\/]{3,140})/i,
    /CHEST[\s\S]{0,1200}?IMPRESSION\s*[:\-]?\s*([A-Z][A-Za-z0-9 ,.\-\/]{3,140})/i
  ]);
  const biradsScore = firstCapture(body, [
    /\bBIRADS?\s*Score\s*[:\-]?\s*([0-6])/i,
    /\bBIRADS?\s*[:\-]?\s*([0-6])/i,
    /6FRUH\s*[:\-]?\s*([0-6])/i
  ]) || firstCapture(rawBody, [/6FRUH\s*[:\-]?\s*([0-6])/i]);
  const tmtBpResting = firstCapture(body, [/\b(?:TMT[\s\S]{0,320}?)?Resting\s*BP\s*[:\-]?\s*([0-9]{2,3}\s*\/\s*[0-9]{2,3})/i]);
  const tmtBpStanding = firstCapture(body, [/\b(?:TMT[\s\S]{0,320}?)?Standing\s*BP\s*[:\-]?\s*([0-9]{2,3}\s*\/\s*[0-9]{2,3})/i]);
  const tmtBpPeak = firstCapture(body, [/\b(?:TMT[\s\S]{0,320}?)?Peak\s*BP\s*[:\-]?\s*([0-9]{2,3}\s*\/\s*[0-9]{2,3})/i]);
  const tmtBpGeneric = firstCapture(body, [/\bTMT[\s\S]{0,360}?\bBP\s*[:\-]?\s*([0-9]{2,3}\s*\/\s*[0-9]{2,3})/i]);

  const has = (k) => Boolean(modalityHints?.[k]);

  const resolvedEcho = (has("echo") || !!echoSignature)
    ? (echoSignature || summarizeFromSection(body, "2D ECHO", { allowLooseLine: true }) || summarizeFromSection(body, "ECHO", { allowLooseLine: true }))
    : "";
  const resolvedUsg = (has("usg") || !!usgImpressionOnly || !!usgFattyLiver)
    ? (usgImpressionOnly || usgFattyLiver || "")
    : "";
  const resolvedCxr = (has("chestXray") || !!cxrNormalStudy || !!cxrImpressionOnly)
    ? (cxrImpressionOnly || cxrNormalStudy)
    : "";
  const cxrFallbackFromView = firstCapture(body, [
    /X\s*-\s*RAY\s*CHEST[\s\S]{0,500}?(NORMAL\s+STUDY)/i,
    /CHEST\s*P\.?\s*A\.?\s*VIEW[\s\S]{0,500}?(NORMAL\s+STUDY)/i
  ]);
  const cleanedCxr = oneLine(String(resolvedCxr || cxrFallbackFromView || "").replace(/Page\s+\d+\s+of\s+\d+[\s\S]*$/i, "").trim());
  const safeCxr = /inducible\s+ischemia/i.test(cleanedCxr)
    ? (/\bNORMAL\s+STUDY\b/i.test(body) ? "NORMAL STUDY" : "")
    : (cleanedCxr || (/\bNORMAL\s+STUDY\b/i.test(body) ? "NORMAL STUDY" : ""));
  const resolvedTmtImpression = (has("tmt") || !!tmtNegativeIschemia || !!tmtExplicitImpression)
    ? (tmtExplicitImpression || tmtNegativeIschemia || "")
    : "";
  const resolvedMammogramImpression = (has("mammogram") || !!biradsScore)
    ? (summarizeFromSection(body, "MAMMOGRAM", { allowLooseLine: false }) || summarizeFromSection(body, "MAMMOGRAPHY", { allowLooseLine: false }))
    : "";
  const resolvedPap = has("pap")
    ? (summarizeFromSection(body, "PAP SMEAR", { allowLooseLine: true }) || summarizeFromSection(body, "PAP", { allowLooseLine: true }))
    : "";

  const rawSections = {
    ecg: has("ecg") ? (summarizeFromSection(body, "ECG") || "") : "",
    echo: resolvedEcho,
    usg: resolvedUsg,
    chestXray: safeCxr,
    tmt: resolvedTmtImpression || (has("tmt") ? firstCapture(body, [/Reason\s*for\s*stopping\s*[:\-]\s*([^\n]{3,220})/i]) : ""),
    mammogram: `${resolvedMammogramImpression}${biradsScore ? `${resolvedMammogramImpression ? " | " : ""}BIRADS ${biradsScore}` : ""}`,
    pap: resolvedPap
  };

  return {
    ecg: has("ecg") ? summarizeFromSection(body, "ECG") : "",
    echo: resolvedEcho,
    echoEf: firstCapture(body, [/\bE\.?\s*F\.?\s*[:\-]?\s*([0-9]{1,3}\s*%?)/i, /\bEF\s*[:\-]?\s*([0-9]{1,3}\s*%?)/i]),
    usg: resolvedUsg,
    chestXray: safeCxr,
    tmtStopReason: has("tmt") ? firstCapture(body, [/Reason\s*for\s*stopping\s*[:\-]\s*([^\n]{3,220})/i]) : "",
    tmtImpression: resolvedTmtImpression,
    tmtBp: tmtBpResting || tmtBpStanding || tmtBpPeak || tmtBpGeneric,
    mammogramImpression: resolvedMammogramImpression,
    mammogramBirads: biradsScore || "",
    papImpression: resolvedPap,
    rawSections
  };
}

function inferModalitiesFromStatus(statusMaybe) {
  const rows = Array.isArray(statusMaybe?.tests) ? statusMaybe.tests : [];
  const text = rows
    .map((r) => String(r?.TESTCOMPONENT || r?.testcomponent || r?.TESTNAME || r?.test_name || r?.name || "").toLowerCase())
    .join(" | ");
  return {
    ecg: /\becg\b/.test(text),
    echo: /\b2d\s*echo\b|\becho\b/.test(text),
    usg: /\busg\b|ultrasound\s*scan\s*of\s*abdomen|ultrasound\s*abdomen/.test(text),
    chestXray: /chest\s*x\s*-?\s*ray|x\s*-?\s*ray\s*pa\s*view|pa\s*view/.test(text),
    tmt: /\btmt\b|treadmill/.test(text),
    mammogram: /\bmammogram\b|\bmammography\b/.test(text),
    pap: /\bpap\b|papsmear|pap\s*smear/.test(text)
  };
}

async function extractTextWithPoppler(pdfBuffer) {
  const tmpPdf = path.join(os.tmpdir(), `labbit-poppler-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  try {
    await writeFile(tmpPdf, Buffer.from(pdfBuffer));
    const { stdout } = await execFileAsync("pdftotext", ["-layout", "-enc", "UTF-8", tmpPdf, "-"], {
      maxBuffer: 30 * 1024 * 1024
    });
    return cleanFlatText(String(stdout || ""));
  } catch {
    return "";
  } finally {
    try { await unlink(tmpPdf); } catch {}
  }
}

async function fetchRadiologyText(reqid) {
  const cleanReqid = asText(reqid);
  if (!cleanReqid) return "";

  try {
    const radUrl = getRadiologyReportUrl(cleanReqid, {
      chkrephead: "0",
      header_mode: "plain",
      without_header_background: "true"
    });
    const res = await fetchWithTimeout(radUrl, { cache: "no-store" });
    if (!res.ok) return "";
    const bytes = await res.arrayBuffer();
    const popplerText = await extractTextWithPoppler(bytes);
    if (popplerText && !looksLikeUnicodeGibberish(popplerText)) {
      return popplerText;
    }
    const py = await extractTextWithPyMuPDF(bytes);
    const pyText = cleanFlatText(py?.text || "");

    if (pyText && !looksLikeUnicodeGibberish(pyText)) {
      return pyText;
    }

    const direct = extractPdfTextLoose(bytes);
    const streamText = extractPdfStreamsText(bytes);
    return cleanFlatText(`${pyText} ${direct} ${streamText}`);
  } catch {
    return "";
  }
}

async function fetchLabText(reqid, reqno) {
  const cleanReqid = asText(reqid);
  if (!cleanReqid) return "";
  const base = String(process.env.NEOSOFT_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return "";
  try {
    const query = new URLSearchParams();
    if (asText(reqno)) query.set("reqno", asText(reqno));
    query.set("printtype", "1");
    query.set("chkrephead", "0");
    query.set("header_mode", "plain");
    query.set("without_header_background", "true");
    const labUrl = `${base}/reports/${encodeURIComponent(cleanReqid)}?${query.toString()}`;
    const res = await fetchWithTimeout(labUrl, { cache: "no-store" });
    if (!res.ok) return "";
    const bytes = await res.arrayBuffer();
    const popplerText = await extractTextWithPoppler(bytes);
    if (popplerText && !looksLikeUnicodeGibberish(popplerText)) return popplerText;
    const py = await extractTextWithPyMuPDF(bytes);
    const pyText = cleanFlatText(py?.text || "");
    if (pyText && !looksLikeUnicodeGibberish(pyText)) return pyText;
    const direct = extractPdfTextLoose(bytes);
    const streamText = extractPdfStreamsText(bytes);
    return cleanFlatText(`${pyText} ${direct} ${streamText}`);
  } catch {
    return "";
  }
}

function latestValueFromKeys(normalized, keys = []) {
  const params = Array.isArray(normalized?.parameters) ? normalized.parameters : [];
  const lowered = keys.map((k) => String(k || "").toLowerCase());
  let best = null;

  for (const p of params) {
    const key = String(p?.key || "").toLowerCase();
    const label = String(p?.display_name || "").toLowerCase();
    const matches = lowered.some((token) => key.includes(token) || label.includes(token));
    if (!matches) continue;
    const history = Array.isArray(p?.history) ? p.history : [];
    const last = history[history.length - 1];
    if (!last) continue;
    const entry = {
      date: String(last?.date || ""),
      value: last?.value,
      unit: String(p?.unit || "").trim()
    };
    if (!best || entry.date > best.date) best = entry;
  }

  if (!best || best.value === undefined || best.value === null) return "";
  return `${best.value}${best.unit ? ` ${best.unit}` : ""}`.trim();
}

function latestPairsFromKeys(normalized, specs = []) {
  const values = [];
  for (const [label, keys] of specs) {
    const value = latestValueFromKeys(normalized, keys);
    if (value) values.push(`${label} ${value}`);
  }
  return values.join(" | ");
}

function formatDate(value) {
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return asText(value);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function line(value) {
  const text = asText(value);
  return text ? esc(text) : "........................................";
}

function lineRich(value) {
  const text = asText(value);
  if (!text) return "........................................";
  const safe = esc(text)
    .replace(/\[\[B\]\]/g, "<strong>")
    .replace(/\[\[\/B\]\]/g, "</strong>");
  return safe;
}

function sectionBetween(text, startLabel) {
  const body = String(text || "");
  const start = body.search(new RegExp(startLabel, "i"));
  if (start < 0) return "";
  const tail = body.slice(start);
  const end = tail.search(/\bEnd of Report\b/i);
  return end >= 0 ? tail.slice(0, end) : tail;
}

function flaggedValueFromSection(section, labelRegex, unitRegex = "") {
  const rx = new RegExp(`${labelRegex}\\s+(H\\s+)?([0-9]+(?:\\.[0-9]+)?)\\s*(${unitRegex})?`, "i");
  const m = String(section || "").match(rx);
  if (!m) return "";
  const isHigh = Boolean(m[1] && String(m[1]).trim().toUpperCase() === "H");
  const core = `${m[2]}${m[3] ? ` ${m[3]}` : ""}`.trim();
  return isHigh ? `[[B]]${core}[[/B]]` : core;
}

function rawFooterLine(label, text) {
  const cleaned = oneLine(String(text || ""));
  const clipped = cleaned.length > 320 ? `${cleaned.slice(0, 320)}...` : cleaned;
  return `<div class="row small"><span class="label">${esc(label)}:</span> ${clipped ? esc(clipped) : "-"}</div>`;
}

function buildSummaryHtml(payload) {
  const { date, patientName, ageSex, mrno, grouping, vitals, inv, isFemale } = payload;
  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Summary Report</title>
<style>
  @page { size:A4; margin:10mm; }
  body { font-family: Arial, sans-serif; color:#111; margin:0; font-size:11px; line-height:1.28; }
  .sheet { max-width:190mm; margin:0 auto; }
  .box { border:1px solid #222; padding:8px; margin-bottom:8px; }
  .row { margin:2px 0; }
  .label { font-weight:700; }
  .mrno-row { display:flex; justify-content:flex-end; }
  h1 { font-size:16px; margin:0 0 6px 0; }
  h2 { font-size:12px; margin:0 0 4px 0; }
  .twocol { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .page-break { page-break-before: always; }
  .small { font-size:10px; }
</style></head>
<body><div class="sheet">
<h1>Summary Report</h1>
<div class="box">
<div class="row"><span class="label">Date:</span> ${line(date)}</div>
<div class="row mrno-row"><span class="label">MR No:</span>&nbsp;${line(mrno)}</div>
<div class="row"><span class="label">Patient Name:</span> ${line(patientName)}</div>
<div class="row"><span class="label">Age/Sex:</span> ${line(ageSex)}</div>
<div class="row"><span class="label">Blood Group:</span> ${line(grouping)}</div>
<div class="row"><span class="label">Occupation:</span> ${line("")}</div>
<div class="row"><span class="label">Activity:</span> ${line("")}</div>
</div>
<div class="box">
<h2>VITAL DATA</h2>
<div class="twocol">
<div>
<div class="row"><span class="label">BP:</span> ${line(vitals.bp)}</div>
<div class="row"><span class="label">PR:</span> ${line(vitals.pr)}</div>
<div class="row"><span class="label">SpO2:</span> ${line(vitals.spo2)}</div>
<div class="row"><span class="label">Height:</span> ${line(vitals.height)}</div>
</div>
<div>
<div class="row"><span class="label">Weight:</span> ${line(vitals.weight)}</div>
<div class="row"><span class="label">BMI:</span> ${line(vitals.bmi)}</div>
</div></div>
<div class="row"><span class="label">PRE-EXISTING CONDITIONS/CO-MORBIDITIES(if any):</span> ${line("")}</div>
<div class="row"><span class="label">SURGICAL HISTORY(if any):</span> ${line("")}</div>
<div class="row"><span class="label">FAMILY HISTORY:</span> ${line("")}</div>
<div class="row"><span class="label">PERSONAL HISTORY:</span> ${line("")}</div>
<div class="row"><span class="label">DRUG/FOOD ALLERGY(if any):</span> ${line("")}</div>
<div class="row"><span class="label">CURRENT MEDICATION(if any):</span> ${line("")}</div>
</div>
<div class="box page-break">
<h2>INVESTIGATIONS DONE</h2>
<div class="row"><span class="label">1. CBP(with peripheral smear):</span> ${lineRich(inv.cbp)}</div>
<div class="row"><span class="label">2. LFT:</span> ${lineRich(inv.lft)}</div>
<div class="row"><span class="label">3. RFT:</span> ${lineRich(inv.rft)}</div>
<div class="row"><span class="label">4. URIC ACID:</span> ${lineRich(inv.uricAcid)}</div>
<div class="row"><span class="label">5. LIPID PROFILE(including cardiogenic risk factor):</span> ${lineRich(inv.lipid)}</div>
<div class="row"><span class="label">6. VITAMIN D:</span> ${lineRich(inv.vitaminD)}</div>
<div class="row"><span class="label">7. THYROID PROFILE:</span> T3 - ${line(inv.t3)} | T4 - ${line(inv.t4)} | TSH - ${line(inv.tsh)}</div>
<div class="row"><span class="label">8. CUE:</span> ${lineRich(inv.cue)}</div>
<div class="row"><span class="label">9. ECG:</span> ${line(inv.ecg)}</div>
<div class="row"><span class="label">10. 2D ECHO(with EF):</span> ${line(inv.echo)} ${inv.echoEf ? `| EF ${esc(inv.echoEf)}` : ""}</div>
<div class="row"><span class="label">11. USG ABDOMEN:</span> ${line(inv.usg)}</div>
<div class="row"><span class="label">12. CHEST X-RAY:</span> ${line(inv.chestXray)}</div>
<div class="row"><span class="label">13. TMT:</span> Reason for stopping - ${line(inv.tmtStopReason)} | Impression - ${line(inv.tmtImpression)}</div>
${isFemale ? `<div class="row"><span class="label">15. MAMMOGRAM:</span> Impression - ${line(inv.mammogramImpression)} | BIRADS - ${line(inv.mammogramBirads)}</div>` : ""}
${isFemale ? `<div class="row"><span class="label">PAP SMEAR IMPRESSION:</span> ${line(inv.papImpression)}</div>` : ""}
<div class="row"><span class="label">14. HORMONAL INVESTIGATIONS:</span> ${lineRich(inv.hormonal)}</div>
<div class="row"><span class="label">15. FASTING BLOOD GLUCOSE:</span> ${lineRich(inv.fbs)}</div>
<div class="row"><span class="label">16. POST PRANDIAL BLOOD GLUCOSE:</span> ${lineRich(inv.ppbs)}</div>
<div class="row"><span class="label">17. HbA1C:</span> ${lineRich(inv.hba1c)}</div>
<div class="row"><span class="label">18. OTHERS(specify):</span> ${lineRich(inv.others)}</div>
<br/>
<div class="row"><span class="label">ADVICE:</span> ${line("")}</div>
<div class="row"><span class="label">DIETARY & EXERCISE ADVICE:</span> ${line("")}</div>
<div class="row"><span class="label">FOLLOW UP(if required):</span> ${line("")}</div>
<div class="row small">Auto-filled from lab and radiology PDFs.</div>
</div></div></body></html>`;
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
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" }
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const mrno = asText(url.searchParams.get("mrno"));
    const reqid = asText(url.searchParams.get("reqid"));
    const reqno = asText(url.searchParams.get("reqno"));
    const format = asText(url.searchParams.get("format")).toLowerCase() || "html";
    const asOfDate = asText(url.searchParams.get("asof")) || new Date().toISOString().slice(0, 10);
    const download = boolFlag(url.searchParams.get("download"), false);

    if (!mrno) return NextResponse.json({ error: "mrno is required" }, { status: 400 });

    const [statusMaybe, radText, labText] = await Promise.all([
      reqno ? getReportStatus(reqno).catch(() => null) : Promise.resolve(null),
      fetchRadiologyText(reqid),
      fetchLabText(reqid, reqno)
    ]);

    const profile = {};
    const labParsed = parseLabSummaryFromRaw(labText);
    const labPatient = parsePatientFromLabRaw(labText);
    const labGrouping = parseGroupingFromLabRaw(labText);
    const modalityHints = inferModalitiesFromStatus(statusMaybe);
    const impressions = parseRadiologyImpressions(radText, modalityHints);

    const inv = {
      cbp: labParsed.cbp || "",
      lft: labParsed.lft || "",
      rft: labParsed.rft || "",
      uricAcid: labParsed.uricAcid || "",
      lipid: labParsed.lipid || "",
      vitaminD: labParsed.vitaminD || "",
      t3: labParsed.t3 || "",
      t4: labParsed.t4 || "",
      tsh: labParsed.tsh || "",
      ecg: impressions.ecg,
      echo: impressions.echo,
      echoEf: impressions.echoEf,
      usg: impressions.usg,
      chestXray: impressions.chestXray,
      tmtStopReason: impressions.tmtStopReason,
      tmtImpression: impressions.tmtImpression,
      mammogramImpression: impressions.mammogramImpression,
      mammogramBirads: impressions.mammogramBirads,
      papImpression: impressions.papImpression,
      hormonal: labParsed.hormonal || "",
      cue: labParsed.cue || "",
      fbs: labParsed.fbs || "",
      ppbs: labParsed.ppbs || "",
      hba1c: labParsed.hba1c || "",
      others: labParsed.others || ""
    };

    const age = profile?.age !== undefined && profile?.age !== null ? String(profile.age) : asText(labPatient?.age);
    const sex = asText(profile?.gender) || asText(labPatient?.sex);
    const isFemale = /^(f|female)$/i.test(sex);
    const ageSex = [age, sex].filter(Boolean).join("/");
    const patientName =
      asText(profile?.name) ||
      asText(statusMaybe?.live_status?.patient_name) ||
      asText(labPatient?.name) ||
      firstCapture(radText, [/Age\/Gender:\s*(?:Mr|Ms|Mrs)\.?\s*([A-Za-z .]+?)\s+\d+\s+Years/i]);

    const html = buildSummaryHtml({
      date: formatDate(statusMaybe?.live_status?.test_date || asOfDate),
      mrno,
      patientName,
      ageSex,
      grouping: labGrouping,
      vitals: {
        bp: impressions.tmtBp || "",
        pr: "",
        spo2: "",
        height: "",
        weight: "",
        bmi: ""
      },
      inv,
      isFemale
    });

    const baseName = `SDRC_Summary_Report_${mrno}`;

    if (format === "pdf") {
      const pdf = await htmlToPdfBuffer(html);
      return new NextResponse(pdf, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `${download ? "attachment" : "inline"}; filename=\"${baseName}.pdf\"`,
          "cache-control": "no-store"
        }
      });
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
    return NextResponse.json({ error: error?.message || "Failed to build summary report" }, { status: 500 });
  }
}
