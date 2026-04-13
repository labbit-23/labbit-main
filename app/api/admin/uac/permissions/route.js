import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { writeAuditLog } from "@/lib/audit/logger";
import {
  DEFAULT_ROLE_PERMISSIONS,
  invalidatePolicyCache,
  loadPolicyFromDb,
  resolvePrimaryLabId
} from "@/lib/uac/policy";
import { UAC_ALL_PERMISSION_KEYS, UAC_PERMISSION_CATALOG } from "@/lib/uac/constants";

const READ_ALLOWED = new Set(["director", "admin", "manager"]);
const WRITE_ALLOWED = new Set(["director", "admin"]);

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return String(user.executiveType || "").toLowerCase();
  return String(user.userType || "").toLowerCase();
}

function withAllRoles(policy = {}) {
  const keys = Object.keys(policy || {});
  if (keys.length === 0) {
    return JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
  }
  const merged = {};
  for (const role of keys) {
    merged[role] = Array.isArray(policy?.[role]) ? [...policy[role]] : [];
  }
  return merged;
}

function sanitizePolicyInput(inputPolicy = {}) {
  const result = {};
  const roles = new Set(Object.keys(inputPolicy || {}));

  for (const role of roles) {
    const raw = Array.isArray(inputPolicy?.[role]) ? inputPolicy[role] : [];
    const cleaned = Array.from(
      new Set(
        raw
          .map((value) => String(value || "").trim())
          .filter((value) => value === "*" || UAC_ALL_PERMISSION_KEYS.includes(value))
      )
    );
    result[String(role || "").trim().toLowerCase()] = cleaned;
  }

  return result;
}

async function getSessionUser(request) {
  const response = NextResponse.next();
  const session = await getIronSession(request, response, ironOptions);
  return session?.user || null;
}

export async function GET(request) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const roleKey = getRoleKey(user);
    if (!READ_ALLOWED.has(roleKey)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const requestedLabId = String(url.searchParams.get("lab_id") || "").trim();
    const allowedLabs = Array.isArray(user?.labIds) ? user.labIds.map(String) : [];
    const fallbackLabId = resolvePrimaryLabId(user);
    const labId = requestedLabId && allowedLabs.includes(requestedLabId) ? requestedLabId : fallbackLabId;
    if (!labId) {
      return NextResponse.json({ error: "No lab context found" }, { status: 400 });
    }

    const policy = withAllRoles(await loadPolicyFromDb({ force: true, labId }));
    return NextResponse.json({
      labId,
      policy,
      roles: Object.keys(policy),
      permissionCatalog: UAC_PERMISSION_CATALOG
    });
  } catch (error) {
    console.error("[uac/permissions][GET] failed:", error);
    return NextResponse.json({ error: "Failed to load UAC policy" }, { status: 500 });
  }
}

export async function PUT(request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const roleKey = getRoleKey(user);
  if (!WRITE_ALLOWED.has(roleKey)) {
    await writeAuditLog({
      request,
      user,
      roleKey,
      action: "uac.permissions.update",
      entityType: "uac_role_permissions",
      entityId: null,
      status: "denied",
      metadata: { reason: "forbidden" }
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const payload = await request.json();
    const inputPolicy = payload?.policy;
    if (!inputPolicy || typeof inputPolicy !== "object") {
      return NextResponse.json({ error: "policy object is required" }, { status: 400 });
    }

    const url = new URL(request.url);
    const requestedLabId = String(url.searchParams.get("lab_id") || "").trim();
    const allowedLabs = Array.isArray(user?.labIds) ? user.labIds.map(String) : [];
    const fallbackLabId = resolvePrimaryLabId(user);
    const labId = requestedLabId && allowedLabs.includes(requestedLabId) ? requestedLabId : fallbackLabId;
    if (!labId) {
      return NextResponse.json({ error: "No lab context found" }, { status: 400 });
    }

    const beforePolicy = withAllRoles(await loadPolicyFromDb({ force: true, labId }));
    const nextPolicy = sanitizePolicyInput(inputPolicy);

    const { data: existingRows, error: fetchError } = await supabase
      .from("uac_role_permissions")
      .select("role_key")
      .eq("lab_id", labId);
    if (fetchError) throw fetchError;

    const existingRoles = new Set((existingRows || []).map((row) => String(row?.role_key || "").trim().toLowerCase()).filter(Boolean));
    const incomingRoles = new Set(Object.keys(nextPolicy));
    const rolesToReplace = new Set([...existingRoles, ...incomingRoles]);

    for (const role of rolesToReplace) {
      const { error: deleteError } = await supabase
        .from("uac_role_permissions")
        .delete()
        .eq("lab_id", labId)
        .eq("role_key", role);
      if (deleteError) throw deleteError;
    }

    const rowsToInsert = [];
    for (const [role, permissions] of Object.entries(nextPolicy)) {
      for (const permission of permissions) {
        rowsToInsert.push({
          lab_id: labId,
          role_key: role,
          permission,
          enabled: true
        });
      }
    }

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("uac_role_permissions")
        .insert(rowsToInsert);
      if (insertError) throw insertError;
    }

    invalidatePolicyCache(labId);
    const savedPolicy = withAllRoles(await loadPolicyFromDb({ force: true, labId }));

    await writeAuditLog({
      request,
      user,
      roleKey,
      action: "uac.permissions.update",
      entityType: "uac_role_permissions",
      entityId: labId,
      labId,
      status: "success",
      before: beforePolicy,
      after: savedPolicy
    });

    return NextResponse.json({
      ok: true,
      labId,
      policy: savedPolicy,
      roles: Object.keys(savedPolicy),
      permissionCatalog: UAC_PERMISSION_CATALOG
    });
  } catch (error) {
    console.error("[uac/permissions][PUT] failed:", error);
    await writeAuditLog({
      request,
      user,
      roleKey,
      action: "uac.permissions.update",
      entityType: "uac_role_permissions",
      entityId: null,
      labId: resolvePrimaryLabId(user),
      status: "failed",
      metadata: { error: error?.message || String(error) }
    });
    return NextResponse.json({ error: "Failed to update UAC policy" }, { status: 500 });
  }
}
