import { NextResponse } from "next/server";
import { verifyFeedbackToken } from "@/lib/feedbackToken";
import { saveReportFeedback } from "@/lib/reportFeedback";

// Public, unauthenticated route for the link-based WhatsApp feedback flow
// (app/feedback/page.js). No staff/kiosk session is required or checked —
// the signed token IS the credential. reqid/reqno/phone are always read
// from the verified token payload, never from the request body, so a
// patient cannot submit feedback attributed to a different requisition/phone.

/** GET verifies the token so the page can render the form (or an
 * expired/invalid state) before the patient submits anything. Only
 * non-sensitive fields are echoed back — never the phone number. */
export async function GET(request) {
  const token = new URL(request.url).searchParams.get("t") || "";
  const verified = verifyFeedbackToken(token);
  if (!verified.ok) {
    return NextResponse.json(
      { ok: false, error: verified.error, expired: Boolean(verified.expired) },
      { status: 401 }
    );
  }
  return NextResponse.json({
    ok: true,
    reqid: verified.payload.reqid,
    reqno: verified.payload.reqno
  });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body?.t || body?.token || "").trim();
    const verified = verifyFeedbackToken(token);
    if (!verified.ok) {
      return NextResponse.json(
        { ok: false, error: verified.error, expired: Boolean(verified.expired) },
        { status: 401 }
      );
    }

    const rating = Number(body?.rating || 0);
    const feedback = String(body?.feedback || "").slice(0, 500).trim() || null;
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ ok: false, error: "Rating must be between 1 and 5" }, { status: 400 });
    }

    const { reqid, reqno, labId, phone } = verified.payload;
    const resolvedLabId = labId || String(process.env.DEFAULT_LAB_ID || "").trim() || null;

    const saveResult = await saveReportFeedback({
      reqid,
      reqno,
      labId: resolvedLabId,
      patientPhone: phone,
      rating,
      feedback,
      source: "whatsapp",
      actorUserId: null,
      actorName: null,
      actorRole: null,
      dedupeKey: `wa_feedback_link:${reqid || reqno}`,
      metadata: { captured_via: "whatsapp_feedback_link" }
    });

    if (!saveResult.ok) {
      console.error("[feedback-submit] insert failed", {
        code: saveResult?.error?.code || null,
        message: saveResult?.error?.message || "Unknown error",
        reqid,
        reqno
      });
      return NextResponse.json(
        { ok: false, error: saveResult?.error?.message || "Failed to save feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, stored: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to save feedback" },
      { status: 500 }
    );
  }
}
