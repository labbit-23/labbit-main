import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  findCatalogTest,
  getFollowupPanelForParameter,
  getRiskRules,
  getSectionIcon,
  getSummaryGroups,
  isPriorityMarker as isPriorityMarkerFromCatalog
} from "./testCatalog.js";

const SECTION_ORDER = [
  "Cardiac (Lipid)",
  "Diabetes",
  "Kidney",
  "Liver",
  "Vitamins & Minerals",
  "Hormonal Health",
  "Stress",
  "Cancer Screen",
  "Inflammation",
  "General Health"
];

const RULE_LABELS = {
  lipid_cardiac_risk: {
    icon: "HEART",
    title: "Cardiac Risk Watch",
    summary: "Lipid profile trend suggests cardiovascular risk needs follow-up."
  },
  diabetes_high_risk: {
    icon: "GLU",
    title: "Diabetes High Risk",
    summary: "Sugar markers are in a high-risk zone and require clinician review."
  },
  prediabetes_watch: {
    icon: "GLU",
    title: "Prediabetes Watch",
    summary: "Sugar trend is borderline and may improve with early lifestyle action."
  },
  thyroid_concern: {
    icon: "THY",
    title: "Thyroid Watch",
    summary: "Thyroid-related trend needs follow-up testing and review."
  },
  anemia_deficiency_pattern: {
    icon: "BLO",
    title: "Anemia/Deficiency Watch",
    summary: "Blood and deficiency markers suggest further evaluation is useful."
  },
  kidney_function_watch: {
    icon: "KID",
    title: "Kidney Function Watch",
    summary: "Kidney markers should be followed with repeat testing."
  }
};

const PARAMETER_META = {
  ldl: { section: "Cardiac (Lipid)", better: "lower_better" },
  hdl: { section: "Cardiac (Lipid)", better: "higher_better" },
  total_cholesterol: { section: "Cardiac (Lipid)", better: "lower_better" },
  triglycerides: { section: "Cardiac (Lipid)", better: "lower_better" },
  hba1c: { section: "Diabetes", better: "lower_better" },
  glycosylated_haemoglobin: { section: "Diabetes", better: "lower_better" },
  glycosylated_hemoglobin: { section: "Diabetes", better: "lower_better" },
  fasting_glucose: { section: "Diabetes", better: "lower_better" },
  glucose_random: { section: "Diabetes", better: "lower_better" },
  random_blood_sugar: { section: "Diabetes", better: "lower_better" },
  insulin: { section: "Diabetes", better: "lower_better" },
  homa_ir_index: { section: "Diabetes", better: "lower_better" },
  creatinine: { section: "Kidney", better: "lower_better" },
  egfr: { section: "Kidney", better: "higher_better" },
  uric_acid: { section: "Kidney", better: "range_optimal", secondary_types: ["Diet"] },
  ast_got: { section: "Liver", better: "lower_better" },
  got_ast: { section: "Liver", better: "lower_better" },
  alt_gpt: { section: "Liver", better: "lower_better" },
  ggtp_gamma_gt: { section: "Liver", better: "lower_better" },
  bilirubin_total: { section: "Liver", better: "lower_better" },
  vitamin_b12: { section: "Vitamins & Minerals", better: "higher_better" },
  folate: { section: "Vitamins & Minerals", better: "higher_better" },
  folic_acid: { section: "Vitamins & Minerals", better: "higher_better" },
  vitamin_d_25_oh_calcidiol: { section: "Vitamins & Minerals", better: "higher_better" },
  vitamin_d_calcidiol: { section: "Vitamins & Minerals", better: "higher_better" },
  cortisol_stress_hormone: { section: "Stress", better: "range_optimal" },
  cortisol: { section: "Stress", better: "range_optimal" },
  prostate_specific_antigen_psa: { section: "Cancer Screen", better: "range_optimal" },
  psa: { section: "Cancer Screen", better: "range_optimal" },
  tsh: { section: "Hormonal Health", better: "range_optimal" },
  t3: { section: "Hormonal Health", better: "range_optimal" },
  free_t3: { section: "Hormonal Health", better: "range_optimal" },
  ft3: { section: "Hormonal Health", better: "range_optimal" },
  t4: { section: "Hormonal Health", better: "range_optimal" },
  free_t4: { section: "Hormonal Health", better: "range_optimal" },
  ft4: { section: "Hormonal Health", better: "range_optimal" },
  prolactin: { section: "Hormonal Health", better: "range_optimal" },
  anti_microsomal_antibodies_tpo: { section: "Hormonal Health", better: "range_optimal" },
  thyroid_peroxidase_autoantibodies_anti_tpo_ama: { section: "Hormonal Health", better: "range_optimal" },
  testosterone: { section: "Hormonal Health", better: "range_optimal" },
  lipoprotein_a: { section: "Cardiac (Lipid)", better: "lower_better" },
  apolipoprotein_a1: { section: "Cardiac (Lipid)", better: "higher_better" },
  apolipoprotein_b: { section: "Cardiac (Lipid)", better: "lower_better" },
  n_terminal_pro_b_type_natriuretic_peptide: { section: "Cardiac (Lipid)", better: "lower_better" },
  nt_pro_bnp: { section: "Cardiac (Lipid)", better: "lower_better" },
  crp: { section: "Inflammation", better: "lower_better" },
  e_s_r_i_hr: { section: "Inflammation", better: "lower_better" },
  e_s_r: { section: "Inflammation", better: "lower_better" },
  c_reactive_proteins_crp: { section: "Inflammation", better: "lower_better" }
};

