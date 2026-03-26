import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const ALLOWED_SEVERITIES = new Set(["critical", "high", "medium", "info"]);
const ALLOWED_STATUSES = new Set(["open", "acknowledged", "resolved"]);

function canAccessCto(user) {
  return user?.userType === "executive" && (user?.executiveType || "").toLowerCase() === "director";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeMessage(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, " ").slice(0, 400);
}

function buildFingerprint({ labId, source, serviceKey, eventType, message }) {
  const seed = [
    normalizeText(labId),
    normalizeText(source).toLowerCase(),
    normalizeText(serviceKey).toLowerCase(),
    normalizeText(eventType).toLowerCase(),
    normalizeMessage(message),
  ].join("|");
  return createHash("sha1").update(seed).digest("hex");
}

function validateIngestEvent(input = {}) {
  const serviceKey = normalizeText(input.service_key);
  const eventType = normalizeText(input.event_type).toLowerCase();
  const severity = normalizeText(input.severity).toLowerCase();
  const message = normalizeText(input.message);
  const source = normalizeText(input.source);
  const payload = input.payload && typeof input.payload === "object" && !Array.isArray(input.payload) ? input.payload : {};
  const eventAtRaw = normalizeText(input.event_at);
  const eventAt = eventAtRaw ? new Date(eventAtRaw) : new Date();

  if (!serviceKey) return { ok: false, error: "service_key is required" };
  if (!eventType) return { ok: false, error: "event_type is required" };
  if (!ALLOWED_SEVERITIES.has(severity)) return { ok: false, error: `invalid severity for ${serviceKey}` };
  if (!message) return { ok: false, error: `message is required for ${serviceKey}` };
  if (Number.isNaN(eventAt.getTime())) return { ok: false, error: `invalid event_at for ${serviceKey}` };

  return {
    ok: true,
    value: {
      service_key: serviceKey,
      event_type: eventType,
      severity,
      message: message.slice(0, 800),
      source: source || null,
      payload,
      event_at: eventAt.toISOString(),
    },
  };
}

