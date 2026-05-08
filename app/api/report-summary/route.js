import { NextResponse } from "next/server";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const NEOSOFT_BASE_URL = String(process.env.NEOSOFT_API_BASE_URL || "").replace(/\/+$/, "");
const FETCH_TIMEOUT_MS = Number(process.env.NEOSOFT_TIMEOUT_MS || 20000);

// ─── Text Cleaning ────────────────────────────────────────────────────────────

function cleanText(text = "") {
  return String(text)
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksGibberish(text = "") {
  const badMarkers = ["尀", "屜", "䐀", "儀", "嘀", "圀", "㌀"];
  if (badMarkers.some((x) => text.includes(x))) return true;
  const chars = [...text];
  const nonAscii = chars.filter((c) => c.charCodeAt(0) > 255).length;
  return chars.length > 0 && nonAscii / chars.length > 0.03;
}

// ─── PDF Extraction ───────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

async function extractWithPoppler(pdfPath) {
  const txtPath = pdfPath.replace(/\.pdf$/i, ".txt");
  // -layout preserves spatial columns — critical for our column-aware value extraction
  await execFileAsync("pdftotext", ["-layout", "-enc", "UTF-8", pdfPath, txtPath]);
  const text = await readFile(txtPath, "utf8");
  await unlink(txtPath).catch(() => {});
  return text; // return raw; cleanText applied after all pages joined
}

async function extractWithPdfjs(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: false,
  }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent({ normalizeWhitespace: true });
    text += `\n\n--- PAGE ${i} ---\n`;
    text += content.items.map((item) => item.str).join(" ");
  }
  return text;
}

async function extractTextFromBuffer(buffer) {
  let pdfPath = null;
  try {
    pdfPath = path.join(tmpdir(), `${randomUUID()}.pdf`);
    await writeFile(pdfPath, buffer);
    try {
      return await extractWithPoppler(pdfPath);
    } catch {
      return await extractWithPdfjs(buffer);
    }
  } finally {
    if (pdfPath) await unlink(pdfPath).catch(() => {});
  }
}

// ─── Core Value Extraction ────────────────────────────────────────────────────
//
// pdftotext -layout produces lines like:
//   "Haemoglobin                14.8                   Male : 13.0 - 17.0   gm/dL"
//   "MCV (Mean Corpuscular Volume)   78.3   L           83 - 101             fL"
//   "Triglycerides                   170    H           *Desirable Level..."
//
// Strategy: find the line matching the label, then grab the FIRST standalone
// number that appears after the label text ends. The H/L flag token sits
// immediately after the value in the column layout.

function matchOne(text, regex) {
  const m = String(text || "").match(regex);
  return m ? String(m[1] || "").trim() : "";
}

/**
 * extractField(page, labelRegex, opts)
 * Returns { value: string, flag: "H"|"L"|"" }
 *
 * Searches lines of `page` for one matching `labelRegex`, then:
 *  1. Takes the text after the label
 *  2. Finds the first numeric token  → value
 *  3. Checks if the immediately following token is H or L → flag
 *
 * opts.statusOk  – also accept Negative/Positive/Non-Reactive etc. as value
 * opts.combined  – also append the next line (for labels that wrap)
 */
function extractField(page, labelRegex, opts = {}) {
  const lines = String(page || "").split("\n");

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (!labelRegex.test(line)) continue;

    // Optionally include the next line for wrap cases
    const combined = opts.combined
      ? line + " " + (lines[idx + 1] || "")
      : line;

    // Strip the matched label from the front
    const afterLabel = combined.replace(labelRegex, "");

    if (opts.statusOk) {
      // Try status words first (Negative, Non-Reactive, etc.)
      const st = afterLabel.match(/\b(Non-Reactive|Reactive|Negative|Positive|Clear|Nil)\b/i);
      if (st) return { value: st[1], flag: "" };
    }

    // Find first number
    const nm = afterLabel.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!nm) continue;

    const value = nm[1];
    // Flag is the first isolated H or L token right after the number
    const rest = afterLabel.slice(afterLabel.indexOf(value) + value.length);
    const flagMatch = rest.match(/^\s*(H|L)\b/);
    const flag = flagMatch ? flagMatch[1] : "";

    return { value, flag };
  }

  return { value: "", flag: "" };
}

function fld(page, labelRegex, opts = {}) {
  return extractField(page, labelRegex, opts);
}

