// Short-lived signed link for the public WhatsApp feedback page.
// Shape matches the HMAC (phone + reqid/reqno + expiry, no DB row) convention
// already scoped for the Home Visit web-form link
// (see memory: whatsapp-pricing-optimization-scope.md, section A) — this is
// the first concrete implementation of that pattern in labit-main.
import crypto from "crypto";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function getSecret() {
  const secret = process.env.FEEDBACK_LINK_SECRET || process.env.SECRET_COOKIE_PASSWORD;
  if (!secret) {
    throw new Error("FEEDBACK_LINK_SECRET (or SECRET_COOKIE_PASSWORD) is not configured");
  }
  return secret;
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payloadB64) {
  return crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
}

/**
 * Signs a short-lived token carrying the identifying fields for one
 * feedback submission. The token IS the credential — it is never looked up
 * against a DB row, so anything the submit route needs to trust (reqid,
 * reqno, phone) must be embedded here, not supplied again by the client.
 */
export function signFeedbackToken({ reqid = null, reqno = null, labId = null, phone = null, ttlMs = DEFAULT_TTL_MS } = {}) {
  const payload = {
    reqid: String(reqid || "").trim() || null,
    reqno: String(reqno || "").trim() || null,
    labId: String(labId || "").trim() || null,
    phone: String(phone || "").replace(/\D/g, "").slice(-10) || null,
    iat: Date.now(),
    exp: Date.now() + Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS)
  };
  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

/**
 * Verifies a token produced by signFeedbackToken. Returns
 * {ok:true, payload} or {ok:false, error}. Never throws on malformed input.
 */
export function verifyFeedbackToken(token) {
  try {
    const text = String(token || "").trim();
    if (!text || !text.includes(".")) {
      return { ok: false, error: "Missing or malformed token" };
    }
    const [payloadB64, sig] = text.split(".");
    if (!payloadB64 || !sig) {
      return { ok: false, error: "Missing or malformed token" };
    }
    const expectedSig = signPayload(payloadB64);
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { ok: false, error: "Invalid token signature" };
    }
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: "Invalid token payload" };
    }
    if (!Number.isFinite(payload.exp) || Date.now() > payload.exp) {
      return { ok: false, error: "Token expired", expired: true };
    }
    if (!payload.reqid && !payload.reqno) {
      return { ok: false, error: "Token missing requisition reference" };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "Invalid token" };
  }
}

/** Builds the public feedback page URL for a WhatsApp link message. */
export function buildFeedbackLink({ reqid = null, reqno = null, labId = null, phone = null, ttlMs } = {}) {
  const token = signFeedbackToken({ reqid, reqno, labId, phone, ttlMs });
  const base = String(process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  const path = `/feedback?t=${encodeURIComponent(token)}`;
  return base ? `${base}${path}` : path;
}
