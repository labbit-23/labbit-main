import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

function badRequest(message) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function normalizeService(service = {}) {
  return {
    service_key: String(service.service_key || "").trim(),
    category: String(service.category || "").trim() || null,
    label: String(service.label || "").trim() || null,
    status: String(service.status || "").trim().toLowerCase(),
    latency_ms:
      service.latency_ms === null || service.latency_ms === undefined || service.latency_ms === ""
        ? null
        : Number(service.latency_ms),
    message: String(service.message || "").trim() || null,
    payload:
      service.payload && typeof service.payload === "object" && !Array.isArray(service.payload)
        ? service.payload
        : {},
  };
}

function isValidStatus(status) {
  return ["healthy", "degraded", "down", "unknown"].includes(status);
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
      return unauthorized();
    }

    if (!supabase) {
      return NextResponse.json({ error: "Supabase server client unavailable" }, { status: 500 });
    }

    const body = await request.json();
    const labId = String(body?.lab_id || "").trim();
    const source = String(body?.source || "").trim();
    const checkedAt = String(body?.checked_at || "").trim();
    const services = Array.isArray(body?.services) ? body.services.map(normalizeService) : null;

    if (!labId) return badRequest("Missing lab_id");
    if (!source) return badRequest("Missing source");
    if (!checkedAt) return badRequest("Missing checked_at");
    if (!services || services.length === 0) return badRequest("Services array is required");

    for (const service of services) {
      if (!service.service_key) return badRequest("Each service requires service_key");
      if (!service.status || !isValidStatus(service.status)) {
        return badRequest(`Invalid status for service ${service.service_key}`);
      }
      if (service.latency_ms !== null && Number.isNaN(service.latency_ms)) {
        return badRequest(`Invalid latency_ms for service ${service.service_key}`);
      }
    }

    const logRows = services.map((service) => ({
      lab_id: labId,
      checked_at: checkedAt,
      source,
      service_key: service.service_key,
      category: service.category,
      label: service.label,
      status: service.status,
      latency_ms: service.latency_ms,
      message: service.message,
      payload: service.payload,
    }));

    const latestRows = services.map((service) => ({
      lab_id: labId,
      service_key: service.service_key,
      category: service.category,
      label: service.label,
      status: service.status,
      checked_at: checkedAt,
      source,
      latency_ms: service.latency_ms,
      message: service.message,
      payload: service.payload,
      updated_at: new Date().toISOString(),
    }));

    const { error: logError } = await supabase.from("cto_service_logs").insert(logRows);
    if (logError) {
      console.error("[cto/ingest] failed to insert logs", logError);
      return NextResponse.json({ error: "Failed to insert service logs" }, { status: 500 });
    }

    const { error: latestError } = await supabase
      .from("cto_service_latest")
      .upsert(latestRows, { onConflict: "lab_id,service_key" });

    if (latestError) {
      console.error("[cto/ingest] failed to upsert latest state", latestError);
      return NextResponse.json({ error: "Failed to upsert latest service state" }, { status: 500 });
    }

    return NextResponse.json({
      message: "CTO monitoring payload ingested",
      ingested: services.length,
      lab_id: labId,
      source,
    });
  } catch (error) {
    console.error("[cto/ingest] unexpected error", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
