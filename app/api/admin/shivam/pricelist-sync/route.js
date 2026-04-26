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
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("lab_tests")
      .select("id, lab_id, internal_code, lab_test_name, price, is_active")
      .eq("lab_id", labId)
      .not("internal_code", "is", null)
      .range(from, to);

    if (error) throw error;

    const batch = data || [];
    rows.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows.map((row) => ({
    ...row,
    internal_code: normalizeCode(row?.internal_code),
    price: asPrice(row?.price)
  }));
}

function buildDiff(upstreamRows, localRows, { allowReduction = false } = {}) {
  const localByCode = new Map(localRows.map((row) => [row.internal_code, row]));
  const diff = [];
  let missingInSupabase = 0;
  const comparisonRows = [];
  let matchedCount = 0;
  let changedCount = 0;
  let blockedReductionCount = 0;

  for (const upstream of upstreamRows) {
    const local = localByCode.get(upstream.internal_code);
    if (!local) {
      missingInSupabase += 1;
      comparisonRows.push({
        internal_code: upstream.internal_code,
        lab_test_name: upstream.lab_test_name || null,
        local_price: null,
        upstream_price: upstream.price,
        status: "missing_local",
        delta: null
      });
      continue;
    }
    if (local.price === upstream.price) {
      matchedCount += 1;
      comparisonRows.push({
        internal_code: upstream.internal_code,
        lab_test_name: local.lab_test_name || upstream.lab_test_name || null,
        local_price: local.price,
        upstream_price: upstream.price,
        status: "matched",
        delta: 0
      });
      continue;
    }
    changedCount += 1;
    const isReduction = Number.isFinite(local.price) && Number.isFinite(upstream.price) && upstream.price < local.price;
    if (isReduction && !allowReduction) {
      blockedReductionCount += 1;
      comparisonRows.push({
        internal_code: upstream.internal_code,
        lab_test_name: local.lab_test_name || upstream.lab_test_name || null,
        local_price: local.price,
        upstream_price: upstream.price,
        status: "blocked_reduction",
        delta: upstream.price - local.price
      });
      continue;
    }
    diff.push({
      id: local.id,
      internal_code: upstream.internal_code,
      lab_test_name: local.lab_test_name || upstream.lab_test_name || null,
      old_price: local.price,
      new_price: upstream.price
    });
    comparisonRows.push({
      internal_code: upstream.internal_code,
      lab_test_name: local.lab_test_name || upstream.lab_test_name || null,
      local_price: local.price,
      upstream_price: upstream.price,
      status: "changed",
      delta: upstream.price - local.price
    });
  }

  const statusRank = { changed: 0, blocked_reduction: 1, missing_local: 2, matched: 3 };
  comparisonRows.sort((a, b) => {
    const rankDiff = (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99);
    if (rankDiff !== 0) return rankDiff;
    const codeA = String(a.internal_code || "");
    const codeB = String(b.internal_code || "");
    return codeA.localeCompare(codeB);
  });

  return {
    diff,
    missingInSupabase,
    matchedCount,
    changedCount,
    blockedReductionCount,
    comparisonRows
  };
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
    const compareLimit = Math.max(50, Math.min(2000, Number(url.searchParams.get("compare_limit") || 400)));
    const { diff, missingInSupabase, matchedCount, changedCount, blockedReductionCount, comparisonRows } = buildDiff(
      upstreamRows,
      localRows,
      { allowReduction: false }
    );

    const response = {
      ok: true,
      mode: "preview",
      lab_id: labId,
      upstream_rows: upstreamRows.length,
      local_rows: localRows.length,
      to_update: diff.length,
      matched_count: matchedCount,
      changed_count: changedCount,
      blocked_reduction_count: blockedReductionCount,
      missing_in_supabase: missingInSupabase,
      sample_changes: diff.slice(0, 50),
      comparison_rows: comparisonRows.slice(0, compareLimit)
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
    const allowReduction = Boolean(body?.allow_price_reduction);
    const applyIncreasesOnly = Boolean(body?.apply_increases_only);
    const labId = await resolveLabId(request, user, body);
    if (!labId) {
      return NextResponse.json({ error: "lab_id is required" }, { status: 400 });
    }

    const [upstreamPayload, localRows] = await Promise.all([
      getShivamPriceList({ labId }),
      fetchSupabaseLabTests(labId)
    ]);
    const upstreamRows = normalizeUpstreamRows(upstreamPayload);
    const { diff, missingInSupabase, matchedCount, changedCount, blockedReductionCount, comparisonRows } = buildDiff(
      upstreamRows,
      localRows,
      { allowReduction }
    );

    if (!dryRun && blockedReductionCount > 0 && !allowReduction && !applyIncreasesOnly) {
      return NextResponse.json(
        {
          ok: false,
          requires_confirmation: true,
          message: `Detected ${blockedReductionCount} rate reductions. Confirm to proceed.`,
          blocked_reduction_count: blockedReductionCount,
          blocked_reduction_rows: comparisonRows
            .filter((row) => row.status === "blocked_reduction")
            .slice(0, 200),
          to_update_without_reduction: diff.length
        },
        { status: 409 }
      );
    }

    let updatedCount = 0;
    if (!dryRun && (diff.length > 0 || (allowReduction && blockedReductionCount > 0))) {
      const finalDiff = allowReduction
        ? comparisonRows
            .filter((row) => row.status === "changed" || row.status === "blocked_reduction")
            .map((row) => {
              const localRow = localRows.find((l) => l.internal_code === row.internal_code);
              return {
                id: localRow?.id,
                internal_code: row.internal_code,
                lab_test_name: row.lab_test_name || null,
                old_price: row.local_price,
                new_price: row.upstream_price
              };
            })
            .filter((row) => row.id)
        : diff;
      updatedCount = await applyDiff(finalDiff);
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
        missing_in_supabase: missingInSupabase,
        allow_price_reduction: allowReduction,
        apply_increases_only: applyIncreasesOnly
      }
    });

    return NextResponse.json({
      ok: true,
      mode: dryRun ? "dry_run" : "apply",
      lab_id: labId,
      upstream_rows: upstreamRows.length,
      local_rows: localRows.length,
      to_update: diff.length,
      matched_count: matchedCount,
      changed_count: changedCount,
      blocked_reduction_count: blockedReductionCount,
      updated_count: updatedCount,
      missing_in_supabase: missingInSupabase,
      apply_increases_only: applyIncreasesOnly,
      sample_changes: diff.slice(0, 50),
      comparison_rows: comparisonRows.slice(0, 400)
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
