import test from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES } from "../lib/marketingCampaigns/templateRegistry.js";
import * as h from "../lib/marketingUi/helpers.js";

test("clampLimits enforces hard ceilings and the IST window", () => {
  const { limits, clamped } = h.clampLimits({ per_run_cap: 9999, daily_cap: 99999, rate_per_minute: 500, window_start_hhmm: "06:00", window_end_hhmm: "23:00" });
  assert.deepEqual([limits.per_run_cap, limits.daily_cap, limits.rate_per_minute], [500, 5000, 120]);
  assert.deepEqual([limits.window_start_hhmm, limits.window_end_hhmm], ["09:00", "20:00"]);
  assert.deepEqual(clamped, ["per_run_cap", "daily_cap", "rate_per_minute"]);
  assert.equal(h.clampLimits({ window_start_hhmm: "15:00", window_end_hhmm: "12:00" }).limits.window_start_hhmm, "09:00");
});

test("shapeFunnel: running-total array and exclusion object both give removed counts", () => {
  const a = h.shapeFunnel({ funnel: [{ key: "total", count: 1000 }, { key: "opted_out", count: 950 }, { key: "audience_after_exclusions", count: 900 }] });
  assert.deepEqual(a.map((s) => s.removed), [0, 50, 50]);
  assert.equal(a[2].kind, "final");
  const b = h.shapeFunnel({ stats: { eligible: 4210, opted_out: 12, messaged_recently: 80, pilot_size: 50, audience_after_exclusions: 4210 } });
  assert.equal(b[0].count, 4302);
  assert.equal(b.find((s) => s.key === "opted_out").count, 4290);
  assert.equal(b.at(-1).count, 4210);
  assert.deepEqual(h.shapeFunnel({}), []);
});

test("breakdowns, cost and results funnel", () => {
  const bd = h.shapeBreakdowns({ breakdowns: { by_package: { A: 10, B: 40 }, by_last_visit_year: { 2025: 5, 2024: 15 } } });
  assert.equal(bd.byPackage[0].label, "B");
  assert.equal(bd.byPackage[0].pct, 100);
  assert.deepEqual(bd.byYear.map((y) => y.label), ["2024", "2025"]);
  assert.deepEqual(h.shapeCost({ cost_estimate: { messages: 50, inr_with_gst: 52 } }), { messages: 50, inrWithGst: 52, inrExGst: null });
  const rows = h.shapeResultsFunnel({ prepared: 50, sent: 48, delivered: 24, read: 12, failed: 3 });
  assert.equal(rows.find((r) => r.key === "delivered").pct, 50);
  assert.equal(h.pctOf(1, 0), 0);
  const f = h.failureRows({ funnel: { failed_by_code: { 131026: 2, send_error: 1 } } });
  assert.equal(f[0].code, "131026");
});

test("template preview fills variables and flags missing ones; draft templates are not selectable", () => {
  const t = TEMPLATES.find((x) => x.key === "trend_reports");
  const r = h.renderTemplate(t);
  assert.ok(r.segments.some((s) => s.variable === "first_name" && s.text === "Rahul"));
  assert.equal(r.missing.length, 0);
  assert.equal(r.hasImageHeader, true);
  assert.deepEqual(h.renderTemplate(t, { first_name: "" }).missing, ["first_name"]);
  const draft = TEMPLATES.find((x) => x.status === "draft");
  assert.equal(h.templateSelectable(draft).ok, false);
  assert.match(h.templateSelectable(draft).hint, /Submit to Meta first/);
  assert.equal(h.templateSelectable(t).ok, true);
});

test("header image validation: type/size are errors, ratio/width only warn", () => {
  assert.equal(h.validateHeaderImage({ type: "image/gif", size: 100, width: 1200, height: 628 }).ok, false);
  assert.equal(h.validateHeaderImage({ type: "image/png", size: 6 * 1024 * 1024, width: 1200, height: 628 }).ok, false);
  const good = h.validateHeaderImage({ type: "image/jpeg", size: 1000, width: 1200, height: 628 });
  assert.ok(good.ok && good.warnings.length === 0);
  const sq = h.validateHeaderImage({ type: "image/png", size: 1000, width: 600, height: 600 });
  assert.ok(sq.ok);
  assert.equal(sq.warnings.length, 2);
});

test("readImageSize parses PNG and JPEG headers", () => {
  const png = Buffer.alloc(32); Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(png); png.writeUInt32BE(1200, 16); png.writeUInt32BE(628, 20);
  assert.deepEqual(h.readImageSize(png), { type: "image/png", width: 1200, height: 628 });
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x74, 0x04, 0xb0, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(h.readImageSize(jpg), { type: "image/jpeg", width: 1200, height: 628 });
  assert.equal(h.readImageSize(Buffer.from("GIF89a" + "x".repeat(40))), null);
});

