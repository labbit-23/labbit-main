import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test";
process.env.NEOSOFT_API_BASE_URL ||= "http://localhost:9";

const eng = await import("../lib/marketingCampaigns/index.js");
const offers = await import("../lib/marketingCampaigns/offers.js");
const client = await import("../lib/marketingCampaigns/audienceClient.js");
const store = await import("../lib/marketingCampaigns/store.js");
const auth = await import("../lib/marketingCampaigns/adminAuth.js");

test("a composable filter segment validates; limits still clamp to the hard ceilings", () => {
  const cfg = eng.normalizeConfig({
    template: { name: "t", params: ["first_name", "offer_text", "focus_areas"] }, segment: { filter: { months_since_last_visit_min: 12 } },
    limits: { per_run_cap: 99999, daily_cap: 99999, rate_per_minute: 99999 }, pilot_size: 99999
  });
  assert.equal(cfg.segment.type, "filter");
  assert.deepEqual(eng.validateConfig(cfg), []);
  assert.equal(cfg.limits.per_run_cap, 500);
  assert.equal(cfg.limits.daily_cap, 5000);
  assert.equal(cfg.limits.rate_per_minute, 120);
  assert.equal(cfg.pilot_size, 500);
  assert.match(eng.validateConfig(eng.normalizeConfig({ template: { name: "t" }, segment: { type: "filter" } })).join(), /filter is required/);
});

test("registry template builds the config block; draft templates are refused", () => {
  const ok = eng.buildCampaignConfig({ template_key: "trend_reports", filter: { sex: "F" }, offer_id: "o1", limits: { daily_cap: 10 } });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.config.template.name, "trend_reports");
  assert.equal(ok.config.template.key, "trend_reports");
  assert.deepEqual(ok.config.segment.filter, { sex: "F" });
  const draft = eng.buildCampaignConfig({ template_key: "health_trend_link", filter: { sex: "F" } });
  assert.match(draft.errors.join(), /not approved/);
  assert.ok(draft.config.template.buttons.length >= 1, "dynamic url button gets the summary token");
  assert.match(eng.buildCampaignConfig({ template_key: "nope" }).errors.join(), /Unknown template key/);
  const saved = eng.buildCampaignConfig({ template_key: "trend_reports" }, { id: "s1", filter: { z: 2 } });
  assert.equal(saved.config.segment.saved_id, "s1");
});

test("offers: validation, activity window, tier text, snapshot", () => {
  const o = offers.normalizeOffer({
    name: "Diwali", discount_type: "pct", value: 20, applies_to_packages: ["Executive Health Checkup"], valid_from: "2026-11-01", valid_to: "2026-11-30",
    tier_map: { gold: { value: 30 }, vip: { text: "Free vitamin D with any package" } }, code: "diwali20"
  });
  assert.deepEqual(offers.validateOffer(o), []);
  assert.equal(o.code, "DIWALI20");
  assert.match(offers.validateOffer(offers.normalizeOffer({ name: "x", discount_type: "pct", value: 150 })).join(), /exceed 100/);
  assert.match(offers.validateOffer(offers.normalizeOffer({ name: "x", discount_type: "bogus", value: 1 })).join(), /pct or flat/);
  assert.equal(offers.offerIsActive(o, "2026-10-31"), false);
  assert.equal(offers.offerIsActive(o, "2026-11-30"), true);
  assert.equal(offers.offerIsActive(o, "2026-12-01"), false);
  assert.equal(offers.offerTextFor(o, null), "20% off on Executive Health Checkup");
  assert.equal(offers.offerTextFor(o, "gold"), "30% off on Executive Health Checkup");
  assert.equal(offers.offerTextFor(o, "vip"), "Free vitamin D with any package");
  assert.equal(offers.formatValidTill("2026-11-30"), "30 Nov 2026");
  const snap = offers.snapshotFor({ ...o, id: "o1" }, { offer_tier: "gold", focus_areas: ["liver", "vitamin D"] });
  assert.deepEqual(snap, { offer_id: "o1", offer_text: "30% off on Executive Health Checkup", focus_areas: "liver, vitamin D", offer_tier: "gold" });
  assert.equal(offers.snapshotFor(null, { focus_areas: [] }).offer_text, null);
});

test("offer variables resolve from the sender context", async () => {
  const { resolveParam } = await import("../lib/patientMessageJobs/variables.js");
  assert.equal(resolveParam("offer_text", { offer_text: "20% off" }), "20% off");
  assert.equal(resolveParam("focus_areas", {}), "");
});

test("pilot sample is deterministic and independent of row order", () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ phone: `98000000${String(i).padStart(2, "0")}` }));
  const a = eng.pilotOrder(rows, "camp-1").slice(0, 5).map((r) => r.phone);
  const b = eng.pilotOrder([...rows].reverse(), "camp-1").slice(0, 5).map((r) => r.phone);
  const c = eng.pilotOrder(rows, "camp-2").slice(0, 5).map((r) => r.phone);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("funnel and day trend aggregate correctly", () => {
  const rows = [
    { status: "sent", delivery_status: "read", sent_at: "2026-11-01T05:00:00Z", clicked: true, replied: true },
    { status: "sent", delivery_status: "delivered", sent_at: "2026-11-01T06:00:00Z" },
    { status: "sent", delivery_status: "failed", delivery_error_code: "131026", sent_at: "2026-11-02T06:00:00Z" },
    { status: "failed", error: "x" }, { status: "skipped" }, { status: "pending" }
  ];
  const f = eng.computeFunnel(rows);
  assert.equal(f.prepared, 6); assert.equal(f.sent, 3); assert.equal(f.delivered, 2); assert.equal(f.read, 1);
  assert.equal(f.failed, 2); assert.deepEqual(f.failed_by_code, { "131026": 1, send_error: 1 });
  assert.equal(f.clicked, 1); assert.equal(f.replied, 1); assert.equal(f.skipped, 1);
  const t = eng.aggregateTrend(rows);
  assert.deepEqual(t.map((d) => [d.date, d.sent, d.delivered, d.read, d.failed]), [["2026-11-01", 2, 2, 1, 0], ["2026-11-02", 1, 0, 0, 1]]);
});

