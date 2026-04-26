import { NextResponse } from "next/server";
import { checkPermission, deny, getSessionUser } from "@/lib/uac/authz";
import { resolvePrimaryLabId } from "@/lib/uac/policy";
import { supabase } from "@/lib/supabaseServer";
import { getShivamPriceList } from "@/lib/neosoft/client";
import { writeAuditLog } from "@/lib/audit/logger";

function clean(value) {
  const text = String(value ?? "").trim();
  return text || "";
}

function normalizeCode(value) {
  return clean(value).toUpperCase();
}

function asPrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeUpstreamRows(payload) {
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.tests)
      ? payload.tests
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

  return candidates
    .map((row) => {
      const activeRaw = row?.active ?? row?.ACTIVE ?? row?.is_active ?? row?.IS_ACTIVE;
      const activeText = String(activeRaw ?? "").trim().toLowerCase();
      const isActive =
        activeRaw === undefined ||
        activeRaw === null ||
        activeText === "" ||
        ["1", "true", "y", "yes", "active"].includes(activeText);

      return {
        internal_code: normalizeCode(
          row?.internal_code ??
            row?.test_code ??
            row?.code ??
            row?.TCODE ??
            row?.TESTCODE ??
            row?.TEST_CODE
        ),
        lab_test_name: clean(
          row?.lab_test_name ??
            row?.test_name ??
            row?.name ??
            row?.TESTNM ??
            row?.TESTNAME ??
            row?.TEST_NAME
        ),
        price: asPrice(row?.price ?? row?.rate ?? row?.amount ?? row?.PRICE ?? row?.RATE),
        is_active: isActive
      };
    })
    .filter((row) => row.is_active)
    .filter((row) => row.internal_code && row.price !== null);
}

function sampleRawRows(payload) {
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.tests)
      ? payload.tests
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
  return Array.isArray(candidates) ? candidates.slice(0, 5) : [];
}

async function fetchSupabaseLabTests(labId) {
  const { data, error } = await supabase
    .from("lab_tests")
    .select("id, lab_id, internal_code, lab_test_name, price, is_active")
    .eq("lab_id", labId)
    .not("internal_code", "is", null);

  if (error) throw error;

  return (data || []).map((row) => ({
    ...row,
    internal_code: normalizeCode(row?.internal_code),
    price: asPrice(row?.price)
  }));
}

function buildDiff(upstreamRows, localRows) {
  const localByCode = new Map(localRows.map((row) => [row.internal_code, row]));
  const diff = [];
  let missingInSupabase = 0;

  for (const upstream of upstreamRows) {
    const local = localByCode.get(upstream.internal_code);
    if (!local) {
      missingInSupabase += 1;
      continue;
    }
    if (local.price === upstream.price) continue;
    diff.push({
      id: local.id,
      internal_code: upstream.internal_code,
      lab_test_name: local.lab_test_name || upstream.lab_test_name || null,
      old_price: local.price,
      new_price: upstream.price
    });
  }

  return { diff, missingInSupabase };
}

async function applyDiff(diff) {
  let updated = 0;
  for (const row of diff) {
    const { error } = await supabase
      .from("lab_tests")
      .update({
        price: row.new_price,
        updated_at: new Date().toISOString()
      })
      .eq("id", row.id);
    if (error) throw error;
    updated += 1;
  }
  return updated;
}

async function resolveLabId(request, user, payload = null) {
  const url = new URL(request.url);
  const fromQuery = clean(url.searchParams.get("lab_id"));
  const fromBody = clean(payload?.lab_id);
  return fromQuery || fromBody || clean(resolvePrimaryLabId(user));
}

