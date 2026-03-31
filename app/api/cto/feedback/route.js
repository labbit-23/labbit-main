import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

const PERIOD_PRESETS = {
  day: { days: 30, bucket: "day" },
  month: { days: 365, bucket: "month" },
  year: { days: 365 * 5, bucket: "year" }
};

function canAccessCto(user) {
  return user?.userType === "executive" && (user?.executiveType || "").toLowerCase() === "director";
}

function parsePeriod(value) {
  const key = String(value || "month").toLowerCase();
  return PERIOD_PRESETS[key] ? key : "month";
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function yearKey(date) {
  return String(date.getUTCFullYear());
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function bucketKeyFromDate(date, period) {
  if (period === "year") return yearKey(date);
  if (period === "month") return monthKey(date);
  return dayKey(date);
}

function bucketLabel(key, period) {
  if (period === "year") return key;
  if (period === "month") {
    const parsed = new Date(`${key}-01T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return key;
    return parsed.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  const parsed = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return key;
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function emptyBucket() {
  return { total: 0, rating_sum: 0, positive: 0, neutral: 0, negative: 0 };
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function categoryForRow(row = {}) {
  const source = normalizeText(row?.source);
  const actorRole = normalizeText(row?.actor_role);
  const capturedVia = normalizeText(row?.metadata?.captured_via);
  const triggerSource = normalizeText(row?.metadata?.trigger_source);

  if (
    actorRole.includes("agent") ||
    actorRole.includes("executive") ||
    capturedVia.includes("agent_resolved_feedback") ||
    triggerSource.includes("agent_resolved_feedback")
  ) {
    return "agent";
  }

  if (
    source.includes("whatsapp") ||
    capturedVia.includes("whatsapp") ||
    capturedVia.includes("report_delivery_feedback") ||
    capturedVia.includes("services_feedback") ||
    triggerSource.includes("report_delivery_feedback") ||
    triggerSource.includes("services_feedback")
  ) {
    return "bot";
  }

  if (source.includes("kiosk") || source.includes("public") || capturedVia.includes("public_feedback_api")) {
    return "general_service";
  }

  return "other";
}

function categoryLabel(key) {
  if (key === "bot") return "Bot";
  if (key === "agent") return "Agent";
  if (key === "general_service") return "General Service";
  return "Other";
}

function rowInBucket(row, period, bucketKey) {
  const createdAt = row?.created_at ? new Date(row.created_at) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
  return bucketKeyFromDate(createdAt, period) === bucketKey;
}

export async function GET(request) {
  const response = NextResponse.next();

  try {
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;

    if (!user || !canAccessCto(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const period = parsePeriod(request.nextUrl.searchParams.get("period"));
    const mode = String(request.nextUrl.searchParams.get("mode") || "summary").trim().toLowerCase();
    const selectedLabId = String(request.nextUrl.searchParams.get("lab_id") || "").trim();
    const preset = PERIOD_PRESETS[period];
    const now = new Date();
    const fromDate = startOfUtcDay(addUtcDays(now, -preset.days));

    let query = supabase
      .from("report_feedback")
      .select("id,created_at,rating,source,lab_id,feedback,patient_phone,reqid,reqno,actor_name,actor_role,metadata")
      .gte("created_at", fromDate.toISOString())
      .order("created_at", { ascending: true })
      .limit(10000);

    if (selectedLabId) {
      query = query.eq("lab_id", selectedLabId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[cto/feedback] fetch error", error);
      return NextResponse.json({ error: "Failed to load feedback analytics" }, { status: 500 });
    }

    const rows = Array.isArray(data) ? data : [];
    const requestedCategory = normalizeText(request.nextUrl.searchParams.get("category"));
    const requestedBucket = String(request.nextUrl.searchParams.get("bucket_key") || "").trim();

    if (mode === "details") {
      if (!requestedCategory || !requestedBucket) {
        return NextResponse.json({ error: "category and bucket_key are required for details mode" }, { status: 400 });
      }
      const detailRows = rows
        .filter((row) => categoryForRow(row) === requestedCategory)
        .filter((row) => rowInBucket(row, period, requestedBucket))
        .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
        .slice(0, 300)
        .map((row) => ({
          id: row.id || null,
          created_at: row.created_at || null,
          rating: row.rating || null,
          patient_phone: row.patient_phone || null,
          feedback: row.feedback || null,
          source: row.source || null,
          reqid: row.reqid || null,
          reqno: row.reqno || null,
          actor_name: row.actor_name || null,
          actor_role: row.actor_role || null,
          captured_via: row?.metadata?.captured_via || null
        }));

      return NextResponse.json(
        {
          period,
          category: requestedCategory,
          bucket_key: requestedBucket,
          total_rows: detailRows.length,
          rows: detailRows
        },
        { status: 200 }
      );
    }

    const buckets = new Map();
    const sourceCounts = new Map();
    const totals = emptyBucket();
    const categoryBuckets = new Map();
    const categoryTotals = new Map();

    for (const row of rows) {
      const rating = Number(row?.rating || 0);
      const createdAt = row?.created_at ? new Date(row.created_at) : null;
      if (!Number.isFinite(rating) || rating < 1 || rating > 5 || !createdAt || Number.isNaN(createdAt.getTime())) {
        continue;
      }

      const key = bucketKeyFromDate(createdAt, period);
      const current = buckets.get(key) || emptyBucket();
      current.total += 1;
      current.rating_sum += rating;
      if (rating >= 4) current.positive += 1;
      else if (rating === 3) current.neutral += 1;
      else current.negative += 1;
      buckets.set(key, current);

      totals.total += 1;
      totals.rating_sum += rating;
      if (rating >= 4) totals.positive += 1;
      else if (rating === 3) totals.neutral += 1;
      else totals.negative += 1;

      const sourceKey = String(row?.source || "unknown").trim() || "unknown";
      sourceCounts.set(sourceKey, Number(sourceCounts.get(sourceKey) || 0) + 1);

      const categoryKey = categoryForRow(row);
      const categoryBucketKey = `${categoryKey}::${key}`;
      const categoryBucket = categoryBuckets.get(categoryBucketKey) || emptyBucket();
      categoryBucket.total += 1;
      categoryBucket.rating_sum += rating;
      if (rating >= 4) categoryBucket.positive += 1;
      else if (rating === 3) categoryBucket.neutral += 1;
      else categoryBucket.negative += 1;
      categoryBuckets.set(categoryBucketKey, categoryBucket);

      const categoryTotal = categoryTotals.get(categoryKey) || emptyBucket();
      categoryTotal.total += 1;
      categoryTotal.rating_sum += rating;
      if (rating >= 4) categoryTotal.positive += 1;
      else if (rating === 3) categoryTotal.neutral += 1;
      else categoryTotal.negative += 1;
      categoryTotals.set(categoryKey, categoryTotal);
    }

    const points = [...buckets.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([key, value]) => ({
        key,
        label: bucketLabel(key, period),
        total: value.total,
        avg_rating: value.total > 0 ? Number((value.rating_sum / value.total).toFixed(2)) : null,
        positive_rate: value.total > 0 ? Number((value.positive / value.total).toFixed(4)) : null,
        negative_rate: value.total > 0 ? Number((value.negative / value.total).toFixed(4)) : null
      }));

    const topSources = [...sourceCounts.entries()]
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 8)
      .map(([source, count]) => ({ source, count }));

    const categoryKeys = ["bot", "agent", "general_service", "other"];
    const categories = categoryKeys.map((categoryKey) => {
      const total = categoryTotals.get(categoryKey) || emptyBucket();
      const catPoints = [...categoryBuckets.entries()]
        .filter(([key]) => key.startsWith(`${categoryKey}::`))
        .map(([joinedKey, value]) => {
          const key = joinedKey.split("::")[1];
          return {
            key,
            label: bucketLabel(key, period),
            total: value.total,
            avg_rating: value.total > 0 ? Number((value.rating_sum / value.total).toFixed(2)) : null,
            positive_rate: value.total > 0 ? Number((value.positive / value.total).toFixed(4)) : null,
            negative_rate: value.total > 0 ? Number((value.negative / value.total).toFixed(4)) : null
          };
        })
        .sort((a, b) => String(a.key).localeCompare(String(b.key)));

      return {
        key: categoryKey,
        label: categoryLabel(categoryKey),
        summary: {
          total_feedback: total.total,
          avg_rating: total.total > 0 ? Number((total.rating_sum / total.total).toFixed(2)) : null,
          positive_rate: total.total > 0 ? Number((total.positive / total.total).toFixed(4)) : null,
          negative_rate: total.total > 0 ? Number((total.negative / total.total).toFixed(4)) : null
        },
        points: catPoints
      };
    });

    return NextResponse.json(
      {
        period,
        summary: {
          total_feedback: totals.total,
          avg_rating: totals.total > 0 ? Number((totals.rating_sum / totals.total).toFixed(2)) : null,
          positive_rate: totals.total > 0 ? Number((totals.positive / totals.total).toFixed(4)) : null,
          negative_rate: totals.total > 0 ? Number((totals.negative / totals.total).toFixed(4)) : null
        },
        points,
        categories,
        top_sources: topSources
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[cto/feedback] unexpected error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