const DEFAULT_ICON_BY_SECTION = {
  "Cardiac (Lipid)": "https://sdrc.in/assets/ads/icons/heart.png",
  Diabetes: "https://sdrc.in/assets/ads/icons/diabetes.png",
  Kidney: "https://sdrc.in/assets/ads/icons/kidney.png",
  Liver: "https://sdrc.in/assets/ads/icons/liver.png",
  "Vitamins & Minerals": "https://sdrc.in/assets/ads/icons/vitamins.png",
  "Hormonal Health": "https://sdrc.in/assets/ads/icons/hormones.png",
  Stress: "https://sdrc.in/assets/ads/icons/hormones.png",
  Inflammation: "https://sdrc.in/assets/ads/icons/cbc.png",
  "General Health": "https://sdrc.in/assets/ads/icons/cbc.png",
  "Cancer Screen": "https://sdrc.in/assets/ads/icons/cancer.png"
};

function sectionIcon(sectionName) {
  return getSectionIcon(sectionName) || DEFAULT_ICON_BY_SECTION[sectionName] || null;
}

function normalizeTrendBehavior(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "lower_better" || mode === "higher_better" || mode === "range_optimal") return mode;
  if (mode === "context_only") return "range_optimal";
  return "range_optimal";
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let HEALTH_MAP = { testCategoryMap: {}, categoryIconMap: {} };
try {
  const raw = fs.readFileSync(path.resolve(__dirname, "../data/health-packages.json"), "utf8");
  const parsed = JSON.parse(raw);
  HEALTH_MAP = {
    testCategoryMap: parsed?.testCategoryMap || {},
    categoryIconMap: parsed?.categoryIconMap || {}
  };
} catch {
  // optional dataset fallback
}

let SMART_REPORT_OVERRIDES = { defaults: {}, labs: {} };
try {
  const raw = fs.readFileSync(path.resolve(__dirname, "../data/smart-report-overrides.json"), "utf8");
  const parsed = JSON.parse(raw);
  SMART_REPORT_OVERRIDES = {
    defaults: parsed?.defaults || {},
    labs: parsed?.labs || {}
  };
} catch {
  // optional overrides fallback
}

function normalizeLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeLabel(value) {
  return normalizeLabel(value)
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean);
}

const TEST_CATEGORY_NORMALIZED = Object.fromEntries(
  Object.entries(HEALTH_MAP.testCategoryMap || {}).map(([k, v]) => [normalizeLabel(k), String(v || "")])
);

const CATEGORY_LOOKUP_ENTRIES = Object.entries(TEST_CATEGORY_NORMALIZED);

function mapCategoryFromCatalog(name) {
  const key = normalizeLabel(name);
  if (!key) return null;
  if (TEST_CATEGORY_NORMALIZED[key]) return TEST_CATEGORY_NORMALIZED[key];

  const keyTokens = tokenizeLabel(key);
  if (!keyTokens.length) return null;

  let best = null;
  for (const [catalogKey, category] of CATEGORY_LOOKUP_ENTRIES) {
    if (!catalogKey) continue;
    const cTokens = tokenizeLabel(catalogKey);
    if (!cTokens.length) continue;

    const overlap = cTokens.filter((t) => keyTokens.includes(t)).length;
    if (!overlap) continue;

    const catalogCovered = overlap / cTokens.length;
    const keyCovered = overlap / keyTokens.length;
    const strongMatch = overlap >= 2 || catalogCovered >= 1 || keyCovered >= 1;
    if (!strongMatch) continue;

    const score = catalogCovered + keyCovered;
    if (!best || score > best.score) {
      best = { category, score };
    }
  }
  return best?.category || null;
}

function mapCategoryToSection(category) {
  const c = String(category || "").trim().toLowerCase();
  if (!c) return null;
  if (c === "cardiac") return "Cardiac (Lipid)";
  if (c === "diabetes") return "Diabetes";
  if (c === "kidney") return "Kidney";
  if (c === "liver") return "Liver";
  if (c === "vitamins" || c === "minerals") return "Vitamins & Minerals";
  if (c === "hormones" || c === "thyroid") return "Hormonal Health";
  if (c === "cancer screen") return "Cancer Screen";
  if (c === "general health") return "General Health";
  if (c === "iron studies") return "Vitamins & Minerals";
  return null;
}

function resolveLabOverrides(brand = null) {
  const defaults = SMART_REPORT_OVERRIDES.defaults || {};
  const labs = SMART_REPORT_OVERRIDES.labs || {};
  const labId = String(brand?.lab_id || "").trim();
  const labName = normalizeLabel(brand?.lab_name || "");

  let selected = {};
  if (labId && labs[labId]) {
    selected = labs[labId];
  } else {
    const byName = Object.entries(labs).find(([k]) => normalizeLabel(k) === labName || normalizeLabel(k) === "sdrc");
    selected = byName?.[1] || {};
  }

  return {
    sectionByKey: { ...(defaults.sectionByKey || {}), ...(selected.sectionByKey || {}) },
    sectionByName: { ...(defaults.sectionByName || {}), ...(selected.sectionByName || {}) },
    betterByKey: { ...(defaults.betterByKey || {}), ...(selected.betterByKey || {}) }
  };
}