export async function GET(request) {
  let user = null;
  let roleKey = "viewer";
  try {
    user = await getSessionUser(request);
    if (!user) return deny("Not authenticated", 401);

    const canView = await checkPermission(user, "shivam.tools.view");
    roleKey = canView.roleKey;
    const roleBypass = roleKey === "director" || roleKey === "admin";
    if (!canView.ok && !roleBypass) {
      return deny("Forbidden", 403, { permission: "shivam.tools.view" });
    }

    const labId = await resolveLabId(request, user);
    if (!labId) {
      return NextResponse.json({ error: "lab_id is required" }, { status: 400 });
    }

    const url = new URL(request.url);
    const debug = url.searchParams.get("debug") === "1";

    const [upstreamPayload, localRows] = await Promise.all([
      getShivamPriceList({ labId }),
      fetchSupabaseLabTests(labId)
    ]);
    const upstreamRows = normalizeUpstreamRows(upstreamPayload);
    const { diff, missingInSupabase } = buildDiff(upstreamRows, localRows);

    const response = {
      ok: true,
      mode: "preview",
      lab_id: labId,
      upstream_rows: upstreamRows.length,
      local_rows: localRows.length,
      to_update: diff.length,
      missing_in_supabase: missingInSupabase,
      sample_changes: diff.slice(0, 50)
    };

    if (debug) {
      const rawSamples = sampleRawRows(upstreamPayload);
      response.debug = {
        upstream_payload_type: Array.isArray(upstreamPayload) ? "array" : typeof upstreamPayload,
        upstream_payload_keys:
          upstreamPayload && typeof upstreamPayload === "object" && !Array.isArray(upstreamPayload)
            ? Object.keys(upstreamPayload).slice(0, 20)
            : [],
        raw_sample_count: rawSamples.length,
        raw_sample_keys: rawSamples[0] && typeof rawSamples[0] === "object" ? Object.keys(rawSamples[0]) : [],
        raw_samples: rawSamples,
        normalized_samples: upstreamRows.slice(0, 5),
        local_sample_codes: localRows.slice(0, 5).map((row) => row.internal_code)
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to preview Shivam price sync" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  let user = null;
  let roleKey = "viewer";
  try {
    user = await getSessionUser(request);
    if (!user) return deny("Not authenticated", 401);

    const canSync = await checkPermission(user, "shivam.pricelist.sync");
    roleKey = canSync.roleKey;
    const roleBypass = roleKey === "director" || roleKey === "admin";
    if (!canSync.ok && !roleBypass) {
      return deny("Forbidden", 403, { permission: "shivam.pricelist.sync" });
    }

    const body = await request.json().catch(() => ({}));
    const dryRun = Boolean(body?.dry_run);
    const labId = await resolveLabId(request, user, body);
    if (!labId) {
      return NextResponse.json({ error: "lab_id is required" }, { status: 400 });
    }

    const [upstreamPayload, localRows] = await Promise.all([
      getShivamPriceList({ labId }),
      fetchSupabaseLabTests(labId)
    ]);
    const upstreamRows = normalizeUpstreamRows(upstreamPayload);
    const { diff, missingInSupabase } = buildDiff(upstreamRows, localRows);

    let updatedCount = 0;
    if (!dryRun && diff.length > 0) {
      updatedCount = await applyDiff(diff);
    }

    await writeAuditLog({
      request,
      user,
      roleKey,
      action: "shivam.pricelist.sync",
      entityType: "lab_tests",
      entityId: labId,
      labId,
      status: "success",
      metadata: {
        dry_run: dryRun,
        upstream_rows: upstreamRows.length,
        local_rows: localRows.length,
        to_update: diff.length,
        updated_count: updatedCount,
        missing_in_supabase: missingInSupabase
      }
    });

    return NextResponse.json({
      ok: true,
      mode: dryRun ? "dry_run" : "apply",
      lab_id: labId,
      upstream_rows: upstreamRows.length,
      local_rows: localRows.length,
      to_update: diff.length,
      updated_count: updatedCount,
      missing_in_supabase: missingInSupabase,
      sample_changes: diff.slice(0, 50)
    });
  } catch (error) {
    await writeAuditLog({
      request,
      user,
      roleKey,
      action: "shivam.pricelist.sync",
      entityType: "lab_tests",
      entityId: null,
      status: "error",
      metadata: {
        error: error?.message || "unknown"
      }
    });
    return NextResponse.json(
      { error: error?.message || "Failed to sync Shivam pricelist" },
      { status: 500 }
    );
  }
}