export async function GET(request) {
  const response = NextResponse.next();

  try {
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;
    if (!canAccessCto(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!supabase) {
      return NextResponse.json({ error: "Supabase server client unavailable" }, { status: 500 });
    }

    const url = new URL(request.url);
    const requestedLabId = normalizeText(url.searchParams.get("lab_id")) || null;
    const assignedLabIds = Array.isArray(user?.labIds) ? user.labIds.filter(Boolean).map(String) : [];
    const isProductCto = assignedLabIds.length === 0;

    if (!isProductCto && requestedLabId && !assignedLabIds.includes(requestedLabId)) {
      return NextResponse.json({ error: "Forbidden for requested lab" }, { status: 403 });
    }

    const labId = requestedLabId || assignedLabIds[0] || null;
    const status = normalizeText(url.searchParams.get("status")).toLowerCase();
    const severity = normalizeText(url.searchParams.get("severity")).toLowerCase();
    const source = normalizeText(url.searchParams.get("source"));
    const serviceKey = normalizeText(url.searchParams.get("service_key"));
    const rawLimit = Number(url.searchParams.get("limit") || 50);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;

    let query = supabase
      .from("cto_events")
      .select("*")
      .order("last_seen_at", { ascending: false })
      .limit(limit);

    if (labId) query = query.eq("lab_id", labId);
    if (status && ALLOWED_STATUSES.has(status)) query = query.eq("status", status);
    if (severity && ALLOWED_SEVERITIES.has(severity)) query = query.eq("severity", severity);
    if (source) query = query.eq("source", source);
    if (serviceKey) query = query.eq("service_key", serviceKey);

    const { data, error } = await query;
    if (error) {
      console.error("[cto/events] fetch error", error);
      return NextResponse.json({ error: "Failed to load CTO events" }, { status: 500 });
    }

    return NextResponse.json(
      {
        lab_id: labId,
        is_product_cto: isProductCto,
        allowed_lab_ids: isProductCto ? null : assignedLabIds,
        rows: data || [],
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("[cto/events] unexpected error", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const expectedToken = process.env.CTO_INGEST_TOKEN;
    const authHeader = request.headers.get("authorization") || "";
    const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    if (!expectedToken) {
      return NextResponse.json({ error: "CTO ingest token is not configured" }, { status: 500 });
    }

    if (!providedToken || providedToken !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabase) {
      return NextResponse.json({ error: "Supabase server client unavailable" }, { status: 500 });
    }

    const body = await request.json();
    const labId = normalizeText(body?.lab_id);
    const source = normalizeText(body?.source);
    const eventsRaw = Array.isArray(body?.events) ? body.events : [];

    if (!labId) return NextResponse.json({ error: "Missing lab_id" }, { status: 400 });
    if (!source) return NextResponse.json({ error: "Missing source" }, { status: 400 });
    if (eventsRaw.length === 0) return NextResponse.json({ error: "events array is required" }, { status: 400 });

    const normalizedEvents = [];
    for (const item of eventsRaw) {
      const validated = validateIngestEvent(item);
      if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
      normalizedEvents.push(validated.value);
    }

    const prepared = normalizedEvents.map((event) => {
      const fingerprint = buildFingerprint({
        labId,
        source: event.source || source,
        serviceKey: event.service_key,
        eventType: event.event_type,
        message: event.message,
      });

      return {
        lab_id: labId,
        source: event.source || source,
        service_key: event.service_key,
        event_type: event.event_type,
        severity: event.severity,
        message: event.message,
        payload: event.payload,
        fingerprint,
        first_seen_at: event.event_at,
        last_seen_at: event.event_at,
      };
    });

    const fingerprints = [...new Set(prepared.map((row) => row.fingerprint))];
    const { data: existingRows, error: existingError } = await supabase
      .from("cto_events")
      .select("id, fingerprint, status, occurrence_count, first_seen_at, last_seen_at")
      .eq("lab_id", labId)
      .in("fingerprint", fingerprints);

    if (existingError) {
      console.error("[cto/events] existing lookup error", existingError);
      return NextResponse.json({ error: "Failed to ingest events" }, { status: 500 });
    }

    const existingMap = new Map((existingRows || []).map((row) => [row.fingerprint, row]));
    const inserts = [];
    let updated = 0;
    let inserted = 0;
    let reopened = 0;

    for (const row of prepared) {
      const existing = existingMap.get(row.fingerprint);
      if (!existing) {
        inserts.push({
          ...row,
          status: "open",
          occurrence_count: 1,
        });
        continue;
      }

      const prevCount = Number(existing.occurrence_count || 0);
      const nextStatus = existing.status === "resolved" ? "open" : existing.status;
      if (nextStatus === "open" && existing.status === "resolved") reopened += 1;

      const { error: updateError } = await supabase
        .from("cto_events")
        .update({
          source: row.source,
          service_key: row.service_key,
          event_type: row.event_type,
          severity: row.severity,
          message: row.message,
          payload: row.payload,
          status: nextStatus,
          first_seen_at:
            new Date(row.first_seen_at).getTime() < new Date(existing.first_seen_at).getTime()
              ? row.first_seen_at
              : existing.first_seen_at,
          last_seen_at:
            new Date(row.last_seen_at).getTime() > new Date(existing.last_seen_at).getTime()
              ? row.last_seen_at
              : existing.last_seen_at,
          occurrence_count: prevCount + 1,
        })
        .eq("id", existing.id);

      if (updateError) {
        console.error("[cto/events] update error", updateError);
        return NextResponse.json({ error: "Failed to ingest events" }, { status: 500 });
      }

      updated += 1;
    }

    if (inserts.length > 0) {
      const { error: insertError } = await supabase.from("cto_events").insert(inserts);
      if (insertError) {
        console.error("[cto/events] insert error", insertError);
        return NextResponse.json({ error: "Failed to ingest events" }, { status: 500 });
      }
      inserted = inserts.length;
    }

    return NextResponse.json({
      message: "CTO events ingested",
      lab_id: labId,
      source,
      received: prepared.length,
      inserted,
      updated,
      reopened,
    });
  } catch (error) {
    console.error("[cto/events] unexpected ingest error", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
