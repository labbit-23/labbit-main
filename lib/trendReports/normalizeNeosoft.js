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
    pickFirst(row, ["name", "parameter", "test_name", "display_name", "label"]) ||
    pickFirst(row, ["key", "parameter_key", "code", "slug"]);

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
  const raw = pickFirst(row, ["COMPID", "compid", "subcompid", "SUBCOMPID", "component_id"]);
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  return text || null;
}

function groupingKeyForRow(row = {}) {
  const compId = extractComponentId(row);
  if (compId) return `compid:${compId}`;
  return `name:${semanticParameterKey(row)}`;
}

function normalizeHistoryEntry(entry = {}, fallback = {}) {
  const date = normalizeDate(
    pickFirst(entry, ["date", "tested_at", "test_date", "reqdt", "recorded_at", "datetime"]) ||
      pickFirst(fallback, ["date", "tested_at", "test_date", "reqdt", "recorded_at", "datetime"])
  );

  const value = toFiniteNumber(
    pickFirst(entry, ["value", "result", "test_result", "reading"]) ||
      pickFirst(fallback, ["value", "result", "test_result", "reading"])
  );

  if (!date || value === null) return null;

  const refLow = toFiniteNumber(
    pickFirst(entry, ["ref_low", "range_low", "normal_low", "min", "low"]) ||
      pickFirst(fallback, ["ref_low", "range_low", "normal_low", "min", "low"])
  );
  const refHigh = toFiniteNumber(
    pickFirst(entry, ["ref_high", "range_high", "normal_high", "max", "high"]) ||
      pickFirst(fallback, ["ref_high", "range_high", "normal_high", "max", "high"])
  );

  return {
    date,
    value,
    ref_low: refLow,
    ref_high: refHigh,
    normal_text:
      pickFirst(entry, ["normalvalue", "NORMALVALUE", "normal_value", "reference_text", "reference"]) ||
      pickFirst(fallback, ["normalvalue", "NORMALVALUE", "normal_value", "reference_text", "reference"]) ||
      null,
    psyntax: pickFirst(entry, ["psyntax", "PSYNTAX"]) || pickFirst(fallback, ["psyntax", "PSYNTAX"]) || null,
    lettype: pickFirst(entry, ["lettype", "LETTYPE", "current_lettype", "CURRENT_LETTYPE"]) ||
      pickFirst(fallback, ["lettype", "LETTYPE", "current_lettype", "CURRENT_LETTYPE"]) ||
      null
  };
}

function buildRowsFromTablePayload(payload = {}) {
  const columns = Array.isArray(payload?.table?.columns) ? payload.table.columns : [];
  const tableRows = Array.isArray(payload?.table?.rows) ? payload.table.rows : [];
  if (!columns.length || !tableRows.length) return [];

  const columnNames = columns.map((col) => String(col?.name || "").trim());
  const rows = [];

  for (const tableRow of tableRows) {
    const values = Array.isArray(tableRow?.values) ? tableRow.values : [];
    const row = {};
    for (let i = 0; i < columnNames.length; i += 1) {
      const key = columnNames[i];
      if (!key) continue;
      const raw = values?.[i]?.value;
      row[key] = raw === "<null>" ? null : raw;
    }
    rows.push(row);
  }

  return rows;
}

