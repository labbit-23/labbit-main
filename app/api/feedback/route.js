import { NextResponse } from "next/server";
import { saveReportFeedback } from "@/lib/reportFeedback";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function jsonWithCors(body, init = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...CORS_HEADERS
    }
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    const reqid = String(body?.reqid || "").trim() || null;
    const reqno = String(body?.reqno || "").trim() || null;
    const labId = String(body?.lab_id || "").trim() || null;
    const patientPhone = String(body?.patient_phone || "").trim() || null;
    const rating = Number(body?.rating || 0);
    const feedback = String(body?.feedback || "").slice(0, 500).trim() || null;
    const source = String(body?.source || "public").trim().slice(0, 40) || "public";
    const metadata =
      body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata
        : {};

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return jsonWithCors({ ok: false, error: "Rating must be between 1 and 5" }, { status: 400 });
    }
    if (!labId) {
      return jsonWithCors({ ok: false, error: "lab_id is required" }, { status: 400 });
    }
    if (!isUuid(labId)) {
      return jsonWithCors({ ok: false, error: "lab_id must be a valid UUID" }, { status: 400 });
    }

    const saveResult = await saveReportFeedback({
      reqid,
      reqno,
      labId,
      patientPhone,
      rating,
      feedback,
      source,
      actorUserId: null,
      actorName: null,
      actorRole: null,
      metadata: {
        ...metadata,
        captured_via: metadata?.captured_via || "public_feedback_api"
      }
    });

    if (!saveResult.ok) {
      return jsonWithCors(
        { ok: false, error: saveResult?.error?.message || "Failed to save feedback" },
        { status: 500 }
      );
    }

    return jsonWithCors({ ok: true, stored: true }, { status: 200 });
  } catch (error) {
    return jsonWithCors(
      { ok: false, error: error?.message || "Failed to save feedback" },
      { status: 500 }
    );
  }
}