test("isCheckableImageUrl blocks non-https, IPs and internal hosts", () => {
  assert.equal(h.isCheckableImageUrl("https://labit.sdrc.in/marketing/trend-header.png"), true);
  for (const u of ["http://example.com/a.png", "https://127.0.0.1/a.png", "https://localhost/a.png", "https://[::1]/a.png", "https://svc.internal/a.png", "https://user:p@example.com/a.png", "nonsense"]) assert.equal(h.isCheckableImageUrl(u), false, u);
});

test("access gating mirrors the API default roles", () => {
  assert.equal(h.canSeeMarketing({ userType: "executive", executiveType: "Director" }), true);
  assert.equal(h.canSeeMarketing({ userType: "admin" }), true);
  assert.equal(h.canSeeMarketing({ userType: "executive", executiveType: "phlebo" }), false);
  assert.equal(h.canSeeMarketing({ userType: "patient" }), false);
  assert.equal(h.canSeeMarketing(null), false);
});

test("launch gate: no skipping the test; send needs a pilot and a typed count", () => {
  const base = { status: "draft", recipients: {}, auditRows: [], dryRunDone: false };
  assert.equal(h.launchGate(base).canPrepare, false);
  assert.equal(h.launchGate({ ...base, dryRunDone: true }).canPrepare, true);
  const prepared = { status: "prepared", recipients: { pending: 50 }, auditRows: [] };
  let g = h.launchGate(prepared);
  assert.deepEqual([g.canTest, g.canPilot, g.canSend], [true, false, false]);
  const tested = { ...prepared, auditRows: [{ action: "campaign.test", details: { ok: true } }] };
  assert.equal(h.launchGate(tested).canPilot, true);
  assert.equal(h.launchGate({ ...prepared, auditRows: [{ action: "campaign.test", details: { ok: false } }] }).canPilot, false);
  g = h.launchGate({ ...tested, status: "running", recipients: { sent: 50 } });
  assert.equal(g.canExpand, true);
  g = h.launchGate({ ...tested, status: "paused", recipients: { sent: 50, pending: 400 } });
  assert.equal(g.canSend, true);
  assert.equal(h.launchGate({ ...tested, needsHeader: true, headerOk: false }).canTest, false);
  assert.equal(h.confirmMatches("4,210", 4210), true);
  assert.equal(h.confirmMatches("420", 4210), false);
  assert.equal(h.confirmMatches("", 0), false);
  assert.deepEqual(h.sendProgress({ stored: 200, sent: 40, failed: 10 }), { done: 50, total: 200, pct: 25 });
});

test("filter form round-trips and validates; offer helpers warn", () => {
  const { filter, error } = h.buildFilter({ ...h.EMPTY_FILTER_FORM, package_names: "A, B\nC", last_visit_before: "2025-10-01", min_visits: "2", advanced: '{"activity_since":"2026-09-19"}' });
  assert.equal(error, null);
  assert.deepEqual(filter, { package_names: ["A", "B", "C"], last_visit_before: "2025-10-01", min_visits: 2, activity_since: "2026-09-19" });
  assert.equal(h.filterToForm(filter).advanced, '{"activity_since":"2026-09-19"}');
  assert.ok(h.buildFilter({ ...h.EMPTY_FILTER_FORM, min_visits: "5", max_visits: "2" }).error);
  assert.ok(h.buildFilter({ ...h.EMPTY_FILTER_FORM, advanced: "[1]" }).error);
  assert.deepEqual(h.buildFilter(h.EMPTY_FILTER_FORM).filter, {});
  assert.ok(h.offerWarnings({ discount_type: "pct", value: 20, valid_to: "2026-10-01", applies_to_packages: ["A"] }, "2026-10-28").includes("This offer has expired."));
  assert.ok(h.offerWarnings({ discount_type: "pct", value: 150, valid_from: "2026-11-01", valid_to: "2026-11-30", applies_to_packages: [] }, "2026-10-28").length >= 2);
  const body = h.offerFormToBody({ ...h.EMPTY_OFFER, name: " Diwali ", value: "20", packages: "A", tiers: [{ tier: "gold", value: "30", text: "" }, { tier: "", value: "1", text: "" }] });
  assert.deepEqual(body.tier_map, { gold: { value: 30 } });
  assert.equal(body.name, "Diwali");
});