function parseNeosoftDate(value) {
  if (!value) return null;
  const text = String(value).trim().replace(" ", "T");
  const parsed = text.endsWith("Z") ? text : `${text}Z`;
  const dt = new Date(parsed);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function normalizeFromTablePayload(payload = {}, options = {}) {
  const rows = buildRowsFromTablePayload(payload);
  if (!rows.length) return null;

  const psyntaxAllowSet = Array.isArray(options?.psyntaxAllowList)
    ? new Set(options.psyntaxAllowList.map((x) => String(x).trim()).filter(Boolean))
    : null;
  const includeComponents = Array.isArray(options?.includeComponents)
    ? new Set(options.includeComponents.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean))
    : null;
  const includeParameterKeys = Array.isArray(options?.includeParameterKeys)
    ? new Set(options.includeParameterKeys.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean))
    : null;

  const patientIdRaw = rows[0]?.MRNO ?? null;
  const patientName = String(rows[0]?.PATIENTNM || "").trim() || null;
  const gender = String(rows[0]?.SEX || "").trim() || null;
  const age = toFiniteNumber(rows[0]?.AGE);
  const mobile = String(rows[0]?.MOBILENO || "").replace(/\D/g, "").slice(-10) || null;

  const grouped = new Map();

  for (const row of rows) {
    const psyntax = String(row?.PSYNTAX ?? "").trim();
    if (psyntaxAllowSet && !psyntaxAllowSet.has(psyntax)) continue;

    const component = String(row?.TESTCOMPONENT || "").trim();
    if (!component) continue;
    if (includeComponents && !includeComponents.has(component.toLowerCase())) continue;

    const key = semanticParameterKey({
      ...row,
      test_name: component,
      display_name: component
    });
    const compId = extractComponentId(row);
    const groupKey = groupingKeyForRow({
      ...row,
      test_name: component,
      display_name: component
    });
    if (includeParameterKeys && !includeParameterKeys.has(String(key || "").toLowerCase())) continue;

    const reqDate = parseNeosoftDate(row?.REQDT);
    const value = toFiniteNumber(row?.RESULTVALUE);
    if (!reqDate || value === null) continue;

    const refLow = toFiniteNumber(row?.MINVAL);
    const refHigh = toFiniteNumber(row?.MAXVAL);
    const unit = String(row?.UNITS || "").trim() || null;

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        key,
        component_id: compId,
        display_name: component,
        unit,
        history: []
      });
    }

    grouped.get(groupKey).history.push({
      date: reqDate,
      value,
      ref_low: refLow,
      ref_high: refHigh,
      normal_text: String(row?.NORMALVALUE || "").trim() || null,
      psyntax: psyntax || null,
      lettype: String(row?.LETTYPE || "").trim() || null
    });
  }

  const parameters = [];
  for (const param of grouped.values()) {
    const deduped = [];
    const seen = new Set();
    for (const item of param.history.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
      const fingerprint = `${item.date}|${item.value}|${item.ref_low}|${item.ref_high}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      deduped.push(item);
    }
    if (!deduped.length) continue;
    parameters.push({
      ...param,
      history: deduped
    });
  }

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
    patient_id: patientIdRaw === null ? null : String(patientIdRaw).trim() || null,
    neosoft_patient_id: patientIdRaw === null ? null : String(patientIdRaw).trim() || null,
    patient_profile: {
      name: patientName,
      age,
      gender,
      mobile
    },
    first_recorded_at: firstRecordedAt,
    latest_recorded_at: latestRecordedAt,
    parameters,
    timeline,
    source_meta: {
      source_format: "table-columns-rows",
      raw_row_count: rows.length,
      filtered_parameter_count: parameters.length
    }
  };
}

function normalizeParameterRow(row = {}) {
  const displayName = String(
    pickFirst(row, ["display_name", "name", "parameter", "test_name", "label", "key"]) || ""
  ).trim();
  const unit = String(pickFirst(row, ["unit", "uom", "units"]) || "").trim() || null;
  const key = semanticParameterKey(row);
  const componentId = extractComponentId(row);

  const rawHistory =
    (Array.isArray(row?.history) && row.history) ||
    (Array.isArray(row?.trend) && row.trend) ||
    (Array.isArray(row?.values) && row.values) ||
    (Array.isArray(row?.results) && row.results) ||
    [];

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

export function normalizeNeosoftTrendPayload(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    throw new Error("normalizeNeosoftTrendPayload requires a payload object");
  }

  const normalizedTable = normalizeFromTablePayload(payload, options);
  if (normalizedTable) return normalizedTable;

  const patientRoot = payload?.patient || payload?.data?.patient || payload || {};
  const patientId = String(
    pickFirst(patientRoot, ["patient_id", "patientId", "mrn", "mrno", "MRNO", "id"]) || ""
  ).trim();

  const neosoftPatientId = String(
    pickFirst(patientRoot, ["neosft_patient_id", "neosoft_patient_id", "external_patient_id", "mrno", "MRNO"]) ||
      ""
  ).trim();

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
    first_recorded_at: firstRecordedAt,
    latest_recorded_at: latestRecordedAt,
    parameters,
    timeline
  };
}
