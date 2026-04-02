import { getTrendRules } from "./testCatalog.js";

const STABLE_EPSILON = 0.0001;

function toDate(value) {
  const dt = new Date(value);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function toFinite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function byDateAsc(a, b) {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

function valueInRange(value, low, high) {
  if (!Number.isFinite(value)) return null;
  const hasLow = Number.isFinite(low);
  const hasHigh = Number.isFinite(high);
  if (!hasLow && !hasHigh) return null;
  if (hasLow && value < low) return false;
  if (hasHigh && value > high) return false;
  return true;
}

function compareNumeric(actual, comparator = {}) {
  if (!Number.isFinite(actual)) return false;

  if (Number.isFinite(comparator.eq) && actual !== comparator.eq) return false;
  if (Number.isFinite(comparator.gt) && !(actual > comparator.gt)) return false;
  if (Number.isFinite(comparator.gte) && !(actual >= comparator.gte)) return false;
  if (Number.isFinite(comparator.lt) && !(actual < comparator.lt)) return false;
  if (Number.isFinite(comparator.lte) && !(actual <= comparator.lte)) return false;
  return true;
}

function normalizeParameterMap(parameters = []) {
  const map = new Map();

  for (const parameter of parameters) {
    const key = String(parameter?.key || "").trim();
    if (!key) continue;

    const history = Array.isArray(parameter?.history)
      ? parameter.history.filter((x) => x && x.date && Number.isFinite(Number(x.value))).sort(byDateAsc)
      : [];

    if (!history.length) continue;

    const latest = history[history.length - 1];
    const previous = history.length > 1 ? history[history.length - 2] : null;
    const latestValue = toFinite(latest.value);
    const previousValue = previous ? toFinite(previous.value) : null;
    const delta =
      Number.isFinite(latestValue) && Number.isFinite(previousValue)
        ? Number((latestValue - previousValue).toFixed(4))
        : null;

    let direction = "unknown";
    if (Number.isFinite(delta)) {
      if (Math.abs(delta) <= STABLE_EPSILON) direction = "stable";
      else if (delta > 0) direction = "rising";
      else direction = "falling";
    }

    const refLow = toFinite(latest?.ref_low);
    const refHigh = toFinite(latest?.ref_high);
    const inRange = valueInRange(latestValue, refLow, refHigh);

    map.set(key, {
      key,
      latest_date: latest.date,
      latest_value: latestValue,
      previous_value: previousValue,
      delta,
      direction,
      ref_low: refLow,
      ref_high: refHigh,
      in_range: inRange,
      out_of_range: inRange === null ? null : !inRange,
      history
    });
  }

  return map;
}

function conditionMatches(snapshot, condition = {}) {
  if (!snapshot) return false;

  if (condition.latest && !compareNumeric(snapshot.latest_value, condition.latest)) {
    return false;
  }

  if (condition.delta && !compareNumeric(snapshot.delta, condition.delta)) {
    return false;
  }

  if (typeof condition.direction === "string") {
    if (snapshot.direction !== condition.direction) return false;
  }

  if (typeof condition.out_of_range === "boolean") {
    if (snapshot.out_of_range !== condition.out_of_range) return false;
  }

  if (typeof condition.in_range === "boolean") {
    if (snapshot.in_range !== condition.in_range) return false;
  }

  return true;
}

function evaluateRule(rule = {}, parameterMap) {
  const mode = String(rule?.mode || "all").toLowerCase() === "any" ? "any" : "all";
  const conditions = Array.isArray(rule?.conditions) ? rule.conditions : [];

  if (!conditions.length) {
    return { matched: false, evidence: [] };
  }

  const evidence = [];
  const seenEvidence = new Set();

  for (const condition of conditions) {
    const parameterKey = String(condition?.parameter || "").trim();
    const snapshot = parameterMap.get(parameterKey);
    const matched = conditionMatches(snapshot, condition);

    if (matched) {
      const entry = {
        parameter: parameterKey,
        latest_value: snapshot?.latest_value ?? null,
        delta: snapshot?.delta ?? null,
        direction: snapshot?.direction || "unknown",
        out_of_range: snapshot?.out_of_range ?? null,
        latest_date: snapshot?.latest_date || null
      };
      const fingerprint = `${entry.parameter}|${entry.latest_date}|${entry.latest_value}`;
      if (!seenEvidence.has(fingerprint)) {
        seenEvidence.add(fingerprint);
        evidence.push(entry);
      }
    }

    if (mode === "all" && !matched) return { matched: false, evidence: [] };
    if (mode === "any" && matched) return { matched: true, evidence };
  }

  return { matched: mode === "all", evidence };
}

function severityScore(severity) {
  const value = String(severity || "").toLowerCase();
  if (value === "critical") return 4;
  if (value === "high") return 3;
  if (value === "medium") return 2;
  if (value === "low") return 1;
  return 0;
}

export const DEFAULT_TREND_RULES = getTrendRules();

function getLatestDate(parameterMap) {
  let latest = null;

  for (const snapshot of parameterMap.values()) {
    const date = toDate(snapshot.latest_date);
    if (!date) continue;
    if (!latest || date > latest) latest = date;
  }

  return latest ? latest.toISOString().slice(0, 10) : null;
}

export function evaluateTrendRules({
  normalizedTrend,
  rules = DEFAULT_TREND_RULES,
  asOfDate = new Date().toISOString().slice(0, 10)
}) {
  if (!normalizedTrend || typeof normalizedTrend !== "object") {
    throw new Error("evaluateTrendRules requires normalizedTrend");
  }

  const parameterMap = normalizeParameterMap(normalizedTrend.parameters || []);
  const activeRules = (Array.isArray(rules) ? rules : []).filter((rule) => rule && rule.key && rule.enabled !== false);

  const matchedTriggers = [];
  for (const rule of activeRules) {
    const decision = evaluateRule(rule, parameterMap);
    if (!decision.matched) continue;

    matchedTriggers.push({
      key: rule.key,
      severity: rule.severity || "low",
      evidence: decision.evidence,
      recommended_actions: Array.isArray(rule.recommended_actions) ? rule.recommended_actions : [],
      offer_code: rule.offer_code || null,
      followup_days: Number.isFinite(Number(rule.followup_days)) ? Number(rule.followup_days) : null
    });
  }

  matchedTriggers.sort((a, b) => severityScore(b.severity) - severityScore(a.severity));

  const topSeverity = matchedTriggers[0]?.severity || "low";
  const latestDate = getLatestDate(parameterMap);

  let recommendedFollowupDate = null;
  if (latestDate && matchedTriggers.length) {
    const minFollowup = matchedTriggers
      .map((t) => t.followup_days)
      .filter((v) => Number.isFinite(v) && v > 0)
      .sort((a, b) => a - b)[0];

    if (Number.isFinite(minFollowup)) {
      const dt = new Date(`${latestDate}T00:00:00.000Z`);
      dt.setUTCDate(dt.getUTCDate() + minFollowup);
      recommendedFollowupDate = dt.toISOString().slice(0, 10);
    }
  }

  return {
    risk_level: topSeverity,
    generated_at: new Date().toISOString(),
    as_of_date: asOfDate,
    triggers: matchedTriggers,
    recommended_followup_date: recommendedFollowupDate,
    parameter_snapshot: Object.fromEntries(parameterMap.entries())
  };
}
