import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { kioskIronOptions } from "@/lib/kioskSession";
import { supabase } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseReportDispatch(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

function asUuidOrNull(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const sessionData = await getIronSession(cookieStore, ironOptions);
    const kioskSession = await getIronSession(cookieStore, kioskIronOptions);
    const user = sessionData?.user;
    const kioskUser = kioskSession?.kioskUser;
    const isKioskAuth = Boolean(kioskUser?.authenticated);
    if ((!user || !canUseReportDispatch(user)) && !isKioskAuth) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = await request.json();
    const reqid = String(body?.reqid || "").trim() || null;
    const reqno = String(body?.reqno || "").trim() || null;
    const patientPhone = String(body?.patient_phone || "").replace(/\D/g, "").slice(-10) || null;
    const rating = Number(body?.rating || 0);
    const feedback = String(body?.feedback || "").trim() || null;
    const labId = String(body?.lab_id || "").trim() || kioskUser?.labId || null;
    const resolvedLabId =
      labId ||
      (Array.isArray(user?.labIds) ? String(user.labIds[0] || "").trim() : "") ||
      String(process.env.DEFAULT_LAB_ID || "").trim() ||
      null;
    const safeLabId = asUuidOrNull(resolvedLabId);
    const safeActorUserId = asUuidOrNull(user?.id || null);

    if (!reqid) {
      return new Response("Missing reqid", { status: 400 });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return new Response("Rating must be between 1 and 5", { status: 400 });
    }
    if (!supabase) {
      return new Response("Supabase server client is not configured", { status: 500 });
    }

    const payload = {
      reqid,
      reqno,
      lab_id: safeLabId,
      patient_phone: patientPhone,
      rating,
      feedback,
      source: "kiosk",
      actor_user_id: safeActorUserId,
      actor_name: user?.name || kioskUser?.username || null,
      metadata: {
        captured_via: "kiosk_ui",
        fallback_lab_id_used: !labId && Boolean(resolvedLabId),
        dropped_non_uuid_lab_id: Boolean(resolvedLabId && !safeLabId),
        dropped_non_uuid_actor_id: Boolean(user?.id && !safeActorUserId)
      },
      created_at: new Date()
    };
    const { error } = await supabase.from("report_feedback").insert(payload);
    if (error) {
      console.error("[kiosk-feedback] insert failed", {
        code: error?.code || null,
        message: error?.message || "Unknown error",
        details: error?.details || null,
        hint: error?.hint || null,
        payload_preview: {
          reqid,
          reqno,
          has_lab_id: Boolean(payload.lab_id),
          has_actor_user_id: Boolean(payload.actor_user_id),
          source: payload.source
        }
      });
      return new Response(error?.message || "Failed to save kiosk feedback", { status: 500 });
    }

    return NextResponse.json({ ok: true, stored: true }, { status: 200 });
  } catch (error) {
    return new Response(error?.message || "Failed to save kiosk feedback", { status: 500 });
  }
}
