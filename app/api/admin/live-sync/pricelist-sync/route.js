import { NextResponse } from "next/server";
import { checkPermission, deny, getSessionUser } from "@/lib/uac/authz";
import { resolvePrimaryLabId } from "@/lib/uac/policy";
import { supabase } from "@/lib/supabaseServer";
import { writeAuditLog } from "@/lib/audit/logger";

// Live Sync: labit-core's own catalog/price master is the source of truth
// for this website's lab_tests catalog going forward (director, 2026-09-14:
// "decouple from shivam and move to core... its a sync FROM core to main.
// Its ok. We'll review dry runs etc."). Replaces the old getShivamPriceList
// call (lib/neosoft/client.js, → live NeoSoft webform) with labit-py's new
// /live-sync/pricelist proxy (→ labit-core's GET /api/catalog/
// price-list-export, see that function's own docstring in
// labit-core/app/services/catalog_service.py for the active/patient_visible
// field additions made alongside this route).
//
// Director, 2026-09-20: "same sync code we need to sync tests to SDRC's
// price list in labit-main which will also give insights to which tests
// to surface (first) most common, most popular etc." Upstream now also
// carries `patient_popular` (core's schema/904, already real-curated via
// the same name-match backfill 903 used for patient_visible) -- written
// into BOTH `is_most_common` and `is_most_popular` on lab_tests, since
// those are the two separate columns this table already had for what
// core tracks as one single curation flag.
const LIVE_SYNC_BASE_URL = String(process.env.NEOSOFT_API_BASE_URL || "").replace(/\/+$/, "");

