// Tests for lib/appAuth/* -- the new Labit App auth (phone OTP +
// revocable bearer sessions). lib/appAuth itself is deliberately NOT
// modified by this security review (already on main, deployed) --
// these tests import it as-is.
//
// Scope: this repo has zero existing test/mocking infrastructure, and
// lib/appAuth/service.js's DB-touching exports (requestOtp, verifyOtp,
// authenticate, logout) all call the live-configured `supabase` client
// with no dependency-injection seam to swap in a fake -- unit-testing
// them properly needs either a test database or a mocking layer, neither
// of which exists yet. Covered here: the pure, side-effect-free logic
// (normalizePhone) and the CORS/response helpers in http.js, which don't
// touch the network. The DB-dependent functions are a real, flagged gap
// -- see the "not covered" block at the end of this file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "@/lib/appAuth/service.js";
import { json, preflight } from "@/lib/appAuth/http.js";

test("normalizePhone: strips non-digits and keeps last 10", () => {
  assert.equal(normalizePhone("+91 98765-43210"), "9876543210");
  assert.equal(normalizePhone("919876543210"), "9876543210");
  assert.equal(normalizePhone("9876543210"), "9876543210");
});

test("normalizePhone: rejects anything under 10 digits", () => {
  assert.equal(normalizePhone("98765"), "");
  assert.equal(normalizePhone(""), "");
  assert.equal(normalizePhone(null), "");
  assert.equal(normalizePhone(undefined), "");
});

function fakeRequest(headers = {}) {
  return { headers: new Headers(headers) };
}

test("http.json: allowed origin gets CORS headers echoed back", () => {
  const req = fakeRequest({ origin: "capacitor://localhost" });
  const res = json(req, { ok: true }, 200);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "capacitor://localhost");
  assert.equal(res.headers.get("Access-Control-Allow-Methods"), "GET, POST, OPTIONS");
});

test("http.json: unrecognized origin gets no CORS allow headers", () => {
  const req = fakeRequest({ origin: "https://evil.example" });
  const res = json(req, { ok: true }, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
  // Vary: Origin should still be set so caches don't leak the response
  // across different origins.
  assert.equal(res.headers.get("Vary"), "Origin");
});

test("http.json: extra origins from APP_ALLOWED_ORIGINS are honored", () => {
  const prev = process.env.APP_ALLOWED_ORIGINS;
  process.env.APP_ALLOWED_ORIGINS = "https://app.example.com";
  try {
    const req = fakeRequest({ origin: "https://app.example.com" });
    const res = json(req, {}, 200);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://app.example.com");
  } finally {
    if (prev === undefined) delete process.env.APP_ALLOWED_ORIGINS;
    else process.env.APP_ALLOWED_ORIGINS = prev;
  }
});

test("http.preflight: 204 with no body", async () => {
  const req = fakeRequest({ origin: "capacitor://localhost" });
  const res = preflight(req);
  assert.equal(res.status, 204);
  const body = await res.text();
  assert.equal(body, "");
});

// --- Not covered (flagged, not silently skipped) ---
// requestOtp/verifyOtp/authenticate/logout all call the live supabase
// client directly with no seam to inject a fake. Testing these properly
// needs one of:
//   1. A test/staging Supabase project + real inserts against
//      app_patient_otp/app_patient_session, cleaned up per test.
//   2. Refactoring service.js to accept an injected client (would touch
//      the file this review was told to leave alone).
// Until one of those exists, the behavioral guarantees that matter most
// (timing-safe OTP comparison, single-use consumption via the
// `.is("consumed_at", null)` guard, sliding session expiry, opaque
// bearer tokens hashed at rest) are enforced by the code itself but not
// yet regression-tested.
