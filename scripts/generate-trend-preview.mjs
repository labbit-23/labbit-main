import fs from "fs";
import path from "path";
import { normalizeNeosoftTrendPayload } from "../lib/trendReports/normalizeNeosoft.js";
import { evaluateTrendRules } from "../lib/trendReports/ruleEngine.js";
import { buildReportFacts } from "../lib/trendReports/buildReportFacts.js";
import { renderReportHtml } from "../lib/trendReports/renderReportHtml.js";

function parseArgs(argv = []) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function splitCsv(value) {
  if (!value) return null;
  return String(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

const args = parseArgs(process.argv.slice(2));

const inputPath = args.input || "/Users/pav/Documents/Trend Result PV.json";
const outputPath = args.output || path.resolve(process.cwd(), "tmp/trend-preview.html");
const factsPath = args.facts || path.resolve(process.cwd(), "tmp/trend-facts.json");

const includeComponents = splitCsv(args.components);

const psyntaxAllowList = splitCsv(args.psyntax) || null;
const asOfDate = args.asof || new Date().toISOString().slice(0, 10);

const raw = fs.readFileSync(inputPath, "utf8");
const payload = JSON.parse(raw);

const normalized = normalizeNeosoftTrendPayload(payload, {
  asOfDate,
  includeComponents,
  psyntaxAllowList
});

const evaluation = evaluateTrendRules({
  normalizedTrend: normalized,
  asOfDate
});

const facts = buildReportFacts({
  normalizedTrend: normalized,
  evaluation,
  maxChartPoints: Number(args.points || 5),
  reportMode: args.reportMode || "smart",
  psyntaxMode: args.psyntaxMode || "sdrc_v1",
  brand: {
    lab_id: args.labid || "b539c161-1e2b-480b-9526-d4b37bd37b1e",
    lab_name: "SDRC",
    logo_url: args.logo || "https://sdrc.in/assets/sdrc-logo.png",
    cover_url: args.cover || "https://sdrc.in/assets/sdrc-services.png",
    report_mode: args.reportMode || "smart",
    design_variant: args.designVariant || "basic",
    psyntax_mode: args.psyntaxMode || "sdrc_v1"
  }
});

const html = renderReportHtml(facts);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.dirname(factsPath), { recursive: true });
fs.writeFileSync(outputPath, html, "utf8");
fs.writeFileSync(
  factsPath,
  JSON.stringify(
    {
      normalized,
      evaluation,
      facts
    },
    null,
    2
  ),
  "utf8"
);

console.log("Trend preview generated");
console.log("input:", inputPath);
console.log("html:", outputPath);
console.log("facts:", factsPath);
console.log("patient_id:", normalized.patient_id || normalized.neosoft_patient_id || "-");
console.log(
  "parameters:",
  Array.isArray(facts.sections) ? facts.sections.reduce((n, s) => n + (Array.isArray(s.parameters) ? s.parameters.length : 0), 0) : 0
);
console.log("sections:", Array.isArray(facts.sections) ? facts.sections.length : 0);
console.log("risk_level:", facts.risk_level);
console.log("triggers:", (facts.trigger_insights || []).map((t) => t.key).join(", ") || "none");