// ─── Page Splitting ───────────────────────────────────────────────────────────

function getPages(text = "") {
  const raw = String(text || "");

  // Form-feed (\f) is the natural page break from pdftotext -layout
  let pages = raw.split(/\f/).map((p) => p.trim()).filter(Boolean);

  if (pages.length <= 1) {
    pages = raw
      .split(
        /(?=(?:Req\.\s*No:|Name:)\s*(?:Mr\.|Ms\.|Mrs\.)?)|(?=2-D Echo Color Doppler)|(?=TREADMILL TEST SUMMARY)|(?=ULTRASOUND SCANNING)|(?=X-?\s*RAY CHEST)/i
      )
      .map((p) => p.trim())
      .filter(Boolean);
  }

  return pages;
}

function findPage(text, headingRegex) {
  return getPages(text).find((p) => headingRegex.test(p)) || "";
}

// ─── Patient ──────────────────────────────────────────────────────────────────

function extractPatient(rawText) {
  // Before cleanText, the name line looks like (pdftotext -layout):
  //   "         Name: Mr. VENKATA RAMANA NAIDU                    Sample drawn : 29/04/2026"
  // Multiple spaces separate the name from "Sample drawn". We match on the raw text
  // (spaces not yet collapsed) so we can stop at 2+ spaces.

  const name = matchOne(
    rawText,
    /Name:\s*(?:Mr\.|Ms\.|Mrs\.)?\s*([A-Z][A-Z .]{3,60}?)(?:\s{2,}|\s+Sample\s+drawn|\n|$)/im
  );

  // For everything else we can use cleanText
  const text = cleanText(rawText);

  return {
    name: name.trim(),
    ageSex: matchOne(text, /(\d+\s+Years\s*\/\s*(?:Male|Female))/i),
    reqNo:  matchOne(text, /\b(20\d{9})\b/),
    mrNo:   matchOne(text, /MR\s*No\.?\s*\.?\s*:?\s*(\d+)/i),
    date:   matchOne(text, /Requisition\s*Date\s*:?\s*([0-9/]+)/i) ||
            matchOne(text, /\b(\d{2}\/\d{2}\/\d{4})\b/),
  };
}

// ─── CBC ─────────────────────────────────────────────────────────────────────

