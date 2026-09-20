// Security review, 2026-09-20 (Labit App session): a minimal, best-effort
// rate limiter for pre-auth routes that can't require a session (login-
// adjacent lookups) and don't already have a natural DB table to key a
// throttle off of (unlike app/api/send-otp/route.js, which reuses
// otp_codes). HONEST LIMITS: this is in-process memory, so it resets on
// every deploy/restart and does NOT share state across multiple pm2
// instances if this app is ever scaled beyond one. That's a real gap, not
// a hidden one -- it raises the cost of casual enumeration from a single
// process without claiming to be a complete defense. If labit-main ever
// runs multi-instance (like labit-ui's 2-instance cluster), this needs a
// shared store (DB table or Redis) instead.
const buckets = new Map();

/**
 * @param {string} key - e.g. `${routeName}:${phone}`
 * @param {number} maxRequests
 * @param {number} windowMs
 * @returns {boolean} true if the request should be allowed
 */
export function allowRequest(key, maxRequests, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });
    return true;
  }

  if (bucket.count >= maxRequests) {
    return false;
  }

  bucket.count += 1;
  return true;
}
