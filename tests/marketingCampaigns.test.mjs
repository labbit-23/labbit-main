import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test";

const { normalizeConfig, validateConfig, withinSendWindow, istParts, estimateCost, isStopMessage } = await import("../lib/marketingCampaigns/index.js");

test("limits are clamped to the hard ceilings and the window cannot be widened", () => {
  const cfg = normalizeConfig({
    template: { name: "diwali_offer", params: ["first_name"] }, segment: { type: "package" },
    limits: { per_run_cap: 99999, daily_cap: 99999, rate_per_minute: 9999, window_start_hhmm: "06:00", window_end_hhmm: "23:00" }
  });
  assert.equal(cfg.limits.per_run_cap, 500);
  assert.equal(cfg.limits.daily_cap, 5000);
  assert.equal(cfg.limits.rate_per_minute, 120);
  assert.equal(cfg.limits.window_start_hhmm, "09:00");
  assert.equal(cfg.limits.window_end_hhmm, "20:00");
  assert.deepEqual(validateConfig(cfg), []);
});

test("validation rejects unknown segment, variable and non-https image", () => {
  const cfg = normalizeConfig({ template: { name: "x", params: ["nope"], header_image_url: "http://a/b.jpg" }, segment: { type: "everyone" } });
  const errs = validateConfig(cfg).join(" | ");
  assert.match(errs, /segment\.type/);
  assert.match(errs, /Unknown template variable: nope/);
  assert.match(errs, /https/);
});

test("send window is 09:00-20:00 IST", () => {
  const cfg = normalizeConfig({ template: { name: "x" }, segment: { type: "package" } });
  assert.equal(withinSendWindow(cfg, new Date("2026-10-27T03:29:00Z")), false);  // 08:59 IST
  assert.equal(withinSendWindow(cfg, new Date("2026-10-27T03:30:00Z")), true);   // 09:00 IST
  assert.equal(withinSendWindow(cfg, new Date("2026-10-27T14:29:00Z")), true);   // 19:59 IST
  assert.equal(withinSendWindow(cfg, new Date("2026-10-27T14:30:00Z")), false);  // 20:00 IST
  assert.equal(istParts(new Date("2026-10-26T19:00:00Z")).date, "2026-10-27");
});

test("cost estimate and stop words", () => {
  const cfg = normalizeConfig({ template: { name: "x" }, segment: { type: "package" }, cost: { per_message_inr: 1, gst_rate: 0.18 } });
  assert.equal(estimateCost(1000, cfg).inr_with_gst, 1180);
  assert.equal(isStopMessage("STOP"), true);
  assert.equal(isStopMessage("stop promotions"), true);
  assert.equal(isStopMessage("please stop calling"), false);
});
