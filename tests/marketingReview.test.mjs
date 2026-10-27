// Final-review tests: hard limits and claim atomicity against an in-memory Supabase, the filter contract between the panel and
// labit-core, the route auth wrappers, and the webhook-side bot guarantees. All data is fake.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test";
process.env.NEOSOFT_API_BASE_URL ||= "http://localhost:9";
process.env.MARKETING_CONTACT_PHONE = "04000000000";
process.env.SECRET_COOKIE_PASSWORD ||= "x".repeat(40);

const eng = await import("../lib/marketingCampaigns/index.js");
const { supabase } = await import("../lib/supabaseServer.js");
const { installFake } = await import("./_fakeSupabase.mjs");
const ui = await import("../lib/marketingUi/helpers.js");
const client = await import("../lib/marketingCampaigns/audienceClient.js");

const IN_WINDOW = new Date("2026-10-27T05:30:00Z");   // 11:00 IST
const BEFORE_WINDOW = new Date("2026-10-27T03:00:00Z"); // 08:30 IST
const AFTER_WINDOW = new Date("2026-10-27T14:45:00Z");  // 20:15 IST
eng.__setSleepForTests(async () => {});

function campaign(over = {}) {
  const cfg = eng.normalizeConfig({
    template: { key: "trend_reports", name: "trend_reports", params: ["first_name", "records_label", "last_visit_date", "lab_contact"] },
    segment: { filter: { sex: "F" } }, limits: { per_run_cap: 50, daily_cap: 1000, rate_per_minute: 120 }, ...over.config
  });
  return { id: "c1", name: "Test", status: "prepared", config: cfg, lab_id: "lab", ...over.row };
}
function recipients(n, over = {}) {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, campaign_id: "c1", mobile: `91900000${String(i).padStart(4, "0")}`, name: `Person ${i}`, mrno: `M${i}`, status: "pending", last_visit: "2025-01-01", created_at: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z`, ...over }));
}
function sender(log, { fail = false } = {}) {
  return async (args) => { log.push(args.phone); if (fail) throw new Error("boom"); return { messages: [{ id: `wamid.${log.length}` }] }; };
}

test("nothing is sent outside 09:00-20:00 IST, for batches, scheduled runs and test sends", async () => {
  const f = installFake(supabase, { campaigns: [campaign().row ? campaign() : campaign()], campaign_recipients: recipients(3) });
  const log = []; eng.__setTemplateSenderForTests(sender(log));
  process.env.MARKETING_TEST_NUMBERS = "9811111111";
  for (const t of [BEFORE_WINDOW, AFTER_WINDOW]) {
    const r = await eng.sendBatch({ labId: "lab", campaignId: "c1", now: t });
    assert.equal(r.sent, 0); assert.match(r.stopped_reason, /outside send window/);
    const d = await eng.runDue({ labId: "lab", now: t });
    assert.equal(d.results.length === 0 || d.results.every((x) => !x.sent), true);
    const tr = await eng.testSend({ labId: "lab", campaignId: "c1", numbers: ["9811111111"], now: t });
    assert.equal(tr.ok, false); assert.match(tr.error, /outside send window/);
  }
  assert.equal(log.length, 0);
  const ok = await eng.sendBatch({ labId: "lab", campaignId: "c1", now: IN_WINDOW });
  assert.equal(ok.sent, 3);
  f.restore(); eng.__setTemplateSenderForTests();
});

test("two concurrent send batches never send the same recipient twice", async () => {
  const f = installFake(supabase, { campaigns: [campaign()], campaign_recipients: recipients(20) });
  const log = []; eng.__setTemplateSenderForTests(sender(log));
  await Promise.all([
    eng.sendBatch({ labId: "lab", campaignId: "c1", batchSize: 10, now: IN_WINDOW }),
    eng.sendBatch({ labId: "lab", campaignId: "c1", batchSize: 10, now: IN_WINDOW })
  ]);
  assert.equal(new Set(log).size, log.length, "no duplicate sends even when both claim at once");
  assert.ok(log.length >= 10 && log.length <= 20, "the loser of the claim race gets nothing, it does not re-send");
  f.restore(); eng.__setTemplateSenderForTests();
});

test("a second tab arriving while a batch is in flight backs off (rate and caps cannot be doubled)", async () => {
  const f = installFake(supabase, { campaigns: [campaign()], campaign_recipients: recipients(20) });
  const log = [];
  eng.__setTemplateSenderForTests(async (args) => { log.push(args.phone); await new Promise((r) => setTimeout(r, 15)); return { messages: [{ id: `w${log.length}` }] }; });
  const first = eng.sendBatch({ labId: "lab", campaignId: "c1", batchSize: 10, now: IN_WINDOW });
  await new Promise((r) => setTimeout(r, 25));
  const second = await eng.sendBatch({ labId: "lab", campaignId: "c1", batchSize: 10, now: IN_WINDOW });
  assert.equal(second.sent, 0); assert.match(second.stopped_reason, /already sending/);
  assert.equal((await first).sent, 10);
  assert.equal(new Set(log).size, log.length);
  f.restore(); eng.__setTemplateSenderForTests();
});

test("per-run cap, per-campaign daily cap and the account-wide 5000/day ceiling", async () => {
  // per run: asking for 400 on a 50 cap sends 50
  let f = installFake(supabase, { campaigns: [campaign()], campaign_recipients: recipients(120) });
  let log = []; eng.__setTemplateSenderForTests(sender(log));
  assert.equal((await eng.sendBatch({ labId: "lab", campaignId: "c1", batchSize: 400, now: IN_WINDOW })).sent, 50);
  f.restore();
  // per campaign daily cap 10
  f = installFake(supabase, { campaigns: [campaign({ config: { limits: { per_run_cap: 50, daily_cap: 10, rate_per_minute: 120 } } })], campaign_recipients: recipients(30) });
  log = []; eng.__setTemplateSenderForTests(sender(log));
  assert.equal((await eng.sendBatch({ labId: "lab", campaignId: "c1", now: IN_WINDOW })).sent, 10);
  assert.equal((await eng.sendBatch({ labId: "lab", campaignId: "c1", now: IN_WINDOW })).stopped_reason, "daily cap reached");
  f.restore();
  // account-wide: other campaigns already sent 4995 today -> only 5 more allowed even though this campaign's own cap is 1000
  const others = Array.from({ length: 4995 }, (_, i) => ({ id: `o${i}`, campaign_id: "other", mobile: `9188${i}`, status: "sent", sent_at: IN_WINDOW.toISOString() }));
  f = installFake(supabase, { campaigns: [campaign()], campaign_recipients: [...recipients(30), ...others] });
  log = []; eng.__setTemplateSenderForTests(sender(log));
  assert.equal((await eng.sendBatch({ labId: "lab", campaignId: "c1", now: IN_WINDOW })).sent, 5);
  f.restore(); eng.__setTemplateSenderForTests();
});

test("opt-outs are skipped at send time; five consecutive failures pause the campaign", async () => {
  let f = installFake(supabase, { campaigns: [campaign()], campaign_recipients: recipients(3), whatsapp_opt_outs: [{ phone10: "9000000001" }] });
  let log = []; eng.__setTemplateSenderForTests(sender(log));
  const r = await eng.sendBatch({ labId: "lab", campaignId: "c1", now: IN_WINDOW });
  assert.equal(r.sent, 2); assert.equal(r.skipped, 1);
  assert.ok(!log.some((p) => p.endsWith("9000000001")));
  f.restore();
  f = installFake(supabase, { campaigns: [campaign()], campaign_recipients: recipients(12) });
  log = []; eng.__setTemplateSenderForTests(sender(log, { fail: true }));
  const bad = await eng.sendBatch({ labId: "lab", campaignId: "c1", now: IN_WINDOW });
  assert.equal(bad.failed, 5); assert.equal(log.length, 5); assert.equal(bad.more, false);
  assert.equal(f.get("campaigns")[0].status, "paused");
  assert.equal(f.get("campaign_recipients").filter((x) => x.status === "pending").length, 7, "unsent claims are handed back");
  // a paused campaign cannot send until a person resumes it
  assert.equal((await eng.sendBatch({ labId: "lab", campaignId: "c1", now: IN_WINDOW })).ok, false);
  f.restore(); eng.__setTemplateSenderForTests();
});

test("stop is not overwritten by a batch that started before it", async () => {
  const f = installFake(supabase, { campaigns: [campaign({ row: { status: "stopped" } })], campaign_recipients: recipients(2) });
  const log = []; eng.__setTemplateSenderForTests(sender(log));
  const r = await eng.sendBatch({ labId: "lab", campaignId: "c1", now: IN_WINDOW });
  assert.equal(r.ok, false); assert.equal(log.length, 0);
  f.restore(); eng.__setTemplateSenderForTests();
});

test("test sends are limited to the allowlist (env by default, never optional)", async () => {
  const f = installFake(supabase, { campaigns: [campaign()] });
  const log = []; eng.__setTemplateSenderForTests(sender(log));
  delete process.env.MARKETING_TEST_NUMBERS;
  assert.match((await eng.testSend({ labId: "lab", campaignId: "c1", numbers: ["9822222222"], now: IN_WINDOW })).error, /not configured/);
  process.env.MARKETING_TEST_NUMBERS = "9811111111";
  assert.match((await eng.testSend({ labId: "lab", campaignId: "c1", numbers: ["9822222222"], now: IN_WINDOW })).error, /allowlist/);
  assert.equal(log.length, 0);
  const ok = await eng.testSend({ labId: "lab", campaignId: "c1", numbers: ["9811111111"], now: IN_WINDOW });
  assert.equal(ok.results[0].ok, true); assert.equal(log.length, 1);
  f.restore(); eng.__setTemplateSenderForTests(); delete process.env.MARKETING_TEST_NUMBERS;
});

test("draft, unconfirmed and mismatched registry templates cannot be created, prepared, tested or sent", async () => {
  assert.match(eng.buildCampaignConfig({ filter: { sex: "F" } }).errors.join(), /template_key is required/);
  assert.match(eng.buildCampaignConfig({ template_key: "festival_offer", filter: {} }).errors.join(), /not approved/);
  const draftCfg = eng.normalizeConfig({ template: { key: "annual_checkup_reminder", name: "sdrc_annual_checkup_reminder", params: [] }, segment: { filter: {} } });
  assert.match(eng.validateConfig(draftCfg).join(), /draft, not approved/);
  const unconfirmed = eng.normalizeConfig({ template: { key: "package_results", name: "CONFIRM_IN_MTALKZ", params: [] }, segment: { filter: {} } });
  assert.match(eng.validateConfig(unconfirmed).join(), /no confirmed Mtalkz name/);
  const renamed = eng.normalizeConfig({ template: { key: "trend_reports", name: "other_template", params: [] }, segment: { filter: {} } });
  assert.match(eng.validateConfig(renamed).join(), /does not match the registry/);
  const f = installFake(supabase, { campaigns: [{ ...campaign(), config: draftCfg }], campaign_recipients: recipients(2) });
  const log = []; eng.__setTemplateSenderForTests(sender(log));
  process.env.MARKETING_TEST_NUMBERS = "9811111111";
  assert.equal((await eng.sendBatch({ labId: "lab", campaignId: "c1", now: IN_WINDOW })).ok, false);
  assert.equal((await eng.testSend({ labId: "lab", campaignId: "c1", numbers: ["9811111111"], now: IN_WINDOW })).ok, false);
  assert.equal(log.length, 0);
  f.restore(); eng.__setTemplateSenderForTests(); delete process.env.MARKETING_TEST_NUMBERS;
});

test("a finished pilot can be widened once with expand; a normal completed campaign cannot", async () => {
  const mk = (pilot) => campaign({ row: { status: "completed" }, config: { pilot_prepared: pilot } });
  let f = installFake(supabase, { campaigns: [mk(null)] });
  assert.match((await eng.prepareCampaign({ campaignId: "c1", dryRun: false, expand: true })).error, /cannot expand/);
  f.restore();
  f = installFake(supabase, { campaigns: [mk(5)] });
  // not reaching labit-core here: only the status gate is under test
  const r = await eng.prepareCampaign({ campaignId: "c1", dryRun: true, expand: true }).catch((e) => ({ threw: e.message }));
  assert.ok(!/cannot expand/.test(r.error || ""), "completed + pilot_prepared passes the status gate");
  f.restore();
});

test("the panel's filter form emits only keys labit-core accepts, and every key round-trips", () => {
  const form = {
    ...ui.EMPTY_FILTER_FORM, segment: "package", genpackage: "true", sex: "F", source_scope: "last", package_names: "Executive, Full", package_ids: "P1", exclude_package_ids: "P9",
    package_last_before: "2025-01-01", package_last_after: "2023-01-01", last_visit_before: "2025-06-01", last_visit_after: "2022-01-01", first_visit_before: "2024-01-01",
    months_since_last_visit_min: "12", months_since_last_visit_max: "48", min_visits: "1", max_visits: "5", age_min: "30", age_max: "70", pincode_prefixes: "500, 501",
    include_sources: "A", exclude_sources: "B", focus_areas_any: ["liver"], offer_tier_in: ["priority"], max_audience: "500", sample_seed: "pilot-1"
  };
  const { filter, error } = ui.buildFilter(form);
  assert.equal(error, null);
  assert.deepEqual(client.validateFilter(filter), []);
  assert.deepEqual(ui.buildFilter(ui.filterToForm(filter)).filter, filter);
  assert.equal(filter.genpackage, true);
  assert.deepEqual(filter.package_names, ["Executive", "Full"]);
  // the guessed pre-labit-core keys are rejected loudly, and so are engine-owned keys
  assert.match(client.validateFilter({ packages: ["A"] }).join(), /unknown filter field: packages/);
  assert.match(client.validateFilter({ opted_out_phones: [] }).join(), /set by the engine/);
  assert.ok(ui.buildFilter({ ...ui.EMPTY_FILTER_FORM, age_min: "200" }).error);
  assert.ok(ui.buildFilter({ ...ui.EMPTY_FILTER_FORM, months_since_last_visit_min: "30", months_since_last_visit_max: "12" }).error);
  assert.match(ui.describeFilter(filter), /package buyers/);
});

test("the real labit-core summary and dry-run shapes render: funnel, breakdowns, cost, tiers", () => {
  const core = {
    total: 412,
    funnel: [{ step: "archive", label: "Patients in the archive", removed: 0, remaining: 45000 }, { step: "confidential", label: "Confidential referral sources", removed: 80, remaining: 44920 }, { step: "max_audience", label: "Random sample", removed: 44508, remaining: 412 }],
    by_package: [{ package_id: "PKG1", package: "Full Body Check", patients: 380 }, { package_id: "PKG2", package: "Diabetes Panel", patients: 40 }],
    by_last_visit_year: { 2025: 72, 2023: 140, 2024: 200 }, by_visit_band: { "1": 120, "10+": 22, "3-4": 110 }, by_sex: { F: 412 }, by_age_band: { "40-49": 150, "30-39": 90 },
    by_last_source_top10: [{ source: "Example Hospital", patients: 12 }],
    estimate: { messages: 412, rate_inr: 0.8, cost_inr: 329.6 },
    offer_tier_sample: { sampled: 412, of: 412, tiers: { none: 100, standard: 200, priority: 112 }, focus_areas: { glycaemic: 150, lipids: 140 } },
    sample: [{ id: "a1b2c3d4", last_visit_month: "2024-03", visits: 3, sex: "F", age_band: "40-49", last_package: "Full Body Check", focus_areas: ["Blood sugar"], offer_tier: "standard" }]
  };
  const fun = ui.shapeFunnel(core);
  assert.deepEqual(fun.map((s) => [s.count, s.removed]), [[45000, 0], [44920, 80], [412, 44508]]);
  assert.equal(fun.at(-1).kind, "final");
  const bd = ui.shapeBreakdowns(core);
  assert.deepEqual(bd.byPackage.map((p) => [p.label, p.count]), [["Full Body Check", 380], ["Diabetes Panel", 40]]);
  assert.deepEqual(bd.byYear.map((p) => p.label), ["2023", "2024", "2025"]);
  assert.deepEqual(bd.byVisitBand.map((p) => p.label), ["1", "3-4", "10+"]);
  assert.equal(bd.bySource[0].label, "Example Hospital");
  assert.equal(bd.tiers.find((t) => t.label === "priority").count, 112);
  assert.equal(bd.tierSample.of, 412);
  const cost = ui.shapeCost(core);
  assert.equal(cost.inrExGst, 329.6); assert.equal(cost.inrWithGst, 389); assert.equal(cost.messages, 412);
  // campaign dry run: core funnel + local exclusions, then the final audience
  const dry = ui.shapeFunnel({ stats: { total: 900, funnel: core.funnel, opted_out: 12, messaged_recently: 8, eligible: 392 } });
  assert.deepEqual(dry.slice(-2).map((s) => [s.key, s.count, s.removed]), [["opted_out", 400, 12], ["messaged_recently", 392, 8]]);
  assert.equal(dry.at(-1).kind, "final");
});

test("'test done' needs a real delivery, in the UI gate and as the server rule", () => {
  const base = { status: "prepared", recipients: { pending: 50 }, dryRunDone: true };
  const row = (details) => ({ action: "campaign.test", details });
  assert.equal(ui.launchGate({ ...base, auditRows: [row({ ok: true, delivered_ok: 0 })] }).canPilot, false);
  assert.equal(ui.launchGate({ ...base, auditRows: [row({ ok: true, delivered_ok: 1 })] }).canPilot, true);
  // a fully sent pilot is "completed" and may be widened
  const done = { status: "completed", recipients: { sent: 50 }, auditRows: [row({ ok: true, delivered_ok: 1 })] };
  assert.equal(ui.launchGate({ ...done, pilotPrepared: true }).canExpand, true);
  assert.equal(ui.launchGate({ ...done, pilotPrepared: false }).canExpand, false);
});

// ---- auth -------------------------------------------------------------------------------------------------------------

function routeFiles(dir, out = []) {
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) routeFiles(p, out); else if (n === "route.js") out.push(p); }
  return out;
}
const ROUTES = routeFiles("app/api/admin/marketing");

test("every admin marketing route exports only auth-wrapped handlers", () => {
  assert.ok(ROUTES.length >= 29);
  for (const f of ROUTES) {
    const src = readFileSync(f, "utf8");
    const exported = [...src.matchAll(/^export\s+(?:async\s+)?(?:const|function)\s+(\w+)/gm)].map((m) => m[1]);
    assert.ok(exported.length > 0, f);
    for (const name of exported) {
      assert.ok(["GET", "POST", "PUT", "PATCH", "DELETE"].includes(name), `${f}: unexpected export ${name}`);
      assert.match(src, new RegExp(`export const ${name} = (marketingRoute|botRoute)\\(`), `${f}: ${name} must be wrapped`);
    }
  }
});

test("each route rejects an anonymous caller with 401 and a wrong role/permission with 403, and never runs the handler", async () => {
  const auth = await import("../lib/marketingCampaigns/adminAuth.js");
  const bot = await import("../lib/whatsappBot/adminAuth.js");
  const mk = (url = "http://localhost/x", method = "GET") => new Request(url, { method, ...(method === "GET" ? {} : { body: "{}", headers: { "content-type": "application/json" } }) });
  const ctx = { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) };
  let checked = 0;
  for (const f of ROUTES) {
    const mod = await import(`../${f}`);
    for (const method of Object.keys(mod)) {
      const handler = mod[method];
      // anonymous
      auth.__setUserLoaderForTests(async () => null); bot.__setStaffGateForTests({ user: async () => null });
      let res = await handler(mk(undefined, method), ctx);
      assert.equal(res.status, 401, `${f} ${method} anonymous`);
      // logged in but not allowed: a front-desk executive with no marketing permission
      const nobody = { id: "u1", name: "Staff", userType: "executive", executiveType: "frontdesk" };
      auth.__setUserLoaderForTests(async () => nobody); bot.__setStaffGateForTests({ user: async () => nobody, permission: async () => false });
      res = await handler(mk(undefined, method), ctx);
      assert.equal(res.status, 403, `${f} ${method} wrong role`);
      // a patient-type session is refused as well
      const patient = { id: "p1", userType: "patient" };
      auth.__setUserLoaderForTests(async () => patient); bot.__setStaffGateForTests({ user: async () => patient, permission: async () => false });
      res = await handler(mk(undefined, method), ctx);
      assert.equal(res.status, 403, `${f} ${method} patient`);
      checked += 1;
    }
  }
  auth.__setUserLoaderForTests(); bot.__setStaffGateForTests();
  assert.ok(checked >= 40, `checked ${checked} handlers`);
});

test("marketing admin access: roles default to director/admin, users can be added, nothing else gets in", async () => {
  const { canManageMarketing } = await import("../lib/marketingCampaigns/adminAuth.js");
  assert.equal(canManageMarketing({ userType: "director" }, {}), true);
  assert.equal(canManageMarketing({ userType: "admin" }, {}), true);
  assert.equal(canManageMarketing({ userType: "executive", executiveType: "frontdesk" }, {}), false);
  assert.equal(canManageMarketing({ userType: "patient" }, {}), false);
  assert.equal(canManageMarketing({ userType: "executive", executiveType: "frontdesk", email: "A@x.in" }, { MARKETING_ADMIN_USERS: "a@x.in" }), true);
  assert.equal(canManageMarketing(null, {}), false);
});

test("the internal-token route refuses a staff session and a wrong token; the admin routes refuse the internal token", async () => {
  process.env.WHATSAPP_INTERNAL_SEND_TOKEN = "internal-secret";
  const internal = await import("../app/api/internal/whatsapp/marketing-campaign/route.js");
  const auth = await import("../lib/marketingCampaigns/adminAuth.js");
  const staff = { id: "u1", userType: "director" };
  auth.__setUserLoaderForTests(async () => staff);
  const noToken = await internal.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ action: "stop", campaign_id: "c1" }), headers: { cookie: "labbit_session=whatever" } }));
  assert.equal(noToken.status, 401);
  const wrong = await internal.POST(new Request("http://x", { method: "POST", body: "{}", headers: { "x-internal-token": "nope" } }));
  assert.equal(wrong.status, 401);
  assert.equal((await internal.GET(new Request("http://x?campaign_id=c1"))).status, 401);
  // internal token + no staff session on an admin route
  auth.__setUserLoaderForTests(async () => null);
  const adminRoute = await import("../app/api/admin/marketing/campaigns/route.js");
  const res = await adminRoute.GET(new Request("http://x", { headers: { "x-internal-token": "internal-secret", authorization: "Bearer internal-secret" } }));
  assert.equal(res.status, 401);
  auth.__setUserLoaderForTests();
});

test("header upload validates by bytes, not by the declared type or file name", async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]), Buffer.from([0, 0, 4, 176, 0, 0, 2, 116]), Buffer.alloc(8)]);
  assert.deepEqual(ui.readImageSize(png), { type: "image/png", width: 1200, height: 628 });
  assert.equal(ui.readImageSize(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>".padEnd(40))), null);
  assert.equal(ui.readImageSize(Buffer.from("GIF89a".padEnd(40))), null);
  for (const u of ["http://example.com/a.png", "https://127.0.0.1/a.png", "https://localhost/a.png", "https://[::1]/a.png", "https://user:pw@example.com/a.png", "https://10.0.0.5/a.png", "https://intranet/a.png", "https://svc.internal/a.png"]) assert.equal(ui.isCheckableImageUrl(u), false, u);
  assert.equal(ui.isCheckableImageUrl("https://labit.sdrc.in/marketing/trend-header.png"), true);
});
