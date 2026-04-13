import { supabase } from "@/lib/supabaseServer";

const ADMIN_ROLES = new Set(["admin", "manager", "director"]);
const SCOPED_ROLES = new Set(["b2b", "logistics"]);

const ORG_KEYS = [
  "REFDOCTOR",
  "refdoctor",
  "REF_DOCTOR",
  "ref_doctor",
  "external_org_id",
  "org_id",
  "organization_id",
  "organisation_id",
  "neosoft_org_id",
  "client_id",
  "account_id",
  "lab_org_id",
  "orgcode",
  "org_code",
  "ORG_ID",
  "ORGANIZATION_ID",
  "ORGANISATION_ID",
  "ORGCODE",
  "CLIENT_ID",
  "ACCOUNT_ID",
];

function rowValue(row, ...keys) {
  if (!row || typeof row !== "object") return null;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const lowered = String(key).toLowerCase();
    const matched = Object.keys(row).find((candidate) => String(candidate).toLowerCase() === lowered);
    if (matched && row[matched] !== undefined && row[matched] !== null) return row[matched];
  }
  return null;
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

export function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return normalizeKey(user.executiveType || user.roleKey);
  return normalizeKey(user.userType || user.roleKey);
}

export function canUseReportDispatch(user) {
  const role = getRoleKey(user);
  return ADMIN_ROLES.has(role) || SCOPED_ROLES.has(role);
}

export function isScopedDispatchRole(user) {
  return SCOPED_ROLES.has(getRoleKey(user));
}

async function resolveCollectionCentreTable() {
  const firstTry = await supabase.from("collection_centre").select("id").limit(1);
  if (!firstTry.error) return "collection_centre";

  const secondTry = await supabase.from("collection_centres").select("id").limit(1);
  if (!secondTry.error) return "collection_centres";

  throw new Error(firstTry.error?.message || secondTry.error?.message || "Collection centre table not found");
}

async function getLabIds(executiveId) {
  if (!executiveId) return [];
  const { data, error } = await supabase
    .from("executives_labs")
    .select("lab_id")
    .eq("executive_id", executiveId);
  if (error) throw error;
  return (data || []).map((row) => row.lab_id).filter(Boolean);
}

async function getAssignedCentreIds(executiveId) {
  if (!executiveId) return [];
  const { data, error } = await supabase
    .from("executives_collection_centres")
    .select("collection_centre_id")
    .eq("executive_id", executiveId);
  if (error) throw error;
  return (data || []).map((row) => row.collection_centre_id).filter(Boolean);
}

function extractOrgId(row) {
  const value = rowValue(row, ...ORG_KEYS);
  const text = String(value || "").trim();
  return text || null;
}

async function getCentresForScopedRole(user) {
  const tableName = await resolveCollectionCentreTable();
  const role = getRoleKey(user);
  const userId = user?.id;

  if (!userId) return [];

  if (role === "logistics") {
    const labIds = await getLabIds(userId);
    if (labIds.length === 0) return [];
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .in("lab_id", labIds);
    if (error) throw error;
    return data || [];
  }

  const centreIds = await getAssignedCentreIds(userId);
  if (centreIds.length === 0) return [];
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .in("id", centreIds);
  if (error) throw error;
  return data || [];
}

export async function getAllowedDispatchOrgIds(user) {
  if (!isScopedDispatchRole(user)) return [];
  const centres = await getCentresForScopedRole(user);
  const orgIds = centres
    .map((row) => extractOrgId(row))
    .filter(Boolean)
    .map((value) => String(value).trim());
  return Array.from(new Set(orgIds));
}

export function filterRowsByOrgScope(rows, allowedOrgIds) {
  const scoped = Array.isArray(allowedOrgIds) ? allowedOrgIds.filter(Boolean) : [];
  if (scoped.length === 0) return [];
  const allowed = new Set(scoped.map((v) => String(v).trim()));
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const rowOrgId = extractOrgId(row);
    if (!rowOrgId) return false;
    return allowed.has(String(rowOrgId).trim());
  });
}

export function reportStatusMatchesOrgScope(reportStatus, allowedOrgIds) {
  const scoped = Array.isArray(allowedOrgIds) ? allowedOrgIds.filter(Boolean) : [];
  if (scoped.length === 0) return false;
  const allowed = new Set(scoped.map((v) => String(v).trim()));

  const topLevelOrgId = extractOrgId(reportStatus);
  if (topLevelOrgId && allowed.has(String(topLevelOrgId).trim())) return true;

  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  for (const row of tests) {
    const testOrgId = extractOrgId(row);
    if (testOrgId && allowed.has(String(testOrgId).trim())) return true;
  }

  return false;
}