test("test-send is limited to the staff allowlist", () => {
  assert.match(eng.filterTestNumbers(["9811111111"], "").error, /not configured/);
  assert.match(eng.filterTestNumbers(["9822222222"], "9811111111").error, /allowlist/);
  assert.deepEqual(eng.filterTestNumbers(["+919811111111"], "9811111111,9833333333").numbers, ["9811111111"]);
  assert.deepEqual(eng.filterTestNumbers([], "9811111111,9833333333").numbers, ["9811111111", "9833333333"]);
});

test("audience client: typo'd or engine-owned filter fields fail before the network call", () => {
  assert.deepEqual(client.validateFilter({ segment: "package", last_visit_before: "2025-04-01", sex: "F", age_min: 35, offer_tier_in: ["standard"], exclude_sources: ["X"] }), []);
  assert.match(client.validateFilter({ last_vist_before: "2025-04-01" }).join(), /unknown filter field: last_vist_before/);
  assert.match(client.validateFilter({ opted_out_phones: ["1"] }).join(), /set by the engine/);
  assert.match(client.validateFilter({ last_visit_before: "01/04/2025", package_ids: "PKG1", offer_tier_in: ["gold"] }).join(), /YYYY-MM-DD.*must be a list.*offer_tier_in/);
  assert.match(eng.validateConfig(eng.normalizeConfig({ template: { name: "t" }, segment: { filter: { nope: 1 } } })).join(), /unknown filter field: nope/);
  assert.match(store.validateSegmentInput({ name: "x", filter: { nope: 1 } }).join(), /unknown filter field/);
});

test("audience client: request body carries opt-outs, recent sends, pilot controls and the one cost rate; PII scrubbed from previews", () => {
  const body = client.buildQueryBody({ sex: "F", focus_areas_any: ["lipids"], messaged: [{ phone: "leak" }] }, {
    optedOutPhones: ["9000000001"], messaged: [{ phone: "9000000002", sent_on: "2026-10-20" }], cooldownDays: 30, maxAudience: 150, sampleSeed: "camp-1", ratePerMessageInr: 0.88
  });
  assert.deepEqual(body.opted_out_phones, ["9000000001"]);
  assert.deepEqual(body.messaged, [{ phone: "9000000002", sent_on: "2026-10-20" }]);
  assert.equal(body.max_audience, 150); assert.equal(body.sample_seed, "camp-1");
  assert.equal(body.include_focus, true); assert.equal(body.per_message_rate_inr, 0.88); assert.equal(body.cooldown_days, 30);
  assert.equal(client.buildQueryBody({}, {}).include_focus, undefined);
  assert.equal(client.legacyQuery({ type: "package", last_visit_before: "2025-10-26" }, 21).get("segment"), "package");
  assert.deepEqual(client.scrubPii({ funnel: { n: 3 }, sample: [{ name: "X", phone: "1", area: "liver" }] }), { funnel: { n: 3 }, sample: [{ area: "liver" }] });
  assert.match(eng.estimateCost(10, eng.normalizeConfig({ template: { name: "t" }, segment: { type: "package" } })).note, /verify vs Mtalkz/);
});

test("snapshot prefers labit-core's focus_text phrase over the label list", () => {
  assert.equal(offers.snapshotFor(null, { focus_areas: ["Blood sugar"], focus_text: "blood sugar and cholesterol" }).focus_areas, "blood sugar and cholesterol");
  assert.equal(offers.snapshotFor(null, { focus_areas: ["Blood sugar", "Liver"] }).focus_areas, "Blood sugar, Liver");
});

test("audit details never carry identifiers", () => {
  const d = store.auditSafe({ numbers: ["9811111111"], phone: "1", numbers_count: 2, name: "A", limits: { daily_cap: 5 }, sample: [{ x: 1 }] });
  assert.deepEqual(d, { numbers_count: 2, limits: { daily_cap: 5 } });
});

test("admin auth: role/user allowlist, patients refused", () => {
  const env = { MARKETING_ADMIN_ROLES: "director", MARKETING_ADMIN_USERS: "u42" };
  assert.equal(auth.canManageMarketing({ userType: "executive", executiveType: "director" }, env), true);
  assert.equal(auth.canManageMarketing({ userType: "executive", executiveType: "manager" }, env), false);
  assert.equal(auth.canManageMarketing({ userType: "executive", executiveType: "manager", id: "u42" }, env), true);
  assert.equal(auth.canManageMarketing({ userType: "patient" }, env), false);
  assert.equal(auth.canManageMarketing(null, env), false);
  assert.equal(auth.canManageMarketing({ userType: "admin" }, {}), true);
});
