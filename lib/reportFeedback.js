import { supabase } from "@/lib/supabaseServer";

function asUuidOrNull(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function normalizePhone10(value) {
  return String(value || "").replace(/\D/g, "").slice(-10) || null;
}

export async function saveReportFeedback({
  reqid = null,
  reqno = null,
  labId = null,
  patientPhone = null,
  rating,
  feedback = null,
  source = null,
  actorUserId = null,
  actorName = null,
  actorRole = null,
  metadata = null
}) {
  if (!supabase) {
    return { ok: false, error: { message: "Supabase server client is not configured" } };
  }

  const numericRating = Number(rating || 0);
  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    return { ok: false, error: { message: "Rating must be between 1 and 5", code: "INVALID_RATING" } };
  }

  const payload = {
    reqid: String(reqid || "").trim() || null,
    reqno: String(reqno || "").trim() || null,
    lab_id: asUuidOrNull(labId),
    patient_phone: normalizePhone10(patientPhone),
    rating: numericRating,
    feedback: String(feedback || "").trim() || null,
    source: String(source || "").trim() || null,
    actor_user_id: asUuidOrNull(actorUserId),
    actor_name: String(actorName || "").trim() || null,
    actor_role: String(actorRole || "").trim() || null,
    metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {},
    created_at: new Date().toISOString()
  };

  const { error } = await supabase.from("report_feedback").insert(payload);
  if (error) {
    return { ok: false, error, payload };
  }
  return { ok: true, payload };
}

