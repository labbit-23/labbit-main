import crypto from "crypto";
import { supabase } from "@/lib/supabaseServer";
import { sendTemplateMessage } from "@/lib/whatsapp/sender";

// Tunables mirror labit-core's patient auth (opaque bearer, sliding TTL).
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_COOLDOWN_MS = 30 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_DAYS = Number(process.env.APP_SESSION_DAYS || 90);
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");

export function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

const sessionExpiry = () => new Date(Date.now() + SESSION_DAYS * 86400 * 1000);

async function sendOtp(phone, otp) {
  const labId = process.env.APP_OTP_WHATSAPP_LAB_ID || process.env.WHATSAPP_LAB_ID || process.env.DEFAULT_LAB_ID;
  if (!labId) throw new Error("WhatsApp OTP sender lab is not configured (APP_OTP_WHATSAPP_LAB_ID)");
  await sendTemplateMessage({
    labId,
    phone,
    templateName: process.env.APP_OTP_TEMPLATE_NAME || "otp_labit",
    templateParams: [otp],
    copyCodeValue: otp,
  });
}

/** Returns {ok:true} always for a valid phone (no account enumeration:
 * sign-up is open, so every phone number is a valid login target). */
export async function requestOtp(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return { error: "Enter a valid 10-digit mobile number", status: 422 };

  const { data: recent, error: recentErr } = await supabase
    .from("app_patient_otp")
    .select("created_at")
    .eq("phone", normalized)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentErr) throw recentErr;
  if (recent && Date.now() - new Date(recent.created_at).getTime() < OTP_COOLDOWN_MS) {
    return { ok: true }; // don't spam the gateway or leak timing
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const { error } = await supabase.from("app_patient_otp").insert({
    phone: normalized,
    otp_hash: sha256(otp),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });
  if (error) throw error;

  await sendOtp(normalized, otp);
  return { ok: true };
}

async function issueSession(patient, loginMethod, deviceLabel) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = sessionExpiry();
  const { error } = await supabase.from("app_patient_session").insert({
    patient_id: patient.id,
    token_hash: sha256(token),
    login_method: loginMethod,
    device_label: deviceLabel ? String(deviceLabel).slice(0, 120) : null,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;
  return {
    token,
    expires_at: expiresAt.toISOString(),
    patient: { id: patient.id, phone: patient.phone, name: patient.name },
  };
}

export async function verifyOtp(phone, otp, deviceLabel) {
  const normalized = normalizePhone(phone);
  const code = String(otp || "").trim();
  if (!normalized || !/^\d{6}$/.test(code)) {
    return { error: "Invalid or expired code", status: 400 };
  }

  const { data: row, error } = await supabase
    .from("app_patient_otp")
    .select("id, otp_hash, attempts")
    .eq("phone", normalized)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!row || row.attempts >= OTP_MAX_ATTEMPTS) {
    return { error: "Invalid or expired code", status: 400 };
  }

  const a = Buffer.from(sha256(code));
  const b = Buffer.from(row.otp_hash);
  if (!crypto.timingSafeEqual(a, b)) {
    await supabase.from("app_patient_otp").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return { error: "Invalid or expired code", status: 400 };
  }

  // Single-use: only the request that flips consumed_at gets a session.
  const { data: consumed, error: consumeErr } = await supabase
    .from("app_patient_otp")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id");
  if (consumeErr) throw consumeErr;
  if (!consumed || consumed.length === 0) {
    return { error: "Invalid or expired code", status: 400 };
  }

  // Zero-link sign-up: first successful OTP creates the identity.
  const { data: patient, error: upsertErr } = await supabase
    .from("app_patient")
    .upsert({ phone: normalized }, { onConflict: "phone" })
    .select("id, phone, name")
    .single();
  if (upsertErr) throw upsertErr;

  return { session: await issueSession(patient, "otp", deviceLabel) };
}

/** Resolve `Authorization: Bearer` to a live session, sliding expiry.
 * Returns null for anything invalid (never says why). */
export async function authenticate(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data: row, error } = await supabase
    .from("app_patient_session")
    .select("id, patient_id, last_seen_at, app_patient(id, phone, name)")
    .eq("token_hash", sha256(token))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !row) return null;

  if (Date.now() - new Date(row.last_seen_at).getTime() > TOUCH_INTERVAL_MS) {
    await supabase
      .from("app_patient_session")
      .update({ last_seen_at: new Date().toISOString(), expires_at: sessionExpiry().toISOString() })
      .eq("id", row.id);
  }
  return { sessionId: row.id, patient: row.app_patient };
}

export async function logout(sessionId) {
  await supabase
    .from("app_patient_session")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", sessionId);
}
