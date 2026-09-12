const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeDate(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function toDate(value) {
  const dt = new Date(value);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function diffDays(fromDate, toDateValue) {
  const from = toDate(fromDate);
  const to = toDate(toDateValue);
  if (!from || !to) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / ONE_DAY_MS));
}

function pickFirst(obj, keys = []) {
  if (!obj || typeof obj !== "object") return null;
  for (const key of keys) {
    const value = obj[key];
    if (value === 0) return value;
    if (value) return value;
  }
  return null;
}

// pickFirst(entry, keys) || pickFirst(fallback, keys) drops a legitimate 0
// from `entry` (e.g. ESR's reference_low: 0.0) because `||` treats pickFirst's
// correctly-returned 0 as falsy and falls through to `fallback` anyway.
// pickFirst itself already handles 0 right; only chaining two calls with ||
// breaks it. Use this wherever a field can genuinely be 0.
function pickFirstAcross(entry, fallback, keys) {
  const fromEntry = pickFirst(entry, keys);
  if (fromEntry !== null) return fromEntry;
  return pickFirst(fallback, keys);
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[%/().]+/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function semanticParameterKey(row = {}) {
  const rawKey =
    pickFirst(row, ["name", "parameter", "test_name", "display_name", "label", "parameter_name"]) ||
    pickFirst(row, ["key", "parameter_key", "code", "slug", "parameter_code", "legacy_parameter_id"]);

  const key = normalizeKey(rawKey);

  const aliases = new Map([
    ["glycosylated_hemoglobin_hba1c", "hba1c"],
    ["glycosylated_hemoglobin", "hba1c"],
    ["glycosylated_haemoglobin", "hba1c"],
    ["hba1c", "hba1c"],
    ["glucose_fasting", "fasting_glucose"],
    ["fasting_glucose", "fasting_glucose"],
    ["blood_sugar_fasting", "fasting_glucose"],
    ["ldl_cholesterol", "ldl"],
    ["hdl_cholesterol", "hdl"],
    ["total_cholesterol", "total_cholesterol"],
    ["cholesterol_ldl", "ldl"],
    ["ldl", "ldl"],
    ["triglycerides", "triglycerides"],
    ["tsh", "tsh"],
    ["hemoglobin", "hemoglobin"],
    ["ferritin", "ferritin"],
    ["creatinine", "creatinine"],
    ["serum_creatinine", "creatinine"],
    ["creatinine_serum", "creatinine"],
    ["serum_creatinine_level", "creatinine"],
    ["s_creatinine", "creatinine"],
    ["creatinin", "creatinine"],
    ["creatine", "creatinine"],
    ["vitamin_d_25_oh_calcidiol", "vitamin_d_25_oh_calcidiol"],
    ["25_oh_vitamin_d_calcidiol", "vitamin_d_25_oh_calcidiol"],
    ["vitamin_d_25_oh", "vitamin_d_25_oh_calcidiol"],
    ["25_oh_vitamin_d", "vitamin_d_25_oh_calcidiol"],
    ["vitamin_d_calcidiol", "vitamin_d_25_oh_calcidiol"],
    ["egfr", "egfr"]
  ]);

  return aliases.get(key) || key || "unknown_parameter";
}

function extractComponentId(row = {}) {
  const raw = pickFirst(row, [
    "COMPID", "compid", "subcompid", "SUBCOMPID", "component_id",
    // labit-core /trend-data shape: parameter_id is a stable id per
    // parameter ("archive:SCMP0043" for archive-sourced rows, a plain
    // UUID/code for labit_core-native ones) -- legacy_parameter_id is the
    // archive-side code alone, kept as a fallback for rows missing the
    // prefixed id.
    "parameter_id", "legacy_parameter_id"
  ]);
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  return text || null;
}

function normalizeHistoryEntry(entry = {}, fallback = {}) {
  const date = normalizeDate(
    pickFirst(entry, ["date", "tested_at", "test_date", "reqdt", "recorded_at", "datetime"]) ||
      pickFirst(fallback, ["date", "tested_at", "test_date", "reqdt", "recorded_at", "datetime"])
  );

  // "value_numeric" is labit-core's /trend-data point field (see
  // normalizeParameterRow's "points" handling) -- was missing here entirely,
  // so every core-sourced point silently failed the `value === null` check
  // below and the whole parameter (and eventually the whole report) came
  // back empty. User, 2026-09-11: "V2 ... blank report is loaded."
  const value = toFiniteNumber(
    pickFirstAcross(entry, fallback, ["value", "result", "test_result", "reading", "value_numeric"])
  );

  if (!date || value === null) return null;

  const refLow = toFiniteNumber(
    pickFirstAcross(entry, fallback, ["ref_low", "range_low", "normal_low", "min", "low", "reference_low"])
  );
  const refHigh = toFiniteNumber(
    pickFirstAcross(entry, fallback, ["ref_high", "range_high", "normal_high", "max", "high", "reference_high"])
  );

  return {
    date,
    value,
    ref_low: refLow,
    ref_high: refHigh,
    normal_text:
      pickFirst(entry, ["normalvalue", "NORMALVALUE", "normal_value", "reference_text", "reference", "reference_display"]) ||
      pickFirst(fallback, ["normalvalue", "NORMALVALUE", "normal_value", "reference_text", "reference", "reference_display"]) ||
      null,
    psyntax: pickFirst(entry, ["psyntax", "PSYNTAX"]) || pickFirst(fallback, ["psyntax", "PSYNTAX"]) || null,
    lettype: pickFirst(entry, ["lettype", "LETTYPE", "current_lettype", "CURRENT_LETTYPE"]) ||
      pickFirst(fallback, ["lettype", "LETTYPE", "current_lettype", "CURRENT_LETTYPE"]) ||
      null
  };
}

function normalizeParameterRow(row = {}) {
  const displayName = String(
    pickFirst(row, ["display_name", "name", "parameter", "test_name", "label", "key", "parameter_name"]) || ""
  ).trim();
  const key = semanticParameterKey(row);
  const componentId = extractComponentId(row);

  const rawHistory =
    (Array.isArray(row?.history) && row.history) ||
    (Array.isArray(row?.trend) && row.trend) ||
    (Array.isArray(row?.values) && row.values) ||
    (Array.isArray(row?.results) && row.results) ||
    // labit-core /trend-data shape: each parameter carries its history as
    // "points" (see normalizeHistoryEntry for the per-point field names --
    // value_numeric/reference_low/reference_high/reference_display).
    (Array.isArray(row?.points) && row.points) ||
    [];

  // labit-core's parameter row itself carries no "unit" field -- it only
  // lives per-point (unit can theoretically vary by lab over time, though
  // in practice it's constant). Fall back to the first point's unit when
  // the row-level field the older Neosoft shape used isn't present.
  const unit =
    String(pickFirst(row, ["unit", "uom", "units"]) || pickFirst(rawHistory?.[0] || {}, ["unit", "uom", "units"]) || "").trim() ||
    null;

  const history = rawHistory
    .map((item) => normalizeHistoryEntry(item, row))
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (!history.length) {
    const single = normalizeHistoryEntry(row);
    if (single) history.push(single);
  }

  if (!history.length) return null;

  const deduped = [];
  const seen = new Set();
  for (const item of history) {
    const fingerprint = `${item.date}|${item.value}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    deduped.push(item);
  }

  return {
    key,
    component_id: componentId,
    display_name: displayName || key,
    unit,
    history: deduped
  };
}

function resolveParameterRows(payload = {}) {
  const roots = [
    payload,
    payload?.data,
    payload?.result,
    payload?.report,
    payload?.trend,
    payload?.patient_trend
  ].filter(Boolean);

  for (const root of roots) {
    if (Array.isArray(root) && root.length) return root;

    const rows =
      (Array.isArray(root?.parameters) && root.parameters) ||
      (Array.isArray(root?.tests) && root.tests) ||
      (Array.isArray(root?.markers) && root.markers) ||
      (Array.isArray(root?.items) && root.items) ||
      null;

    if (rows && rows.length) return rows;
  }

  return [];
}

export function buildDerivedTimeline({
  firstRecordedAt,
  latestRecordedAt,
  asOfDate = new Date().toISOString().slice(0, 10),
  followupDays = 90
}) {
  const first = normalizeDate(firstRecordedAt);
  const latest = normalizeDate(latestRecordedAt);
  const asOf = normalizeDate(asOfDate) || new Date().toISOString().slice(0, 10);

  const tenureDays = first ? diffDays(first, asOf) : null;
  const tenureYears = tenureDays === null ? null : Number((tenureDays / 365).toFixed(2));
  const daysSinceLastTest = latest ? diffDays(latest, asOf) : null;

  let recommendedFollowupDate = null;
  if (latest) {
    const dt = toDate(latest);
    if (dt) {
      dt.setUTCDate(dt.getUTCDate() + Math.max(1, Number(followupDays) || 90));
      recommendedFollowupDate = dt.toISOString().slice(0, 10);
    }
  }

  return {
    first_registered_date: first,
    last_test_date: latest,
    patient_tenure_days: tenureDays,
    patient_tenure_years: tenureYears,
    days_since_last_test: daysSinceLastTest,
    recommended_followup_date: recommendedFollowupDate,
    as_of_date: asOf
  };
}

// User, 2026-09-11: "try to get rid of Neosoft/Shivam specific fields in
// code, pollution." Removed the raw-array and table-columns/rows legacy
// Neosoft shapes entirely: the one live upstream (labit-py's /trend-data,
// itself labit-core + shivam-archive merged) has never emitted either shape
// -- confirmed by reading labit-py's trend_data() and every current caller
// of this function -- so those branches (normalizeFromNeosoftRows,
// normalizeFromTablePayload, buildRowsFromTablePayload, parseNeosoftDate)
// were dead code with zero test coverage. This function now only handles
// the one real shape: an object with a `parameters` array.
export function normalizeNeosoftTrendPayload(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    throw new Error("normalizeNeosoftTrendPayload requires a payload object");
  }

  const patientRoot = payload?.patient || payload?.data?.patient || payload || {};
  const patientId = String(
    pickFirst(patientRoot, ["patient_id", "patientId", "mrn", "mrno", "id"]) || ""
  ).trim();

  const neosoftPatientId = String(
    pickFirst(patientRoot, ["neosft_patient_id", "neosoft_patient_id", "external_patient_id", "mrno"]) ||
      ""
  ).trim();

  // 2026-09-12: labit-core's previous_values_by_mrn now sends a `patient`
  // block (name/mrno/age/gender) -- buildReportFacts.js reads it as
  // `normalizedTrend.patient_profile`, which this function never set, so
  // Trends v2's hero section always showed the literal placeholder
  // "Patient" / "- · -" regardless of who the real patient was, even
  // though the trend DATA itself rendered fine (confirmed live, MRN 18347
  // / RADHA RAO). null/undefined fields pass through as-is -- renderReportHtml
  // already has its own "-"/"Patient" fallbacks for a genuinely missing value.
  const patientName = pickFirst(patientRoot, ["name", "patient_name", "full_name"]) || null;
  const patientAge = pickFirst(patientRoot, ["age", "age_years"]);
  const patientGender = pickFirst(patientRoot, ["gender", "sex"]) || null;
  const patientProfile = (patientName || patientAge != null || patientGender)
    ? {
        name: patientName,
        mrno: pickFirst(patientRoot, ["mrno", "mrn"]) || patientId || null,
        age: patientAge != null ? Number(patientAge) : null,
        gender: patientGender
      }
    : null;

  const rows = resolveParameterRows(payload);
  const parameters = rows.map(normalizeParameterRow).filter(Boolean);

  const allDates = parameters.flatMap((param) => param.history.map((h) => h.date));
  const firstRecordedAt = allDates.length ? allDates.slice().sort()[0] : null;
  const latestRecordedAt = allDates.length ? allDates.slice().sort()[allDates.length - 1] : null;

  const timeline = buildDerivedTimeline({
    firstRecordedAt,
    latestRecordedAt,
    asOfDate: options?.asOfDate,
    followupDays: options?.followupDays || 90
  });

  return {
    patient_id: patientId || null,
    neosoft_patient_id: neosoftPatientId || patientId || null,
    patient_profile: patientProfile,
    first_recorded_at: firstRecordedAt,
    latest_recorded_at: latestRecordedAt,
    parameters,
    timeline
  };
}