async function fetchLiveSyncPriceList() {
  if (!LIVE_SYNC_BASE_URL) {
    throw new Error("NEOSOFT_API_BASE_URL is not defined (used as the labit-py base URL for Live Sync)");
  }
  const res = await fetch(`${LIVE_SYNC_BASE_URL}/live-sync/pricelist`, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Live Sync pricelist fetch failed: ${res.status} ${text.slice(0, 500)}`);
  }
  const body = await res.json();
  return Array.isArray(body?.items) ? body.items : [];
}

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

function asBool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeUpstreamRows(items) {
  return (Array.isArray(items) ? items : [])
    .map((row) => ({
      internal_code: normalizeCode(row?.internal_code),
      lab_test_name: clean(row?.lab_test_name),
      price: asPrice(row?.price),
      is_active: asBool(row?.active),
      patient_visible: asBool(row?.patient_visible),
      patient_popular: asBool(row?.patient_popular)
    }))
    // Deliberately NOT filtering out inactive rows here (unlike the old
    // Shivam version) -- an inactive-but-still-priced upstream row is
    // exactly what tells the diff to deactivate the local copy. Only
    // dropping rows with no code/price at all, which carry no usable
    // signal either way.
    .filter((row) => row.internal_code && row.price !== null);
}

async function fetchSupabaseLabTests(labId) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("lab_tests")
      .select("id, lab_id, internal_code, lab_test_name, price, is_active, is_patient_visible, is_most_common, is_most_popular")
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
        local_active: null,
        upstream_active: upstream.is_active,
        local_patient_visible: null,
        upstream_patient_visible: upstream.patient_visible,
        local_patient_popular: null,
        upstream_patient_popular: upstream.patient_popular,
        status: "missing_local",
        delta: null
      });
      continue;
    }

    const priceChanged = local.price !== upstream.price;
    const activeChanged = Boolean(local.is_active) !== upstream.is_active;
    const visibleChanged = Boolean(local.is_patient_visible) !== upstream.patient_visible;
    const popularChanged =
      Boolean(local.is_most_common) !== upstream.patient_popular ||
      Boolean(local.is_most_popular) !== upstream.patient_popular;
    const isReduction = priceChanged && Number.isFinite(local.price) && Number.isFinite(upstream.price) && upstream.price < local.price;

    if (!priceChanged && !activeChanged && !visibleChanged && !popularChanged) {
      matchedCount += 1;
      comparisonRows.push({
        internal_code: upstream.internal_code,
        lab_test_name: local.lab_test_name || upstream.lab_test_name || null,
        local_price: local.price,
        upstream_price: upstream.price,
        local_active: local.is_active,
        upstream_active: upstream.is_active,
        local_patient_visible: local.is_patient_visible,
        upstream_patient_visible: upstream.patient_visible,
        local_patient_popular: Boolean(local.is_most_common) || Boolean(local.is_most_popular),
        upstream_patient_popular: upstream.patient_popular,
        status: "matched",
        delta: 0
      });
      continue;
    }

    if (isReduction && !allowReduction) {
      blockedReductionCount += 1;
      comparisonRows.push({
        internal_code: upstream.internal_code,
        lab_test_name: local.lab_test_name || upstream.lab_test_name || null,
        local_price: local.price,
        upstream_price: upstream.price,
        local_active: local.is_active,
        upstream_active: upstream.is_active,
        local_patient_visible: local.is_patient_visible,
        upstream_patient_visible: upstream.patient_visible,
        local_patient_popular: Boolean(local.is_most_common) || Boolean(local.is_most_popular),
        upstream_patient_popular: upstream.patient_popular,
        status: "blocked_reduction",
        delta: upstream.price - local.price
      });
      continue;
    }

    changedCount += 1;
    diff.push({
      id: local.id,
      internal_code: upstream.internal_code,
      lab_test_name: local.lab_test_name || upstream.lab_test_name || null,
      old_price: local.price,
      new_price: upstream.price,
      old_active: local.is_active,
      new_active: upstream.is_active,
      old_patient_visible: local.is_patient_visible,
      new_patient_visible: upstream.patient_visible,
      old_patient_popular: Boolean(local.is_most_common) || Boolean(local.is_most_popular),
      new_patient_popular: upstream.patient_popular
    });
    comparisonRows.push({
      internal_code: upstream.internal_code,
      lab_test_name: local.lab_test_name || upstream.lab_test_name || null,
      local_price: local.price,
      upstream_price: upstream.price,
      local_active: local.is_active,
      upstream_active: upstream.is_active,
      local_patient_visible: local.is_patient_visible,
      upstream_patient_visible: upstream.patient_visible,
      local_patient_popular: Boolean(local.is_most_common) || Boolean(local.is_most_popular),
      upstream_patient_popular: upstream.patient_popular,
      status: "changed",
      delta: priceChanged ? upstream.price - local.price : 0
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
        is_active: row.new_active,
        is_patient_visible: row.new_patient_visible,
        is_most_common: row.new_patient_popular,
        is_most_popular: row.new_patient_popular,
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
    const compareLimit = Math.max(50, Math.min(2000, Number(url.searchParams.get("compare_limit") || 400)));

    const [upstreamItems, localRows] = await Promise.all([
      fetchLiveSyncPriceList(),
      fetchSupabaseLabTests(labId)
    ]);
    const upstreamRows = normalizeUpstreamRows(upstreamItems);
    const { diff, missingInSupabase, matchedCount, changedCount, blockedReductionCount, comparisonRows } = buildDiff(
      upstreamRows,
      localRows,
      { allowReduction: false }
    );

    return NextResponse.json({
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
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to preview Live Sync price sync" },
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

    const [upstreamItems, localRows] = await Promise.all([
      fetchLiveSyncPriceList(),
      fetchSupabaseLabTests(labId)
    ]);
    const upstreamRows = normalizeUpstreamRows(upstreamItems);
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
                new_price: row.upstream_price,
                old_active: row.local_active,
                new_active: row.upstream_active,
                old_patient_visible: row.local_patient_visible,
                new_patient_visible: row.upstream_patient_visible,
                old_patient_popular: row.local_patient_popular,
                new_patient_popular: row.upstream_patient_popular
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
      action: "live_sync.pricelist.sync",
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
      action: "live_sync.pricelist.sync",
      entityType: "lab_tests",
      entityId: null,
      status: "error",
      metadata: {
        error: error?.message || "unknown"
      }
    });
    return NextResponse.json(
      { error: error?.message || "Failed to sync Live Sync pricelist" },
      { status: 500 }
    );
  }
}