function extractCBC(text) {
  const page = findPage(text, /Haemogram and ESR|ERYTHROCYTES/i);
  const esrPage = findPage(text, /Erythrocyte Sedimentation Rate|E\.S\.R/i) || page;

  const smearBlock = matchOne(page, /PERIPHERAL SMEAR\s*([\s\S]*?)(?:\n\n|Page \d|Checked|$)/i);
  const smearRbc = matchOne(smearBlock, /^RBC\s+(.+)$/im);
  const smearWbc = matchOne(smearBlock, /^WBC\s+(.+)$/im);
  const smearPlt = matchOne(smearBlock, /^Platelets\s+(.+)$/im);

  return {
    hb:       fld(page, /^Haemoglobin\b/i),
    rbc:      fld(page, /^Erythrocyte\s*\(RBC\)\s*Count\b/i),
    wbc:      fld(page, /^Total Leucocytes\s*\(WBC\)\s*Count\b/i),
    // For MCV/MCH/MCHC/RDW the label ends with "(…)" so we anchor to just that prefix
    // to avoid the regex stripping "Mean" and then picking up the wrong number.
    mcv:      fld(page, /^MCV\s*\(/i),
    mch:      fld(page, /^MCH\s*\(/i),
    mchc:     fld(page, /^MCHC\s*\(/i),
    rdw:      fld(page, /^RDW-CV\s*\(/i),
    platelet: fld(page, /^Platelet Count\b/i),
    esr:      matchOne(esrPage, /E\.?S\.?R\.?\s*-\s*I\s*Hr\.?\s+([0-9]+(?:\.[0-9]+)?)/i),
    smearRbc, smearWbc, smearPlt,
  };
}

// ─── CUE ─────────────────────────────────────────────────────────────────────

function extractCue(text) {
  const page = findPage(text, /Urine Examination/i);
  return {
    ph:       fld(page, /^pH\b/i),
    sg:       fld(page, /^Specific Gravity\b/i),
    glucose:  fld(page, /^Glucose\b/i, { statusOk: true }),
    protein:  fld(page, /^Protein\b/i, { statusOk: true }),
    // "WBCs (Pus cells)   2-3   Up to 5  /Hpf" — range like "2-3", not a plain number
    pusCells: matchOne(page, /WBCs?\s*\(Pus cells?\)\s+([0-9]+(?:-[0-9]+)?)\b/i),
  };
}

// ─── Glucose ─────────────────────────────────────────────────────────────────

function extractGlucose(text) {
  // This page uses -layout columns; use raw text (before collapse) for accuracy
  const page = findPage(text, /Fasting Glucose|Post-Lunch|Post-\s*Prandial/i);

  // "Plasma Fasting Glucose   116   H   70 - 100  mg/dL  Hexokinase"
  const fbgField = fld(page, /Fasting Glucose\b/i);

  // PP glucose: value is on the line with "Post-Lunch / Post-", label "Prandial Glucose" wraps below.
  // After cleanText: "Plasma Post-Lunch / Post- 147 H 100 - 140 mg/dL Hexokinase"
  const ppRaw = String(page).match(/Post-Lunch\s*\/\s*Post-\s+([0-9]+(?:\.[0-9]+)?)\s*(H|L)?\b/i) ||
                String(page).match(/Post-\s+([0-9]+(?:\.[0-9]+)?)\s*(H|L)?\b/i);
  const ppField = ppRaw ? { value: ppRaw[1], flag: ppRaw[2] || "" } : { value: "", flag: "" };

  const calcium = fld(page, /^Serum Calcium\b/i);
  return { fasting: fbgField, pp: ppField, calcium };
}

// ─── HbA1c ───────────────────────────────────────────────────────────────────

function extractHba1c(text) {
  const page = findPage(text, /Glycosylated Haemoglobin \(Hb A1c\)|Estimated Average Glucose|HPLC/i);
  const lines = String(page || "").split("\n").map(l => l.trim()).filter(Boolean);

  let hba1c = { value: "", flag: "" };
  let eag = { value: "", flag: "" };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip heading line: "Glycosylated Haemoglobin (Hb A1c)"
    if (/^Glycosylated Haemoglobin\s*\(Hb A1c\)/i.test(line)) {
      continue;
    }

    // Actual result line can be:
    // Glycosylated Haemoglobin 6.3 H % HPLC
    const h = line.match(/^Glycosylated Haemoglobin\s+([0-9]+(?:\.[0-9]+)?)\s*(H|L)?\b/i);
    if (h) {
      hba1c = { value: h[1], flag: h[2] || "" };
      continue;
    }

    // Sometimes value may be on next line after label
    if (/^Glycosylated Haemoglobin\s*$/i.test(line)) {
      const next = lines[i + 1] || "";
      const hn = next.match(/^([0-9]+(?:\.[0-9]+)?)\s*(H|L)?\b/i);
      if (hn) hba1c = { value: hn[1], flag: hn[2] || "" };
    }

    const e = line.match(/^Estimated Average Glucose\s*\(eAG\)\s+([0-9]+(?:\.[0-9]+)?)/i);
    if (e) {
      eag = { value: e[1], flag: "" };
    }
  }

  return { hba1c, eag };
}
// ─── Thyroid ─────────────────────────────────────────────────────────────────

function extractThyroid(text) {
  const page = findPage(text, /Thyroid Function Tests|T3|T4|TSH/i);

  return {
    t3:  fld(page, /Tri-iodothyronine.*T3/i),
    t4:  fld(page, /Thyroxine.*T4/i),
    tsh: fld(page, /Thyroid Stimulating Hormone.*TSH/i),
  };
}
// ─── LFT ─────────────────────────────────────────────────────────────────────

function extractLft(text) {
  const page = findPage(text, /LFT \(Bil|Bilirubin Total/i);
  return {
    bilTotal:    fld(page, /^Bilirubin Total\b/i),
    bilDirect:   fld(page, /^Direct Bilirubin\b/i),
    bilIndirect: fld(page, /^Indirect Bilirubin\b/i),
    sgot: fld(page, /AST.*GOT|Aspartate/i),
    sgpt: fld(page, /ALT.*GPT|Alanine/i),
    albumin:     fld(page, /^Albumin\b/i),
    globulin:    fld(page, /^Globulin\b/i),
    agRatio:     fld(page, /^A\/G Ratio\b/i),
  };
}

// ─── RFT ─────────────────────────────────────────────────────────────────────

function extractRft(text) {
  const page = findPage(text, /Renal Function Tests/i);
  return {
    urea:       fld(page, /^Urea\b(?!\s+Nitrogen)/i),   // must not match "Urea Nitrogen"
    bun:        fld(page, /^Urea Nitrogen\s*\(BUN\)\b/i),
    creatinine: fld(page, /^Creatinine\b/i),
    uricAcid:   fld(page, /^Uric Acid\b/i),
    sodium:     fld(page, /^Sodium\b/i),
    potassium:  fld(page, /^Potassium\b/i),
    chloride:   fld(page, /^Chloride\b/i),
  };
}

// ─── Lipid ───────────────────────────────────────────────────────────────────

function extractLipid(text) {
  const page = findPage(text, /Lipid Profile/i);
  return {
    tc:     fld(page, /^Total Cholesterol\b/i),
    ldl:    fld(page, /^LDL Cholesterol\b/i),
    hdl:    fld(page, /^HDL Cholesterol\b/i),
    tg:     fld(page, /^Triglycerides\b/i),
    vldl:   fld(page, /^VLDL Cholesterol\b/i),
    tcHdl:  fld(page, /^Total Cholesterol\/HDL Ratio\b/i),
    ldlHdl: fld(page, /^LDL Cholesterol\/HDL Ratio\b/i),
  };
}

// ─── Vitamins ────────────────────────────────────────────────────────────────

function extractVitaminD(text) {
  const page = findPage(text, /Vitamin D \(25-Hydroxy\)|Vitamin D 25-OH/i);
  return fld(page, /^Vitamin D 25-OH\b/i);
}

function extractVitaminB12(text) {
  const page = findPage(text, /Vitamin B12|Cyanocobalamin/i);
  if (!page) return { value: "", flag: "" };
  return fld(page, /^Vitamin B12\b|^Cyanocobalamin\b/i);
}

// ─── Hormonal ────────────────────────────────────────────────────────────────

function extractPsa(text) {
  const page = findPage(text, /Prostatic Specific Antigen/i);
  return fld(page, /^Total Prostatic Specific Antigen\b/i);
}

// ─── Blood Group ─────────────────────────────────────────────────────────────

function extractBloodGroup(text) {
  const page = findPage(text, /Blood Grouping and RH Typing/i);
  const bg = matchOne(page, /Blood Group\s+"?\s*([A-Z]{1,2})\s*"?/i);
  const rh = matchOne(page, /RH Typing\s+(Positive|Negative)/i);
  return [bg, rh].filter(Boolean).join(" ");
}

// ─── Viral Markers ────────────────────────────────────────────────────────────
// Lines look like (wide column layout):
// "Antibodies to HIV-I and HIV-II       Non-Reactive                Non-Reactive"
// After cleanText spaces collapse → "Antibodies to HIV-I and HIV-II Non-Reactive Non-Reactive"

function extractViralMarkers(text) {
  const page = findPage(text, /Viral Markers Screen/i);
  if (!page) return {};
  return {
    hiv:   matchOne(page, /Antibodies to HIV[^\n]+(Non-Reactive|Reactive|Positive|Negative)\b/i),
    hbsag: matchOne(page, /Hepatitis B surface Antigen[^\n]+(Negative|Positive|Reactive|Non-Reactive)\b/i),
    hcv:   matchOne(page, /Hepatitis C Virus Antibodies[^\n]+(Non-Reactive|Reactive|Positive|Negative)\b/i),
  };
}

// ─── Radiology / Cardiology ───────────────────────────────────────────────────

function extractRadiology(text) {
  const echo  = findPage(text, /2-?D Echo Color Doppler|2D ECHO/i);
  const tmt   = findPage(text, /TREADMILL TEST SUMMARY|TMT/i);
  const usg   = findPage(text, /ULTRASOUND SCANNING|USG ABDOMEN/i);
  const xray  = findPage(text, /X-?\s*RAY CHEST|CHEST X-RAY/i);
  const mammo = findPage(text, /MAMMOGRAM|MAMMOGRAPHY|BIRADS/i);

  const echoEf  = matchOne(echo, /E\.?F\.?\s*:?\s*([\d.]+\s*%?)/i);
  const echoImp = matchOne(echo, /IMPRESSION\s+([\s\S]*?)(?:Dr\.|Page\s+\d+\s+of\s+\d+|Note:|$)/i)
    .replace(/\n/g, " ").replace(/\s+/g, " ").trim();

  const rawTmtImp = matchOne(
    tmt,
    /Final Impression:\s*([\s\S]*?)(?:Exercise Time:|Max HR|Max BP|Workload|Dr\.|Note:|Page)/i
  )
    .replace(/\(Please refer[\s\S]*?\)/gi, "")
    .replace(/\s+/g, " ").trim()
    .replace(/^POSITIVE FOR FOR\b/i, "POSITIVE FOR");

  const tmtExercise = matchOne(tmt, /Exercise Time:\s*([^\n]+)/i).replace(/\s+/g, " ").trim();
  const tmtWorkload = matchOne(tmt, /Workload Attained\s+([^\n]+)/i).replace(/\s+/g, " ").trim();
  const tmtMaxHr    = matchOne(tmt, /Max HR Attained\s+([^\n]+)/i).replace(/\s+/g, " ").trim();
  const tmtMaxBp    = matchOne(tmt, /Max BP\s+([^\n]+)/i).replace(/\s+/g, " ").trim();

  const usgImp = matchOne(usg, /IMPRESSION\s+([\s\S]*?)(?:Dr\.|Page\s+\d+|Note:|$)/i)
    .replace(/\s+/g, " ").trim() ||
    matchOne(usg, /(GRADE\s*I\s*FATTY\s*LIVER\.?|GRADE\s*I\s*PROSTATOMEGALY\.?)/i);

  const xrayImp = matchOne(xray, /IMPRESSION:?\s*([^\n]+)/i) ||
    (/NORMAL\s+STUDY/i.test(xray) ? "NORMAL STUDY" : "");

  const mammoImp = matchOne(mammo, /IMPRESSION\s+([\s\S]*?)(?:BIRADS|Dr\.|Page|Note:|$)/i)
    .replace(/\s+/g, " ").trim();
  const birads = matchOne(mammo, /BIRADS?\s*(?:Score|Category)?:?\s*([0-9]+)/i);

  return {
    echo: echo ? [echoEf ? `EF ${echoEf}` : "", echoImp].filter(Boolean).join("; ") : "",
    tmt:  tmt ? {exerciseTime: tmtExercise, workload: tmtWorkload, maxHr: tmtMaxHr, maxBp: tmtMaxBp,  impression: rawTmtImp } : null,
    usg:  usgImp,
    xray: xrayImp,
    mammogram: [mammoImp, birads ? `BIRADS ${birads}` : ""].filter(Boolean).join("; "),
  };
}

// ─── Build Summary ────────────────────────────────────────────────────────────

function buildSummary(rawText) {
  const text = cleanText(rawText);

  // Patient extraction needs raw text (spaces not yet collapsed) for name regex
  const patient = extractPatient(rawText);

  return {
    patient,
    investigations: {
      cbc:        extractCBC(text),
      cue:        extractCue(text),
      glucose:    extractGlucose(text),
      hba1c:      extractHba1c(text),
      thyroid:    extractThyroid(text),
      lft:        extractLft(text),
      rft:        extractRft(text),
      lipid:      extractLipid(text),
      radio:      extractRadiology(text),
      vitD:       extractVitaminD(text),
      vitB12:     extractVitaminB12(text),
      psa:        extractPsa(text),
      bloodGroup: extractBloodGroup(text),
      viral:      extractViralMarkers(text),
    },
  };
}

// ─── HTML Renderer ────────────────────────────────────────────────────────────

function esc(x = "") {
  return String(x || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Render a { value, flag } field.
 * Abnormal (H or L) → bold red with flag shown.
 */
function rf(f, suffix = "") {
  if (!f || !f.value) return "";
  const txt = esc(f.value) + (suffix ? `&nbsp;${esc(suffix)}` : "");
  return (f.flag === "H" || f.flag === "L")
    ? `<strong class="abn">${txt}&nbsp;(${f.flag})</strong>`
    : txt;
}

/** Plain string value */
function rs(s) { return s ? esc(s) : ""; }

/** One table row — skipped if content is empty */
function row(label, content) {
  if (!content) return "";
  return `  <tr><td class="lbl">${esc(label)}</td><td>${content}</td></tr>\n`;
}

/** Join non-empty parts with a pipe separator */
function pipe(...parts) {
  return parts.filter(Boolean).join(" &nbsp;|&nbsp; ");
}

function renderHtml(summary) {
  const p  = summary.patient;
  const iv = summary.investigations;
  const { cbc, cue, glucose, hba1c, thyroid, lft, rft, lipid, radio, vitD, vitB12, psa, bloodGroup, viral } = iv;
  const isFemale = /female/i.test(String(p.ageSex || ""));

  // ── CBP
  const cbpStr = pipe(
    cbc.hb.value       && `Hb ${rf(cbc.hb, "g/dL")}`,
    cbc.rbc.value      && `RBC ${rf(cbc.rbc)}`,
    cbc.wbc.value      && `WBC ${rf(cbc.wbc)}`,
    cbc.mcv.value      && `MCV ${rf(cbc.mcv, "fL")}`,
    cbc.mch.value      && `MCH ${rf(cbc.mch, "pg")}`,
    cbc.mchc.value     && `MCHC ${rf(cbc.mchc)}`,
    cbc.rdw.value      && `RDW ${rf(cbc.rdw)}`,
    cbc.platelet.value && `Plt ${rf(cbc.platelet)}`,
    cbc.esr            && `ESR ${rs(cbc.esr)}`,
  );
  const smearStr = [
    cbc.smearRbc && `RBC – ${esc(cbc.smearRbc)}`,
    cbc.smearWbc && `WBC – ${esc(cbc.smearWbc)}`,
    cbc.smearPlt && `Plt – ${esc(cbc.smearPlt)}`,
  ].filter(Boolean).join(";&nbsp; ");

  // ── LFT
  const lftStr = pipe(
    lft.bilTotal.value    && `Bil ${rf(lft.bilTotal)}`,
    lft.bilDirect.value   && `D.Bil ${rf(lft.bilDirect)}`,
    lft.bilIndirect.value && `I.Bil ${rf(lft.bilIndirect)}`,
    lft.sgot.value        && `SGOT ${rf(lft.sgot)}`,
    lft.sgpt.value        && `SGPT ${rf(lft.sgpt)}`,
    lft.albumin.value     && `Alb ${rf(lft.albumin)}`,
    lft.globulin.value    && `Glob ${rf(lft.globulin)}`,
    lft.agRatio.value     && `A/G ${rf(lft.agRatio)}`,
  );

  // ── RFT
  const rftStr = pipe(
    rft.urea.value       && `Urea ${rf(rft.urea)}`,
    rft.bun.value        && `BUN ${rf(rft.bun)}`,
    rft.creatinine.value && `Creat ${rf(rft.creatinine)}`,
    rft.sodium.value     && `Na ${rf(rft.sodium)}`,
    rft.potassium.value  && `K ${rf(rft.potassium)}`,
    rft.chloride.value   && `Cl ${rf(rft.chloride)}`,
  );

  // ── Lipid
  const lipidStr = pipe(
    lipid.tc.value     && `TC ${rf(lipid.tc)}`,
    lipid.ldl.value    && `LDL ${rf(lipid.ldl)}`,
    lipid.hdl.value    && `HDL ${rf(lipid.hdl)}`,
    lipid.tg.value     && `TG ${rf(lipid.tg)}`,
    lipid.vldl.value   && `VLDL ${rf(lipid.vldl)}`,
    lipid.tcHdl.value  && `TC/HDL ${rf(lipid.tcHdl)}`,
    lipid.ldlHdl.value && `LDL/HDL ${rf(lipid.ldlHdl)}`,
  );

  // ── Thyroid
  const thyroidStr = pipe(
    thyroid.t3.value  && `T3 ${rf(thyroid.t3)}`,
    thyroid.t4.value  && `T4 ${rf(thyroid.t4)}`,
    thyroid.tsh.value && `TSH ${rf(thyroid.tsh)}`,
  );

  // ── CUE
  const cueStr = pipe(
    cue.ph.value      && `pH ${rf(cue.ph)}`,
    cue.sg.value      && `SG ${rf(cue.sg)}`,
    cue.glucose.value && `Sugar ${rf(cue.glucose)}`,
    cue.protein.value && `Protein ${rf(cue.protein)}`,
    cue.pusCells      && `Pus cells ${esc(cue.pusCells)}/Hpf`,
  );

  // ── Glucose / HbA1c
  const fbgStr  = glucose.fasting.value ? `${rf(glucose.fasting)}&nbsp;mg/dL` : "";
  const ppbgStr = glucose.pp.value      ? `${rf(glucose.pp)}&nbsp;mg/dL`      : "";
  const calcStr = glucose.calcium.value ? `${rf(glucose.calcium)}&nbsp;mg/dL` : "";
  const hba1cStr = pipe(
    hba1c.hba1c.value && `${rf(hba1c.hba1c)}%`,
    hba1c.eag.value   && `eAG ${rs(hba1c.eag.value)}&nbsp;mg/dL`,
  );

  // ── Viral
  const viralStr = pipe(
    viral.hiv   && `HIV: ${rs(viral.hiv)}`,
    viral.hbsag && `HBsAg: ${rs(viral.hbsag)}`,
    viral.hcv   && `HCV: ${rs(viral.hcv)}`,
  );

  // ── TMT
  const tmtContent = radio.tmt
    ? [
        radio.tmt.impression && `<em>Impression:</em>&nbsp;<strong>${esc(radio.tmt.impression)}</strong>`,
        radio.tmt.exerciseTime && `Exercise time:&nbsp;${esc(radio.tmt.exerciseTime)}`,
        radio.tmt.workload     && `Workload:&nbsp;${esc(radio.tmt.workload)}`,
        radio.tmt.maxHr        && `Max HR:&nbsp;${esc(radio.tmt.maxHr)}`,
        radio.tmt.maxBp        && `Max BP:&nbsp;${esc(radio.tmt.maxBp)}`,
      ].filter(Boolean).join("<br>")
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Medical Summary – ${esc(p.name || p.reqNo)}</title>
<style>
  body  { font-family: Arial, sans-serif; font-size: 13px; line-height: 1.55;
          color: #111; padding: 28px 36px; max-width: 960px; }
  h1    { font-size: 17px; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #444; border-bottom: 1px solid #ccc;
          padding-bottom: 8px; margin-bottom: 14px; }
  h2    { font-size: 12px; font-weight: bold; text-transform: uppercase;
          letter-spacing: .06em; color: #2c5f8a;
          margin: 18px 0 4px; border-bottom: 1px solid #d0dce8; padding-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; }
  td    { padding: 3px 8px; vertical-align: top; }
  td.lbl{ font-weight: bold; white-space: nowrap; width: 200px; color: #333; }
  tr:nth-child(even) td { background: #f6f9fc; }
  strong.abn { color: #c00; }
  .smear{ font-size: 11.5px; color: #555; margin-top: 2px; }
  .advice-box { border: 1px solid #ccc; border-radius: 3px;
                padding: 10px 14px; margin-top: 6px;
                min-height: 70px; color: #888; font-style: italic; }
  .sig {
    text-align: left;
    font-size: 12px;
    line-height: 2;
  }  
    .page-break {
  page-break-before: always;
  break-before: page;
}
@media print {
  .print-footer {
    position: fixed;
    bottom: 18px;
    right: 36px;
    text-align: right;
    font-size: 12px;
    line-height: 1.6;
  }
  body {
    padding-bottom: 90px;
  }
}
</style>
</head>
<body>

<h1>Health Checkup Summary</h1>
<div class="meta">
  <b>Patient:</b> ${esc(p.name || "—")} &nbsp;&nbsp;
  <b>Age / Sex:</b> ${esc(p.ageSex)} &nbsp;&nbsp;
  <b>Req No:</b> ${esc(p.reqNo)} &nbsp;&nbsp;
  <b>MR No:</b> ${esc(p.mrNo)} &nbsp;&nbsp;
  <b>Date:</b> ${esc(p.date)}
</div>

<h2>Lab Investigations</h2>
<table>
${row("CBP (peripheral smear)", cbpStr + (smearStr ? `<div class="smear">${smearStr}</div>` : ""))}
${row("LFT", lftStr)}
${row("RFT (with BUN)", rftStr)}
${row("Uric Acid", rft.uricAcid.value ? `${rf(rft.uricAcid)}&nbsp;mg/dL` : "")}
${row("Serum Calcium", calcStr)}
${row("Lipid Profile", lipidStr)}
${row("Vitamin D", vitD.value ? `${rf(vitD)}&nbsp;ng/mL` : "")}
${row("Vitamin B12", vitB12.value ? `${rf(vitB12)}&nbsp;pg/mL` : "")}
${row("Thyroid Profile", thyroidStr)}
${row("CUE", cueStr)}
${row("Fasting Blood Glucose", fbgStr)}
${row("Post Prandial Glucose", ppbgStr)}
${row("HbA1c", hba1cStr)}
${row("Hormonal", psa.value ? `PSA ${rf(psa)}&nbsp;ng/mL` : "")}
${row("Blood Group", rs(bloodGroup))}
</table>

<h2>Radiology / Cardiology</h2>
<table>
${row("Chest X-Ray", rs(radio.xray))}
${row("2D Echo (with EF)", rs(radio.echo))}
${row("USG Abdomen", rs(radio.usg))}
${radio.tmt ? row("TMT", tmtContent) : ""}
${isFemale && radio.mammogram ? row("Mammogram", rs(radio.mammogram)) : ""}
</table>

<div class="page-break"></div>
<div class="sig">
  Dr SAKETA TENNETI, MBBS<br>
  Reg. No.: 133913 (APMC)<br>
  Duty Medical Officer<br>
  Ph: 9652642952
</div>

<h2>Advice</h2>
<!--
<div class="advice-box">
  <b>Dietary &amp; Exercise Advice:</b><br><br>
  <b>Current Medications:</b><br><br>
  <b>Follow Up (if required):</b>
</div>
-->

</body>
</html>`;
}

// ─── API Sources ──────────────────────────────────────────────────────────────

async function loadPdfBuffersFromReport(reqid, reqno) {
  if (!NEOSOFT_BASE_URL) throw new Error("NEOSOFT_API_BASE_URL is not configured");
  if (!reqid) throw new Error("reqid is required");

  const common = new URLSearchParams();
  if (reqno) common.set("reqno", reqno);
  common.set("printtype", "1");
  common.set("chkrephead", "0");
  common.set("header_mode", "plain");
  common.set("without_header_background", "true");

  const reqidEnc = encodeURIComponent(reqid);
  const sources = [
    `${NEOSOFT_BASE_URL}/report/${reqidEnc}?${common.toString()}`,
    `${NEOSOFT_BASE_URL}/reports/${reqidEnc}?${common.toString()}`,
    `${NEOSOFT_BASE_URL}/radiologyreport/${reqidEnc}?chkrephead=0&header_mode=plain&without_header_background=true`,
  ];

  const buffers = [];
  let primaryError = "";
  for (let i = 0; i < sources.length; i++) {
    const res = await fetchWithTimeout(sources[i], { headers: { Accept: "application/pdf,*/*" } }).catch(() => null);
    if (!res || !res.ok) {
      if (i === 0) {
        const detail = res ? await res.text().catch(() => "") : "";
        primaryError = `Primary /report failed${res ? ` (${res.status})` : ""}${detail ? ` ${detail.slice(0, 120)}` : ""}`;
      }
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length) buffers.push(buf);
  }

  if (!buffers.length) throw new Error(primaryError || "No report PDF source available");
  return buffers;
}

// ─── Processing ───────────────────────────────────────────────────────────────

async function processText(rawText, output = "json") {
  const text = cleanText(rawText);

  if (looksGibberish(text)) {
    return NextResponse.json(
      { error: "PDF text extraction produced gibberish. OCR fallback required.", preview: text.slice(0, 1000) },
      { status: 422 }
    );
  }

  const summary = buildSummary(rawText);   // pass raw so patient name regex works
  const html    = renderHtml(summary);

  if (String(output).toLowerCase() === "html") {
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  return NextResponse.json({ ok: true, summary, html, rawTextPreview: text.slice(0, 3000) });
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

export async function GET(req) {
  try {
    const url    = new URL(req.url);
    const reqid  = String(url.searchParams.get("reqid")  || "").trim();
    const reqno  = String(url.searchParams.get("reqno")  || "").trim();
    const output = String(url.searchParams.get("output") || url.searchParams.get("format") || "html").trim();

    const buffers = await loadPdfBuffersFromReport(reqid, reqno);
    const texts   = [];
    for (const b of buffers) texts.push(await extractTextFromBuffer(b));

    return await processText(texts.join("\n\n"), output);
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to process /report PDF" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file     = formData.get("file");
    const output   = formData.get("output") || "json";

    if (!file) {
      return NextResponse.json({ error: "Missing PDF file field: file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const raw    = await extractTextFromBuffer(buffer);
    return await processText(raw, output);
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to process PDF" }, { status: 500 });
  }
}