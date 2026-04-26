import { supabase } from "@/lib/supabaseServer";

export const DEFAULT_ROLE_PERMISSIONS = {
  director: ["*"],
  admin: [
    "uac.view",
    "uac.manage",
    "patients.create",
    "patients.update",
    "patients.update_identity",
    "visits.create",
    "visits.update",
    "quickbook.update",
    "executives.status.update",
    "whatsapp.reply",
    "reports.setup",
    "reports.run.mis",
    "reports.run.transaction",
    "reports.logs.view",
    "reports.dispatch",
    "shivam.tools.view",
    "shivam.demographics.update",
    "shivam.demographics.update_identity",
    "shivam.pricelist.sync",
    "cto.view"
  ],
  manager: [
    "patients.create",
    "patients.update",
    "visits.create",
    "visits.update",
    "quickbook.update",
    "whatsapp.reply",
    "reports.run.mis",
    "reports.run.transaction",
    "reports.logs.view",
    "reports.dispatch",
    "shivam.tools.view",
    "shivam.demographics.update",
    "cto.view"
  ],
  executive: ["whatsapp.reply"],
  viewer: [],
  integration_tester: ["simulator.read", "simulator.send", "simulator.reset"]
};

const POLICY_CACHE_TTL_MS = 60 * 1000;
const policyCache = new Map();

function cloneDefaultPolicy() {
  return JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePermission(value) {
  return String(value || "").trim();
}

function normalizeLabId(labId) {
  const value = String(labId || "").trim();
  return value || "__global__";
}

function setPolicyCache(labId, policy) {
  policyCache.set(normalizeLabId(labId), {
    policy,
    cachedAtMs: Date.now()
  });
}

function readCachedPolicy(labId) {
  const entry = policyCache.get(normalizeLabId(labId));
  if (!entry) return null;
  const fresh = Date.now() - entry.cachedAtMs < POLICY_CACHE_TTL_MS;
  if (!fresh || !entry.policy) return null;
  return entry.policy;
}

function mergeRowsToPolicy(rows = []) {
  const knownRoles = new Set();
  for (const row of rows) {
    const roleKey = normalizeRole(row?.role_key);
    if (roleKey) knownRoles.add(roleKey);
  }

  const policy = {};
  for (const roleKey of knownRoles) {
    policy[roleKey] = [];
  }

  for (const row of rows) {
    const roleKey = normalizeRole(row?.role_key);
    const permission = normalizePermission(row?.permission);
    const enabled = row?.enabled !== false;
    if (!roleKey || !permission || !enabled) continue;
    if (!Array.isArray(policy[roleKey])) policy[roleKey] = [];
    if (!policy[roleKey].includes(permission)) {
      policy[roleKey].push(permission);
    }
  }

  return policy;
}

export function invalidatePolicyCache(labId = null) {
  if (labId) {
    policyCache.delete(normalizeLabId(labId));
    return;
  }
  policyCache.clear();
}

export function resolvePrimaryLabId(user = {}) {
  if (user?.labId) return String(user.labId);
  if (Array.isArray(user?.labIds)) {
    const first = user.labIds.find((value) => String(value || "").trim());
    if (first) return String(first);
  }
  return null;
}

export async function loadPolicyFromDb({ force = false, labId = null } = {}) {
  if (!force) {
    const cached = readCachedPolicy(labId);
    if (cached) return cached;
  }

  try {
    let query = supabase
      .from("uac_role_permissions")
      .select("role_key,permission,enabled");
    if (labId) query = query.eq("lab_id", labId);
    else query = query.is("lab_id", null);

    const { data, error } = await query;
    if (error) {
      const fallback = cloneDefaultPolicy();
      setPolicyCache(labId, fallback);
      return fallback;
    }

    const rows = Array.isArray(data) ? data : [];
    const policy = rows.length > 0 ? mergeRowsToPolicy(rows) : cloneDefaultPolicy();
    setPolicyCache(labId, policy);
    return policy;
  } catch {
    const fallback = cloneDefaultPolicy();
    setPolicyCache(labId, fallback);
    return fallback;
  }
}

export function resolveRoleKey(user = {}) {
  const role = String(
    user?.roleKey || user?.executiveType || (user?.userType === "admin" ? "admin" : user?.userType) || ""
  )
    .trim()
    .toLowerCase();
  return role || "viewer";
}

export async function listPermissionsForRole(roleKey = "viewer", options = {}) {
  const policy = await loadPolicyFromDb(options);
  return policy[normalizeRole(roleKey)] || [];
}

export async function hasPermission(user, permission, options = {}) {
  const effectiveOptions = {
    ...options,
    labId: options?.labId || resolvePrimaryLabId(user)
  };
  const granted = await listPermissionsForRole(resolveRoleKey(user), effectiveOptions);
  if (granted.includes("*")) return true;
  return granted.includes(normalizePermission(permission));
}

export const UAC_POLICY = DEFAULT_ROLE_PERMISSIONS;
