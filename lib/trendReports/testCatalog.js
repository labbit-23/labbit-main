import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DEFAULT_SECTION_ICONS = {
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

const DEFAULT_SUMMARY_GROUPS = [
  { type: "Cardiac", sections: ["Cardiac (Lipid)"], secondary_types: [], icon: DEFAULT_SECTION_ICONS["Cardiac (Lipid)"] },
  { type: "Liver", sections: ["Liver"], secondary_types: [], icon: DEFAULT_SECTION_ICONS.Liver },
  { type: "Diet", sections: ["Diabetes", "General Health", "Kidney"], secondary_types: ["Diet"], icon: DEFAULT_SECTION_ICONS.Diabetes },
  { type: "Vitamins & Minerals", sections: ["Vitamins & Minerals"], secondary_types: [], icon: DEFAULT_SECTION_ICONS["Vitamins & Minerals"] }
];

const DEFAULT_RULE_ICONS = {
  lipid_cardiac_risk: "https://sdrc.in/assets/ads/icons/heart.png",
  diabetes_high_risk: "https://sdrc.in/assets/ads/icons/diabetes.png",
  prediabetes_watch: "https://sdrc.in/assets/ads/icons/diabetes.png",
  kidney_function_watch: "https://sdrc.in/assets/ads/icons/kidney.png",
  thyroid_concern: "https://sdrc.in/assets/ads/icons/thyroid.png",
  anemia_deficiency_pattern: "https://sdrc.in/assets/ads/icons/cbc.png"
};

const DEFAULT_RISK_RULES = {
  stale_days_cutoff: 540,
  max_parameters_per_card: 5,
  max_followup_candidates_per_category: 6,
  max_followup_tests: 8,
  max_actionable_cards: 6,
  category_severity: {
    high_if_rule_triggered: true,
    high_if_high_count_gte: 2,
    medium_if_high_count_gte: 1,
    medium_if_low_count_gte: 1,
    positive_if_only_priority_normal: true
  },
  summary_labels: {
    rule_triggered: "Pattern-based risk rule triggered",
    high_suffix: "high",
    low_suffix: "low",
    key_markers_suffix: "key markers",
    within_target: "within target range"
  }
};

const DEFAULT_PRIORITY_MARKERS = [
  { id: "apo_a1", pattern: "\\bapo[\\s-]?a1\\b" },
  { id: "apo_b", pattern: "\\bapo[\\s-]?b\\b" },
  { id: "apolipoprotein", pattern: "\\bapolipoprotein\\b" },
  { id: "insulin_resistance", pattern: "\\binsulin\\s*resistance\\b" },
  { id: "homa", pattern: "\\bhoma\\b" },
  { id: "cortisol", pattern: "\\bcortisol\\b" },
  { id: "homocysteine", pattern: "\\bhomocysteine\\b" },
  { id: "ntprobnp", pattern: "\\bnt[\\s-]?pro[\\s-]?bnp\\b" },
  { id: "probnp", pattern: "\\bpro[\\s-]?bnp\\b" }
];

const DEFAULT_FOLLOWUP_PANELS = [
  { panel: "Lipid Profile", sections: ["Cardiac (Lipid)"], keywords: ["ldl", "hdl", "cholesterol", "triglyceride", "apolipoprotein", "homocysteine", "nt pro", "bnp"] },
  { panel: "Liver Function Tests (LFT)", sections: ["Liver"], keywords: ["ast", "alt", "gpt", "got", "ggt", "bilirubin", "liver"] },
  { panel: "Renal Function Tests (RFT)", sections: ["Kidney"], keywords: ["creatinine", "urea", "uric", "egfr", "renal"] },
  { panel: "Diabetes Panel", sections: ["Diabetes"], keywords: ["glucose", "hba1c", "insulin", "homa"] },
  { panel: "Inflammation Markers", sections: ["Inflammation"], keywords: ["esr", "crp", "hs crp", "us crp", "inflammation"] },
  { panel: "IgE", sections: [], keywords: ["ige"] },
  { panel: "Vitamin & Mineral Panel", sections: ["Vitamins & Minerals"], keywords: ["vitamin", "mineral", "b12", "d3", "calcidiol", "magnesium", "folate", "folic"] },
  { panel: "Cancer Marker Panel", sections: ["Cancer Screen"], keywords: ["psa", "cea", "ca", "tumor"] },
  { panel: "Thyroid & Hormonal Panel", sections: ["Hormonal Health", "Stress"], keywords: ["cortisol", "thyroid", "tsh", "testosterone", "hormone"] }
];

const DEFAULT_TREND_RULES = [
  {
    key: "diabetes_high_risk",
    severity: "high",
    mode: "all",
    conditions: [
      { parameter: "hba1c", latest: { gte: 6.5 } },
      { parameter: "hba1c", direction: "rising" }
    ],
    recommended_actions: ["Consult physician", "Repeat diabetes panel in 3 months"],
    offer_code: "pkg_diabetes_monitoring",
    followup_days: 90
  },
  {
    key: "prediabetes_watch",
    severity: "medium",
    mode: "all",
    conditions: [
      { parameter: "hba1c", latest: { gte: 5.7, lt: 6.5 } },
      { parameter: "hba1c", direction: "rising" }
    ],
    recommended_actions: ["Lifestyle optimization", "Retest HbA1c in 3-6 months"],
    offer_code: "pkg_preventive_metabolic",
    followup_days: 120
  },
  {
    key: "thyroid_concern",
    severity: "medium",
    mode: "any",
    conditions: [
      { parameter: "tsh", out_of_range: true },
      { parameter: "tsh", direction: "rising", delta: { gte: 1.0 } }
    ],
    recommended_actions: ["Endocrine follow-up", "Repeat thyroid profile in 3 months"],
    offer_code: "pkg_thyroid_followup",
    followup_days: 90
  },
  {
    key: "anemia_deficiency_pattern",
    severity: "medium",
    mode: "any",
    conditions: [
      { parameter: "hemoglobin", out_of_range: true },
      { parameter: "ferritin", out_of_range: true },
      { parameter: "hemoglobin", direction: "falling", delta: { lte: -0.5 } }
    ],
    recommended_actions: ["Clinician review", "Retest deficiency profile in 2-3 months"],
    offer_code: "pkg_anemia_profile",
    followup_days: 75
  },
  {
    key: "kidney_function_watch",
    severity: "high",
    mode: "any",
    conditions: [
      { parameter: "creatinine", out_of_range: true },
      { parameter: "egfr", out_of_range: true },
      { parameter: "creatinine", direction: "rising", delta: { gte: 0.2 } }
    ],
    recommended_actions: ["Physician review", "Repeat kidney profile in 3 months"],
    offer_code: "pkg_renal_monitoring",
    followup_days: 90
  },
  {
    key: "lipid_cardiac_risk",
    severity: "medium",
    mode: "any",
    conditions: [
      { parameter: "ldl", out_of_range: true },
      { parameter: "triglycerides", out_of_range: true },
      { parameter: "ldl", latest: { gte: 130 }, direction: "rising", delta: { gte: 10 } }
    ],
    recommended_actions: ["Lifestyle and physician review", "Retest lipid profile in 3-6 months"],
    offer_code: "pkg_cardiac_risk",
    followup_days: 120
  }
];

const DEFAULT_CORRELATION_RULES = [];
const DEFAULT_COMPOUND_RULES = [];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

let CATALOG = null;

function buildIndexes(catalog) {
  const bySubcompId = new Map();
  const bySubcomponent = new Map();
  const byDisplayParam = new Map();
  const priorityMarkerRegexes = [];

  for (const test of catalog.tests || []) {
    const id = String(test?.subcompid || "").trim().toUpperCase();
    if (id) bySubcompId.set(id, test);

    const subcomponent = normalizeLabel(test?.subcomponent);
    if (subcomponent && !bySubcomponent.has(subcomponent)) bySubcomponent.set(subcomponent, test);

    const displayParam = normalizeLabel(test?.display_param);
    if (displayParam && !byDisplayParam.has(displayParam)) byDisplayParam.set(displayParam, test);
  }

  for (const marker of catalog.priority_markers || []) {
    const pattern = String(marker?.pattern || "").trim();
    if (!pattern) continue;
    try {
      priorityMarkerRegexes.push(new RegExp(pattern, "i"));
    } catch {
      // ignore invalid regex from config
    }
  }

  catalog._index = {
    bySubcompId,
    bySubcomponent,
    byDisplayParam,
    priorityMarkerRegexes
  };

  return catalog;
}

export function getTrendTestCatalog() {
  if (CATALOG) return CATALOG;

  try {
    const raw = fs.readFileSync(path.resolve(__dirname, "../data/trend-report-test-catalog.json"), "utf8");
    const parsed = JSON.parse(raw);
    CATALOG = buildIndexes({
      ...parsed,
      tests: Array.isArray(parsed?.tests) ? parsed.tests : [],
      section_icons: { ...DEFAULT_SECTION_ICONS, ...(parsed?.section_icons || {}) },
      summary_groups: Array.isArray(parsed?.summary_groups) && parsed.summary_groups.length
        ? parsed.summary_groups
        : DEFAULT_SUMMARY_GROUPS,
      rule_icons: { ...DEFAULT_RULE_ICONS, ...(parsed?.rule_icons || {}) },
      risk_rules: {
        ...DEFAULT_RISK_RULES,
        ...(parsed?.risk_rules || {}),
        category_severity: {
          ...DEFAULT_RISK_RULES.category_severity,
          ...(parsed?.risk_rules?.category_severity || {})
        },
        summary_labels: {
          ...DEFAULT_RISK_RULES.summary_labels,
          ...(parsed?.risk_rules?.summary_labels || {})
        }
      },
      priority_markers: Array.isArray(parsed?.priority_markers) && parsed.priority_markers.length
        ? parsed.priority_markers
        : DEFAULT_PRIORITY_MARKERS,
      followup_panels: Array.isArray(parsed?.followup_panels) && parsed.followup_panels.length
        ? parsed.followup_panels
        : DEFAULT_FOLLOWUP_PANELS,
      trend_rules: Array.isArray(parsed?.trend_rules) && parsed.trend_rules.length
        ? parsed.trend_rules
        : DEFAULT_TREND_RULES,
      correlation_rules: Array.isArray(parsed?.correlation_rules)
        ? parsed.correlation_rules
        : DEFAULT_CORRELATION_RULES,
      compound_rules: Array.isArray(parsed?.compound_rules)
        ? parsed.compound_rules
        : DEFAULT_COMPOUND_RULES
    });
    return CATALOG;
  } catch {
    CATALOG = buildIndexes({
      version: "fallback",
      tests: [],
      section_icons: { ...DEFAULT_SECTION_ICONS },
      summary_groups: DEFAULT_SUMMARY_GROUPS,
      rule_icons: { ...DEFAULT_RULE_ICONS },
      risk_rules: { ...DEFAULT_RISK_RULES },
      priority_markers: DEFAULT_PRIORITY_MARKERS,
      followup_panels: DEFAULT_FOLLOWUP_PANELS,
      trend_rules: DEFAULT_TREND_RULES,
      correlation_rules: DEFAULT_CORRELATION_RULES,
      compound_rules: DEFAULT_COMPOUND_RULES
    });
    return CATALOG;
  }
}

export function getSectionIcon(sectionName) {
  const catalog = getTrendTestCatalog();
  return catalog.section_icons?.[String(sectionName || "").trim()] || null;
}

export function getSummaryGroups() {
  const catalog = getTrendTestCatalog();
  return Array.isArray(catalog.summary_groups) ? catalog.summary_groups : [];
}

export function getRuleIcon(ruleKey) {
  const catalog = getTrendTestCatalog();
  return catalog.rule_icons?.[String(ruleKey || "").trim()] || null;
}

export function getRiskRules() {
  const catalog = getTrendTestCatalog();
  return catalog.risk_rules || { ...DEFAULT_RISK_RULES };
}

export function getTrendRules() {
  const catalog = getTrendTestCatalog();
  return Array.isArray(catalog.trend_rules) && catalog.trend_rules.length
    ? catalog.trend_rules
    : DEFAULT_TREND_RULES;
}

export function getCorrelationRules() {
  const catalog = getTrendTestCatalog();
  return Array.isArray(catalog.correlation_rules) ? catalog.correlation_rules : DEFAULT_CORRELATION_RULES;
}

export function getCompoundRules() {
  const catalog = getTrendTestCatalog();
  return Array.isArray(catalog.compound_rules) ? catalog.compound_rules : DEFAULT_COMPOUND_RULES;
}

export function isPriorityMarker(text) {
  const catalog = getTrendTestCatalog();
  const regexes = catalog?._index?.priorityMarkerRegexes || [];
  const source = String(text || "");
  if (!source) return false;
  return regexes.some((rx) => rx.test(source));
}

export function getFollowupPanelForParameter(param = {}) {
  const catalog = getTrendTestCatalog();
  const section = String(param?.section || "").trim().toLowerCase();
  const source = `${String(param?.name || "")} ${String(param?.key || "")}`.toLowerCase();
  const sourceNormalized = source.replace(/[^a-z0-9]+/g, " ").trim();

  const keywordMatches = (keyword) => {
    const needleRaw = String(keyword || "").trim().toLowerCase();
    if (!needleRaw) return false;

    const needle = needleRaw.replace(/[^a-z0-9]+/g, " ").trim();
    if (!needle) return false;

    // Multi-word keywords should match as a phrase on normalized source.
    if (needle.includes(" ")) {
      return sourceNormalized.includes(needle);
    }

    // Single-word keywords should match whole-token boundaries only.
    const rx = new RegExp(`(^|[^a-z0-9])${needle}([^a-z0-9]|$)`, "i");
    return rx.test(source);
  };

  for (const panelRule of catalog.followup_panels || []) {
    const panel = String(panelRule?.panel || "").trim();
    if (!panel) continue;

    const sections = Array.isArray(panelRule?.sections) ? panelRule.sections : [];
    const keywords = Array.isArray(panelRule?.keywords) ? panelRule.keywords : [];

    const sectionMatch = sections.some((s) => String(s || "").trim().toLowerCase() === section);
    if (sectionMatch) return panel;

    const keywordMatch = keywords.some((k) => keywordMatches(k));
    if (keywordMatch) return panel;
  }

  return null;
}

export function findCatalogTest(param = {}) {
  const catalog = getTrendTestCatalog();
  const index = catalog._index || {};

  const componentId = String(param?.component_id || param?.subcompid || "").trim().toUpperCase();
  if (componentId && index.bySubcompId?.has(componentId)) {
    return index.bySubcompId.get(componentId);
  }

  const name = normalizeLabel(param?.name || param?.display_name);
  if (name && index.byDisplayParam?.has(name)) {
    return index.byDisplayParam.get(name);
  }

  if (name && index.bySubcomponent?.has(name)) {
    return index.bySubcomponent.get(name);
  }

  const key = normalizeLabel(param?.key);
  if (key && index.byDisplayParam?.has(key)) {
    return index.byDisplayParam.get(key);
  }
  if (key && index.bySubcomponent?.has(key)) {
    return index.bySubcomponent.get(key);
  }

  return null;
}

export function getCatalogDescription(param = {}) {
  const test = findCatalogTest(param);
  const text = String(test?.description || "").trim();
  return text || null;
}
