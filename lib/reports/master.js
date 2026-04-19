import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ironOptions } from "@/lib/session";
import { loadPolicyFromDb, resolvePrimaryLabId } from "@/lib/uac/policy";

const ADMIN_EXEC_TYPES = new Set(["admin", "manager", "director"]);
const REPORT_TYPES = new Set(["mis", "transaction_print"]);
const EXPORT_FORMATS = ["pdf", "xlsx", "csv"];

function asText(value) {
  return String(value || "").trim();
}

export function normalizeReportType(value) {
  const next = asText(value).toLowerCase();
  return REPORT_TYPES.has(next) ? next : null;
}

function normalizeEngine(value) {
  const next = asText(value).toLowerCase();
  return next || "jasper";
}

function parseJsonObject(value, fallback = {}) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonArray(value, fallback = []) {
  if (value == null || value === "") return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeExportOptions(value) {
  const base = { pdf: true, xlsx: false, csv: false };
  const raw = parseJsonObject(value, {});
  const normalized = {
    pdf: Boolean(raw.pdf ?? base.pdf),
    xlsx: Boolean(raw.xlsx ?? base.xlsx),
    csv: Boolean(raw.csv ?? base.csv)
  };
  if (!normalized.pdf && !normalized.xlsx && !normalized.csv) normalized.pdf = true;
  return normalized;
}

export function normalizeReportPayload(input = {}, { existingVersion = null } = {}) {
  const reportKey = asText(input.report_key).toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const reportName = asText(input.report_name);
  const reportType = normalizeReportType(input.report_type);
  const engine = normalizeEngine(input.engine);
  const errors = [];

  if (!reportKey) errors.push("report_key is required");
  if (!/^[a-z0-9_]{3,80}$/.test(reportKey)) {
    errors.push("report_key must match ^[a-z0-9_]{3,80}$");
  }
  if (!reportName) errors.push("report_name is required");
  if (!reportType) errors.push("report_type must be mis or transaction_print");
  if (engine !== "jasper") errors.push("engine must be jasper");

  const versionRaw = Number(input.version);
  const version = Number.isFinite(versionRaw) && versionRaw > 0
    ? Math.floor(versionRaw)
    : Number.isFinite(existingVersion) && existingVersion > 0
      ? existingVersion
      : 1;

  const payload = {
    report_key: reportKey,
    report_name: reportName,
    report_title: asText(input.report_title) || null,
    report_type: reportType,
    engine,
    jasper_report_name: asText(input.jasper_report_name) || null,
    jasper_file_name: asText(input.jasper_file_name) || null,
    jasper_path: asText(input.jasper_path) || null,
    data_source_key: asText(input.data_source_key) || null,
    query_template: asText(input.query_template) || null,
    procedure_name: asText(input.procedure_name) || null,
    description: asText(input.description) || null,
    help_doc_url: asText(input.help_doc_url) || null,
    param_schema: parseJsonArray(input.param_schema, []),
    ui_schema: parseJsonObject(input.ui_schema, {}),
    export_options: normalizeExportOptions(input.export_options),
    scope_rules: parseJsonObject(input.scope_rules, {}),
    is_active: input.is_active === undefined ? true : Boolean(input.is_active),
    version
  };

  return { payload, errors };
}

export function normalizeRunPayload(input = {}) {
  const reportIdRaw = Number(input.report_id);
  const reportId = Number.isFinite(reportIdRaw) && reportIdRaw > 0 ? Math.floor(reportIdRaw) : null;
  const reportKey = asText(input.report_key).toLowerCase();
  const requestedFormat = asText(input.format || input.requested_format).toLowerCase();
  const runMode = asText(input.run_mode).toLowerCase() || "sync";
  const sourcePage = asText(input.source_page) || "report_master";
  const requestParams = parseJsonObject(input.params, {});

  return {
    reportId,
    reportKey: reportKey || null,
    requestedFormat: EXPORT_FORMATS.includes(requestedFormat) ? requestedFormat : "pdf",
    runMode: runMode === "async" ? "async" : "sync",
    sourcePage,
    requestParams
  };
}

export function buildNormalizedParams(paramSchema = [], requestParams = {}) {
  const schema = Array.isArray(paramSchema) ? paramSchema : [];
  const normalized = {};
  const missing = [];
  for (const field of schema) {
    const key = asText(field?.key || field?.name || field?.id);
    if (!key) continue;

    const required = Boolean(field?.required);
    const incoming = requestParams?.[key];
    const hasIncoming =
      incoming !== undefined &&
      incoming !== null &&
      !(typeof incoming === "string" && incoming.trim() === "");
    const fallback = field?.default ?? null;
    const value = hasIncoming ? incoming : fallback;

    if (required && (value === null || value === undefined || value === "")) {
      missing.push(key);
      continue;
    }
    if (value !== undefined) normalized[key] = value;
  }

  for (const [key, value] of Object.entries(requestParams || {})) {
    if (!(key in normalized)) normalized[key] = value;
  }

  return { normalized, missing };
}

export function isFormatAllowed(reportRow, format) {
  const options = reportRow?.export_options && typeof reportRow.export_options === "object"
    ? reportRow.export_options
    : {};
  return Boolean(options?.[format]);
}

export function getActorRoleKey(user = null) {
  if (!user) return "";
  if (String(user.userType || "").toLowerCase() === "executive") {
    return String(user.executiveType || "").toLowerCase().trim();
  }
  return String(user.userType || "").toLowerCase().trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeScopeRules(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function requiredRunPermissionForType(reportType) {
  return String(reportType || "").toLowerCase() === "transaction_print"
    ? "reports.run.transaction"
    : "reports.run.mis";
}

export function canAccessReportRow(reportRow = {}, actor = {}) {
  const roleKey = String(actor?.roleKey || "").toLowerCase();
  const permissions = asArray(actor?.permissions);
  const has = (perm) => permissions.includes("*") || permissions.includes(String(perm || ""));

  const scope = normalizeScopeRules(reportRow?.scope_rules);
  const allowedRoles = asArray(scope?.allowed_roles).map((x) => String(x || "").toLowerCase()).filter(Boolean);
  const deniedRoles = asArray(scope?.denied_roles).map((x) => String(x || "").toLowerCase()).filter(Boolean);
  const requiredPerms = asArray(scope?.required_permissions).map((x) => String(x || "")).filter(Boolean);

  if (deniedRoles.includes(roleKey)) return false;
  if (allowedRoles.length > 0 && !allowedRoles.includes(roleKey)) return false;
  if (requiredPerms.length > 0 && !requiredPerms.every((perm) => has(perm))) return false;
  if (!has(requiredRunPermissionForType(reportRow?.report_type))) return false;
  return true;
}

export async function getReportAdminUser() {
  const cookieStore = await cookies();
  const session = await getIronSession(cookieStore, ironOptions);
  const user = session?.user || null;
  const roleKey = getActorRoleKey(user);
  const allowed = ADMIN_EXEC_TYPES.has(roleKey);
  const labId = resolvePrimaryLabId(user);

  if (!allowed || !labId) {
    return {
      user,
      roleKey,
      labId: labId || null,
      permissions: [],
      allowed
    };
  }

  const policy = await loadPolicyFromDb({ force: false, labId });
  const permissions = asArray(policy?.[roleKey]);
  return {
    user,
    roleKey,
    labId,
    permissions,
    allowed
  };
}