function toDate(value) {
  const dt = new Date(value);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function formatIsoDate(value) {
  const dt = toDate(value);
  if (!dt) return null;
  return dt.toISOString().slice(0, 10);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function classifyStatus(latest, low, high, better = "range_optimal") {
  if (!Number.isFinite(latest)) return "unknown";

  const mode = String(better || "range_optimal").toLowerCase();
  if (mode === "higher_better") {
    if (Number.isFinite(low) && latest < low) return "low";
    return "normal";
  }
  if (mode === "lower_better") {
    if (Number.isFinite(high) && latest > high) return "high";
    return "normal";
  }

  if (Number.isFinite(low) && latest < low) return "low";
  if (Number.isFinite(high) && latest > high) return "high";
  if (!Number.isFinite(low) && !Number.isFinite(high)) return "unknown";
  return "normal";
}

function trendDirection(points = []) {
  if (points.length < 2) return "unknown";
  const first = toNumber(points[0]?.value);
  const last = toNumber(points[points.length - 1]?.value);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return "unknown";
  const delta = Number((last - first).toFixed(4));
  if (Math.abs(delta) <= 0.0001) return "stable";
  return delta > 0 ? "up" : "down";
}

function betterDirectionFor(key, psyntax, fallbackBetter = "range_optimal") {
  const base = fallbackBetter || PARAMETER_META[key]?.better || "range_optimal";
  const p = Number(psyntax);
  if (!Number.isFinite(p) || p === 0) return "range_optimal";
  return base;
}

function qualityFromPsyntaxLettype(psyntax, lettype, mode = "neutral") {
  if (String(mode || "neutral").toLowerCase() !== "sdrc_v1") return "neutral";
  const p = String(psyntax || "").trim();
  const l = String(lettype || "").trim().toUpperCase();
  if (!p || p === "0" || !l) return "neutral";

  // As provided by user: 
  // Bad:  PSYNTAX contains 1 ? LETTYPE H : LETTYPE L
  // Good: PSYNTAX contains 1 ? LETTYPE L : LETTYPE H
  if (p.includes("1")) {
    if (l.includes("H")) return "bad";
    if (l.includes("L")) return "good";
    return "neutral";
  }

  if (l.includes("L")) return "bad";
  if (l.includes("H")) return "good";
  return "neutral";
}

function inferSectionAndMeta(parameter = {}, mapping = {}) {
  const key = String(parameter.key || "").trim();
  const name = parameter.display_name || key;
  const nameLower = String(name || "").toLowerCase();
  const keyNorm = normalizeLabel(key);
  const nameNorm = normalizeLabel(name);
  const sectionByKey = mapping?.sectionByKey || {};
  const sectionByName = mapping?.sectionByName || {};
  const betterByKey = mapping?.betterByKey || {};

  const overriddenSection = sectionByKey[keyNorm] || sectionByName[nameNorm] || null;
  const overriddenBetter = betterByKey[keyNorm] || null;
  if (overriddenSection) {
    return {
      section: overriddenSection,
      better: overriddenBetter || "range_optimal",
      category: null,
      category_icon: sectionIcon(overriddenSection),
      secondary_types: []
    };
  }

  const catalogTest = findCatalogTest({
    component_id: parameter.component_id,
    key,
    name
  });
  if (catalogTest?.section) {
    return {
      section: String(catalogTest.section).trim(),
      better: normalizeTrendBehavior(catalogTest.trend_behavior),
      category: null,
      category_icon: sectionIcon(catalogTest.section),
      secondary_types: []
    };
  }
  const cancerMarkerRegex = /\b(psa|prostate\s*specific\s*antigen|cea|ca[-\s]?(125|15(?:\s*[\.-]\s*3)?|19(?:\s*[\.-]\s*9)?)|afp|alpha[\s-]?fetoprotein|tumou?r\s*marker)\b/;

  if (cancerMarkerRegex.test(nameLower)) {
    return {
      section: "Cancer Screen",
      better: "range_optimal",
      category: "Cancer Screen",
      category_icon: sectionIcon("Cancer Screen"),
      secondary_types: []
    };
  }

  if (/\bcortisol\b/.test(nameLower)) {
    return {
      section: "Stress",
      better: "range_optimal",
      category: "Hormones",
      category_icon: sectionIcon("Stress"),
      secondary_types: []
    };
  }

  if (/\b(random\s*blood\s*sugar|blood\s*sugar\s*random|rbs|random\s*glucose|glucose\s*random)\b/.test(nameLower)) {
    return {
      section: "Diabetes",
      better: "lower_better",
      category: "Diabetes",
      category_icon: sectionIcon("Diabetes"),
      secondary_types: []
    };
  }

  if (/\b(hba1c|glycosylated\s*ha?emoglobin)\b/.test(nameLower)) {
    return {
      section: "Diabetes",
      better: "lower_better",
      category: "Diabetes",
      category_icon: sectionIcon("Diabetes"),
      secondary_types: []
    };
  }

  if (/\b(insulin|homa)\b/.test(nameLower)) {
    return {
      section: "Diabetes",
      better: "lower_better",
      category: "Diabetes",
      category_icon: sectionIcon("Diabetes"),
      secondary_types: []
    };
  }

  if (/\buric\s*acid\b/.test(nameLower)) {
    return {
      section: "Kidney",
      better: "lower_better",
      category: "Kidney",
      category_icon: sectionIcon("Kidney"),
      secondary_types: ["Diet"]
    };
  }

  if (/\b(t3|t4|ft3|ft4|free\s*t3|free\s*t4|thyroid|tsh|anti\s*tpo|microsomal)\b/.test(nameLower)) {
    return {
      section: "Hormonal Health",
      better: "range_optimal",
      category: "Thyroid",
      category_icon: sectionIcon("Hormonal Health"),
      secondary_types: []
    };
  }

  if (/\b(prolactin|fsh|lh|estradiol|progesterone|testosterone|amh)\b/.test(nameLower)) {
    return {
      section: "Hormonal Health",
      better: "range_optimal",
      category: "Hormones",
      category_icon: sectionIcon("Hormonal Health"),
      secondary_types: []
    };
  }

  if (/\b(folate|folic\s*acid)\b/.test(nameLower)) {
    return {
      section: "Vitamins & Minerals",
      better: "higher_better",
      category: "Vitamins",
      category_icon: sectionIcon("Vitamins & Minerals"),
      secondary_types: []
    };
  }

  if (/\b(lipoprotein\s*\(?a\)?|apo[\s-]?a1|apo[\s-]?b|apolipoprotein|nt[\s-]?pro[\s-]?bnp|pro[\s-]?bnp)\b/.test(nameLower)) {
    return {
      section: "Cardiac (Lipid)",
      better: "lower_better",
      category: "Cardiac",
      category_icon: sectionIcon("Cardiac (Lipid)"),
      secondary_types: []
    };
  }

  if (/\b(free\s*)?t4\b|\bthyroxine\b|\btotal\s*t4\b/.test(nameLower)) {
    return {
      section: "Hormonal Health",
      better: "range_optimal",
      category: "Thyroid",
      category_icon: sectionIcon("Hormonal Health"),
      secondary_types: []
    };
  }

  if (/\b(ferritin|iron|tibc|transferrin)\b/.test(nameLower)) {
    return {
      section: "Vitamins & Minerals",
      better: "range_optimal",
      category: "Iron Studies",
      category_icon: "https://sdrc.in/assets/ads/icons/iron.png",
      secondary_types: []
    };
  }

  if (/\b(esr|e\.?s\.?r\.?|sedimentation|c reactive|crp|hs crp|us crp)\b/.test(nameLower)) {
    return {
      section: "Inflammation",
      better: "lower_better",
      category: "General Health",
      category_icon: sectionIcon("Inflammation"),
      secondary_types: []
    };
  }

  // Capture common LFT markers that may come in with alternate names.
  if (
    /\b(ast|alt|gpt|got|sgot|sgpt|ggt|ggtp|bilirubin|alkaline\s*phosphatase|alp|albumin|globulin|a\s*\/?\s*g\s*ratio|total\s*protein)\b/.test(nameLower) &&
    !/\burine\b/.test(nameLower)
  ) {
    return {
      section: "Liver",
      better: "range_optimal",
      category: "Liver",
      category_icon: sectionIcon("Liver"),
      secondary_types: []
    };
  }

  const fromMeta = PARAMETER_META[key] || null;
  const catalogCategory = mapCategoryFromCatalog(name);
  const fromCatalogSection = mapCategoryToSection(catalogCategory);

  const section = fromMeta?.section || fromCatalogSection || "General Health";
  const secondaryTypes = Array.isArray(fromMeta?.secondary_types) ? fromMeta.secondary_types : [];
  const icon = fromMeta
    ? sectionIcon(section)
    : ((catalogCategory ? HEALTH_MAP.categoryIconMap?.[catalogCategory] || null : null) ||
      sectionIcon(section) ||
      null);

  return {
    section,
    better: fromMeta?.better || "range_optimal",
    category: catalogCategory || null,
    category_icon: icon,
    secondary_types: secondaryTypes
  };
}

function recommendationFromParameter(param) {
  if (param.is_priority_marker && param.flag === "normal" && param.quality_flag !== "bad") {
    return `${param.name} is a key preventive marker. Track it annually in your routine follow-up.`;
  }
  if (param.quality_flag === "bad") {
    return `${param.name} is marked unfavourable in current report logic. Recheck with clinician guidance.`;
  }
  if (param.flag === "high" && param.better_direction === "lower_better") {
    return `Reduce ${param.name} with physician-guided lifestyle and repeat test.`;
  }
  if (param.flag === "low" && param.better_direction === "higher_better") {
    return `Improve ${param.name} through nutrition and follow-up testing.`;
  }
  if (param.flag === "high") {
    return `${param.name} is above reference range. Repeat and review clinically.`;
  }
  if (param.flag === "low") {
    return `${param.name} is below reference range. Clinical review is advised.`;
  }
  return `${param.name} is currently within acceptable trend limits.`;
}

function isPriorityMarker(param) {
  const text = `${param?.name || ""} ${param?.key || ""}`.trim();
  if (!text) return false;
  return isPriorityMarkerFromCatalog(text);
}

function parameterFamilyKey(param = {}) {
  const name = String(param.name || "").toLowerCase();
  const key = String(param.key || "").toLowerCase();
  const section = String(param.section || "").toLowerCase();

  if (section.includes("cardiac") || /\b(ldl|hdl|cholesterol|triglyceride|apolipoprotein|apo)\b/.test(`${name} ${key}`)) {
    return "cardiac";
  }
  if (section.includes("diabetes") || /\b(glucose|hba1c|insulin|homa)\b/.test(`${name} ${key}`)) {
    return "diabetes";
  }
  if (section.includes("kidney") || /\b(creatinine|urea|uric|egfr)\b/.test(`${name} ${key}`)) {
    return "kidney";
  }
  if (
    section.includes("liver") ||
    /\b(ast|alt|gpt|got|sgot|sgpt|bilirubin|ggt|ggtp|alkaline\s*phosphatase|alp|albumin|globulin|total\s*protein)\b/.test(
      `${name} ${key}`
    )
  ) {
    return "liver";
  }
  if (section.includes("vitamin") || /\b(vitamin|mineral|b12|calcidiol|magnesium)\b/.test(`${name} ${key}`)) {
    return "vitamins";
  }
  if (section.includes("hormonal") || section.includes("stress") || /\b(cortisol|tsh|testosterone|thyroid)\b/.test(`${name} ${key}`)) {
    return "hormonal";
  }
  return section || key || "general";
}

function normalizeParameter(parameter = {}, maxValues = 5, cutoffIso = null, psyntaxMode = "neutral", mapping = {}) {
  const history = Array.isArray(parameter.history) ? parameter.history : [];
  const ordered = history
    .filter((h) => h && h.date && Number.isFinite(Number(h.value)))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (!ordered.length) return null;

  const fullHistory = ordered.map((row) => ({
    date: formatIsoDate(row.date),
    value: toNumber(row.value),
    ref_low: toNumber(row.ref_low),
    ref_high: toNumber(row.ref_high),
    normal_text: row.normal_text || null,
    psyntax: row.psyntax ?? null,
    lettype: row.lettype ?? null
  }));

  const cutoff = cutoffIso ? new Date(cutoffIso) : null;
  const recentHistory = cutoff
    ? fullHistory.filter((row) => {
      const d = toDate(row.date);
      return d ? d >= cutoff : true;
    })
    : fullHistory.slice();

  const olderHistory = cutoff
    ? fullHistory.filter((row) => {
      const d = toDate(row.date);
      return d ? d < cutoff : false;
    })
    : [];

  const last5 = fullHistory.slice(-Math.max(2, maxValues));
  const latest = fullHistory[fullHistory.length - 1];
  const prev = fullHistory.length > 1 ? fullHistory[fullHistory.length - 2] : null;

  const latestVal = toNumber(latest?.value);
  const prevVal = toNumber(prev?.value);
  const delta = Number.isFinite(latestVal) && Number.isFinite(prevVal)
    ? Number((latestVal - prevVal).toFixed(4))
    : null;

  const key = String(parameter.key || "").trim();
  const inferred = inferSectionAndMeta(parameter, mapping);
  const better = betterDirectionFor(key, latest?.psyntax, inferred.better);
  const rawLow = toNumber(latest?.ref_low);
  const rawHigh = toNumber(latest?.ref_high);
  let effectiveLow = rawLow;
  let effectiveHigh = rawHigh;
  const latestRefText = String(latest?.normal_text || "").toLowerCase();
  const normalGtMatch = latestRefText.match(/normal[^0-9]*(?:>|&gt;|greater than|more than)\s*([0-9]+(?:\.[0-9]+)?)/i);
  const normalLtMatch = latestRefText.match(/normal[^0-9]*(?:<|&lt;|less than|up to|at most)\s*([0-9]+(?:\.[0-9]+)?)/i);

  // Handle one-sided reference ranges where one bound is sent as 0 placeholder.
  if (better === "higher_better" && normalGtMatch) {
    const threshold = toNumber(normalGtMatch[1]);
    if (Number.isFinite(threshold)) {
      effectiveLow = threshold;
      effectiveHigh = null;
    }
  }
  if (better === "lower_better" && normalLtMatch) {
    const threshold = toNumber(normalLtMatch[1]);
    if (Number.isFinite(threshold)) {
      effectiveLow = null;
      effectiveHigh = threshold;
    }
  }

  if (
    better === "higher_better" &&
    Number.isFinite(effectiveHigh) &&
    effectiveHigh <= 0 &&
    (Number.isFinite(effectiveLow) && effectiveLow > 0 || />|more than|greater than|at least/.test(latestRefText))
  ) {
    effectiveHigh = null;
  }
  if (
    better === "lower_better" &&
    Number.isFinite(effectiveLow) &&
    effectiveLow <= 0 &&
    (Number.isFinite(effectiveHigh) && effectiveHigh > 0 || /<|less than|up to|at most/.test(latestRefText))
  ) {
      effectiveLow = null;
  }

  // For range-based markers with non-usable bounds (common with phase/cycle-dependent hormones),
  // avoid false high/low classification from placeholder ranges like 0-0.
  if (better === "range_optimal") {
    const lowFinite = Number.isFinite(effectiveLow);
    const highFinite = Number.isFinite(effectiveHigh);
    const zeroZero = lowFinite && highFinite && Number(effectiveLow) === 0 && Number(effectiveHigh) === 0;
    if (zeroZero) {
      effectiveLow = null;
      effectiveHigh = null;
    }
  }

  let hasReferenceRange = false;
  if (better === "higher_better") {
    hasReferenceRange = Number.isFinite(effectiveLow);
  } else if (better === "lower_better") {
    hasReferenceRange = Number.isFinite(effectiveHigh);
  } else {
    hasReferenceRange =
      Number.isFinite(effectiveLow) &&
      Number.isFinite(effectiveHigh) &&
      Number(effectiveHigh) > Number(effectiveLow);
  }
  const analysisSkipped = !hasReferenceRange;

  if (analysisSkipped) {
    effectiveLow = null;
    effectiveHigh = null;
  }

  const flag = analysisSkipped
    ? "unknown"
    : classifyStatus(latestVal, effectiveLow, effectiveHigh, better);
  const qualityFlag = analysisSkipped
    ? "neutral"
    : qualityFromPsyntaxLettype(latest?.psyntax, latest?.lettype, psyntaxMode);

  const rawUnit = String(parameter.unit ?? "").trim();
  const unit = ["null", "<null>", "nil", "na", "n/a"].includes(rawUnit.toLowerCase()) ? null : (rawUnit || null);

  return {
    component_id: parameter.component_id || null,
    key,
    name: parameter.display_name || key,
    unit,
    section: inferred.section,
    secondary_types: inferred.secondary_types,
    category: inferred.category,
    category_icon: inferred.category_icon,
    better_direction: better,
    has_reference_range: hasReferenceRange,
    analysis_skipped: analysisSkipped,
    latest_value: latestVal,
    latest_date: latest?.date || null,
    previous_value: prevVal,
    delta,
    trend: trendDirection(fullHistory),
    ref_low: effectiveLow,
    ref_high: effectiveHigh,
    latest_reference_text: latest?.normal_text || null,
    flag,
    quality_flag: qualityFlag,
    is_priority_marker: isPriorityMarker({ key, name: parameter.display_name || key }),
    psyntax: latest?.psyntax ?? null,
    history_all: fullHistory,
    history_recent: recentHistory.length ? recentHistory : last5,
    history_older: olderHistory,
    last5
  };
}

function buildSections(parameters = []) {
  const bySection = new Map(SECTION_ORDER.map((name) => [name, []]));

  for (const param of parameters) {
    const section = bySection.has(param.section) ? param.section : "General Health";
    bySection.get(section).push(param);
  }

  return SECTION_ORDER.map((name) => ({
    name,
    parameters: (bySection.get(name) || []).sort((a, b) => {
      const weight = { high: 3, low: 2, normal: 1, unknown: 0 };
      return (weight[b.flag] || 0) - (weight[a.flag] || 0);
    })
  })).filter((section) => section.parameters.length > 0);
}

function buildTriggerInsights(evaluation = {}) {
  const triggers = Array.isArray(evaluation?.triggers) ? evaluation.triggers : [];
  return triggers.map((trigger) => {
    const meta = RULE_LABELS[trigger.key] || {
      icon: "ALR",
      title: trigger.key,
      summary: "Trend rule requires follow-up review."
    };

    return {
      key: trigger.key,
      icon: meta.icon,
      title: meta.title,
      severity: trigger.severity || "low",
      summary: meta.summary,
      actions: Array.isArray(trigger.recommended_actions) ? trigger.recommended_actions : []
    };
  });
}

function buildActionableInsights({ timeline, sections, triggerInsights, riskLevel }) {
  const riskRules = getRiskRules();
  const severityRules = riskRules?.category_severity || {};
  const summaryLabels = riskRules?.summary_labels || {};
  const maxParametersPerCard = Number(riskRules?.max_parameters_per_card) || 5;
  const maxFollowupCandidatesPerCategory = Number(riskRules?.max_followup_candidates_per_category) || 6;
  const maxFollowupTests = Number(riskRules?.max_followup_tests) || 8;
  const maxActionableCards = Number(riskRules?.max_actionable_cards) || 6;
  const staleDaysCutoff = Number(riskRules?.stale_days_cutoff) || 540;

  const allParams = sections.flatMap((section) => section.parameters || []);
  const lastTestDt = toDate(timeline?.last_test_date || timeline?.latest_recorded_at || null);
  const isFreshForAction = (param) => {
    if (!lastTestDt) return true;
    const d = toDate(param?.latest_date);
    if (!d) return true;
    const days = Math.floor((lastTestDt.getTime() - d.getTime()) / 86400000);
    return days <= staleDaysCutoff;
  };

  const categoryIcon = (category) => {
    const c = String(category || "");
    if (c === "Cardiac") return sectionIcon("Cardiac (Lipid)");
    if (c === "Diabetes") return sectionIcon("Diabetes");
    if (c === "Kidney") return sectionIcon("Kidney");
    if (c === "Liver") return sectionIcon("Liver");
    if (c === "Vitamins & Minerals") return sectionIcon("Vitamins & Minerals");
    if (c === "Hormonal & Stress") return sectionIcon("Hormonal Health");
    if (c === "Inflammation") return sectionIcon("Inflammation");
    if (c === "General Health") return sectionIcon("General Health");
    if (c === "Cancer Screen") return sectionIcon("Cancer Screen");
    return sectionIcon(c);
  };
  const groupName = (sectionName = "") => {
    const s = String(sectionName).toLowerCase();
    if (s.includes("cardiac")) return "Cardiac";
    if (s.includes("diabetes")) return "Diabetes";
    if (s.includes("kidney")) return "Kidney";
    if (s.includes("liver")) return "Liver";
    if (s.includes("vitamin")) return "Vitamins & Minerals";
    if (s.includes("hormonal") || s.includes("stress")) return "Hormonal & Stress";
    if (s.includes("inflammation")) return "Inflammation";
    return "General Health";
  };

  const groups = new Map();
  for (const param of allParams) {
    const g = groupName(param.section);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(param);
  }

  const byRuleCategory = new Set();
  for (const t of triggerInsights || []) {
    if (t.key === "lipid_cardiac_risk") byRuleCategory.add("Cardiac");
    if (t.key === "diabetes_high_risk" || t.key === "prediabetes_watch") byRuleCategory.add("Diabetes");
    if (t.key === "kidney_function_watch") byRuleCategory.add("Kidney");
  }

  const categoryCards = [];
  const followupCandidates = [];
  for (const [category, items] of groups.entries()) {
    const relevant = items
      .filter((p) => isFreshForAction(p))
      .filter((p) => p.flag === "high" || p.flag === "low" || p.quality_flag === "bad" || p.is_priority_marker)
      .sort((a, b) => {
        const score = (p) => {
          if (p.quality_flag === "bad") return 4;
          if (p.flag === "high") return 3;
          if (p.flag === "low") return 2;
          if (p.is_priority_marker) return 1;
          return 0;
        };
        return score(b) - score(a);
      });

    if (!relevant.length && !byRuleCategory.has(category)) continue;

    const highCountForSeverity = relevant.filter((p) => p.flag === "high").length;
    const lowCountForSeverity = relevant.filter((p) => p.flag === "low").length;
    const badCountForSeverity = relevant.filter((p) => p.quality_flag === "bad").length;
    const priorityOnlyOnTrack = relevant.length > 0
      && relevant.every((p) => p.is_priority_marker && p.flag === "normal" && p.quality_flag !== "bad");
    const hasRiskSignal = byRuleCategory.has(category) || highCountForSeverity > 0 || lowCountForSeverity > 0 || badCountForSeverity > 0;
    let severity = "positive";
    if (
      (severityRules.high_if_rule_triggered !== false && byRuleCategory.has(category)) ||
      highCountForSeverity >= Number(severityRules.high_if_high_count_gte ?? 2)
    ) {
      severity = "high";
    } else if (
      highCountForSeverity >= Number(severityRules.medium_if_high_count_gte ?? 1) ||
      lowCountForSeverity >= Number(severityRules.medium_if_low_count_gte ?? 1)
    ) {
      severity = "medium";
    }
    if (severityRules.positive_if_only_priority_normal !== false && priorityOnlyOnTrack) {
      severity = "positive";
    }

    const summary = [];
    if (byRuleCategory.has(category)) summary.push(summaryLabels.rule_triggered || "Pattern-based risk rule triggered");
    const highCount = relevant.filter((p) => p.flag === "high").length;
    const lowCount = relevant.filter((p) => p.flag === "low").length;
    const priorityCount = relevant.filter((p) => p.is_priority_marker).length;
    if (highCount) summary.push(`${highCount} ${summaryLabels.high_suffix || "high"}`);
    if (lowCount) summary.push(`${lowCount} ${summaryLabels.low_suffix || "low"}`);
    if (priorityCount) summary.push(`${priorityCount} ${summaryLabels.key_markers_suffix || "key markers"}`);
    if (priorityOnlyOnTrack && !hasRiskSignal) summary.push(summaryLabels.within_target || "within target range");

    categoryCards.push({
      type: "category_risk",
      category,
      // Keep category labels plain in Trends highlights.
      title: String(category || "General Health"),
      icon: categoryIcon(category),
      severity,
      text: summary.length
        ? summary.join(" · ")
        : (priorityOnlyOnTrack ? "Key markers are currently within target range" : "Within expected trend range"),
      parameters: relevant.slice(0, maxParametersPerCard).map((p) => ({
        name: p.name,
        value: p.latest_value,
        date: p.latest_date || null,
        unit: p.unit || "",
        flag: p.flag,
        quality_flag: p.quality_flag,
        is_priority_marker: !!p.is_priority_marker
      }))
    });

    const catCandidates = items
      .filter((p) => isFreshForAction(p))
      .filter((p) => p.quality_flag === "bad" || p.flag === "high" || p.flag === "low" || p.is_priority_marker)
      .sort((a, b) => {
        const score = (p) => {
          if (p.quality_flag === "bad") return 4;
          if (p.flag === "high") return 3;
          if (p.flag === "low") return 2;
          if (p.is_priority_marker) return 1;
          return 0;
        };
        return score(b) - score(a);
      })
      .slice(0, maxFollowupCandidatesPerCategory);

    for (const p of catCandidates) {
      followupCandidates.push({
        name: p.name,
        value: p.latest_value,
        date: p.latest_date || null,
        unit: p.unit || "",
        flag: p.flag,
        quality_flag: p.quality_flag,
        is_priority_marker: !!p.is_priority_marker
      });
    }
  }

  categoryCards.sort((a, b) => {
    const rank = { high: 3, medium: 2, positive: 1, low: 1 };
    return (rank[b.severity] || 0) - (rank[a.severity] || 0);
  });

  const followupMap = new Map();
  for (const test of followupCandidates) {
    const key = String(test.name || "").toLowerCase();
    if (!key) continue;
    if (!followupMap.has(key)) followupMap.set(key, test);
  }
  const followupTests = [...followupMap.values()].slice(0, maxFollowupTests);
  const followupPanels = [...new Set(followupTests.map((p) => getFollowupPanelForParameter(p)).filter(Boolean))];

  if (Number(timeline?.days_since_last_test || 0) > 90 || followupPanels.length) {
    categoryCards.push({
      type: "followup_window",
      title: "Follow-up Window",
      icon: HEALTH_MAP.categoryIconMap?.["General Health"] || null,
      severity: followupPanels.length ? "medium" : "positive",
      text: followupPanels.length
        ? "Recommended tests to re-check in your follow-up cycle."
        : `Last test is ${timeline.days_since_last_test} days old. Schedule follow-up as advised.`,
      tests_csv: followupPanels.join(", "),
      tests_list: followupPanels,
      parameters: []
    });
  }

  if (!categoryCards.length) {
    return [{
      type: "general",
      title: "Stable Snapshot",
      text: `Current risk level is ${String(riskLevel || "low").toUpperCase()} with no major out-of-range patterns.`,
      severity: "positive",
      parameters: []
    }];
  }

  return categoryCards.slice(0, maxActionableCards);
}

function buildSummaryByType(sections = []) {
  const all = sections.flatMap((section) => section.parameters || []);
  const pickTopParameters = (type, items = [], limit = 4) => {
    const names = items.map((p) => String(p?.name || "").trim()).filter(Boolean);
    if (!names.length) return [];

    // Keep Diet summary practical: ensure Uric Acid is visible when present.
    if (String(type || "").toLowerCase() === "diet") {
      const uricIdx = names.findIndex((n) => /\buric\s*acid\b/i.test(n));
      if (uricIdx >= 0) {
        const ordered = [names[uricIdx], ...names.filter((_, idx) => idx !== uricIdx)];
        return ordered.slice(0, limit);
      }
    }

    return names.slice(0, limit);
  };

  const groups = getSummaryGroups().map((group) => {
    const matchSections = new Set(
      (Array.isArray(group?.sections) ? group.sections : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    );
    const matchSecondary = new Set(
      (Array.isArray(group?.secondary_types) ? group.secondary_types : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    );
    return {
      type: group?.type || "General",
      icon: group?.icon || sectionIcon(group?.type),
      matches: (p) => {
        const sectionMatch = matchSections.has(String(p?.section || "").trim());
        if (sectionMatch) return true;
        if (!matchSecondary.size) return false;
        const secondary = Array.isArray(p?.secondary_types) ? p.secondary_types : [];
        return secondary.some((x) => matchSecondary.has(String(x || "").trim()));
      }
    };
  });

  return groups
    .map((group) => {
      const items = all.filter(group.matches);
      return {
        type: group.type,
        icon: group.icon,
        bad: items.filter((p) => p.quality_flag === "bad").length,
        high: items.filter((p) => p.flag === "high").length,
        low: items.filter((p) => p.flag === "low").length,
        normal: items.filter((p) => p.flag === "normal").length,
        unknown: items.filter((p) => p.flag !== "high" && p.flag !== "low" && p.flag !== "normal").length,
        priority: items.filter((p) => p.is_priority_marker).length,
        total: items.length,
        top_parameters: pickTopParameters(group.type, items, 4)
      };
    })
    .filter((x) => x.total > 0);
}

export function buildReportFacts({
  normalizedTrend,
  evaluation,
  includeParameterKeys = null,
  maxChartPoints = 5,
  brand = null,
  psyntaxMode = null,
  reportMode = null
}) {
  if (!normalizedTrend || typeof normalizedTrend !== "object") {
    throw new Error("buildReportFacts requires normalizedTrend");
  }

  const includeSet = Array.isArray(includeParameterKeys)
    ? new Set(includeParameterKeys.map((x) => String(x || "").trim()).filter(Boolean))
    : null;

  const asOf = toDate(normalizedTrend?.timeline?.as_of_date || new Date().toISOString().slice(0, 10)) || new Date();
  const cutoff = new Date(asOf);
  cutoff.setFullYear(cutoff.getFullYear() - 2);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const resolvedPsyntaxMode = String(psyntaxMode || brand?.psyntax_mode || "neutral").toLowerCase();
  const resolvedReportMode = String(reportMode || brand?.report_mode || "smart").toLowerCase() === "trends"
    ? "trends"
    : "smart";
  const requestedVariant = String(brand?.design_variant || "").toLowerCase();
  const resolvedDesignVariant = requestedVariant === "executive" || requestedVariant === "basic"
    ? requestedVariant
    : (resolvedReportMode === "trends" ? "executive" : "basic");

  const mapping = resolveLabOverrides(brand);
  const normalizedParams = (normalizedTrend.parameters || [])
    .map((param) => normalizeParameter(param, maxChartPoints, cutoffIso, resolvedPsyntaxMode, mapping))
    .filter(Boolean)
    .filter((param) => (includeSet ? includeSet.has(param.key) : true));

  const sections = buildSections(normalizedParams);
  const rawTriggerInsights = buildTriggerInsights(evaluation || {});
  const triggerInsights = resolvedReportMode === "trends" ? [] : rawTriggerInsights;
  const timeline = normalizedTrend.timeline || null;
  const riskLevel = resolvedReportMode === "trends" ? "low" : (evaluation?.risk_level || "low");

  const actionableInsights = buildActionableInsights({ timeline, sections, triggerInsights, riskLevel });
  const summaryByType = buildSummaryByType(sections);
  const recommendedFollowupDate =
    evaluation?.recommended_followup_date || normalizedTrend.timeline?.recommended_followup_date || null;
  const recommendedFollowupDt = toDate(recommendedFollowupDate);
  const daysSinceLastTest = Number(timeline?.days_since_last_test);
  const asOfStart = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const followupWindowLabel = recommendedFollowupDt
    ? (recommendedFollowupDt.getTime() < asOfStart.getTime() ? "IMMEDIATE" : new Intl.DateTimeFormat("en-IN", {
      month: "short",
      year: "numeric"
    }).format(recommendedFollowupDt))
    : (Number.isFinite(daysSinceLastTest) && daysSinceLastTest > 90 ? "IMMEDIATE" : "-");

  return {
    generated_at: new Date().toISOString(),
    patient: normalizedTrend.patient_profile || {},
    patient_id: normalizedTrend.patient_id || normalizedTrend.neosoft_patient_id || null,
    brand: brand && typeof brand === "object" ? brand : null,
    report_mode: resolvedReportMode,
    design_variant: resolvedDesignVariant,
    psyntax_mode: resolvedPsyntaxMode,
    timeline,
    risk_level: riskLevel,
    recommended_followup_date: recommendedFollowupDate,
    followup_window_label: followupWindowLabel,
    trigger_insights: triggerInsights,
    actionable_insights: actionableInsights,
    summary_by_type: summaryByType,
    sections
  };
}
