import test from "node:test";
import assert from "node:assert/strict";

const { classifyIntent, extractReqno } = await import("../lib/whatsappBot/intents.js");
const { handleInbound } = await import("../lib/whatsappBot/router.js");
const { mergeSettings, flagOn, validateFlagsPatch, validateParamsPatch } = await import("../lib/whatsappBot/settings.js");
const { resolveText, validateTextOverrides, DEFAULT_TEXTS } = await import("../lib/whatsappBot/texts.js");
const { windowState } = await import("../lib/whatsappBot/window.js");
const { replyToThread, normaliseTags } = await import("../lib/whatsappBot/inboxActions.js");
const { phoneHash } = await import("../lib/whatsappBot/store.js");
const { aggregateEvents } = await import("../lib/whatsappBot/inboxStore.js");

const ON = { global_enabled: true, tracker_enabled: true, inbox_enabled: true, report_status: true, report_resend: true, book_followup: true, package_enquiry: true, human_handoff: true, start_optin: true, campaign_attribution: true };
const PHONE = "919000000001";

function makeDeps(flags = ON, over = {}) {
  const log = { sent: [], docs: [], events: [], threads: [], messages: [], enquiries: [], optIns: [], handoffs: [] };
  const deps = {
    now: () => Date.parse("2026-10-28T08:00:00Z"), // 13:30 IST, staff online
    loadSettings: async () => mergeSettings([{ key: "flags", value: flags }]),
    recordEvent: async (e) => { log.events.push(e); },
    countEvents: async ({ eventType }) => log.events.filter((e) => e.event_type === eventType).length + (over.priorCounts?.[eventType] || 0),
    campaignContext: async () => over.campaign ?? null,
    findOpenThread: async () => over.openThread ?? log.threads[0] ?? null,
    createThread: async (a) => { const t = { id: "11111111-1111-1111-1111-111111111111", ...a, status: "open", unread_count: 1 }; log.threads.push(t); return t; },
    appendThreadMessage: async (m) => { log.messages.push(m); },
    touchThreadInbound: async () => {},
    removeOptOut: async (p) => { log.optIns.push(p); },
    markSessionHandoff: async (id) => { log.handoffs.push(id); },
    sendText: async (m) => { log.sent.push(m); },
    sendDocument: async (m) => { log.docs.push(m); },
    lookupReports: async () => over.reports ?? [{ reqid: "5001", reqno: "R202610280001", mrno: "MRN-FAKE-1" }],
    getReportStatus: async () => over.status ?? { overall_status: "FULL_REPORT" },
    buildStatusMessage: (s) => `Lab report status: ${s.overall_status}`,
    getReportUrl: (reqid, reqno) => `https://example.invalid/report/${reqid}?reqno=${reqno}`,
    isPdfReachable: async () => over.pdfOk ?? true,
    searchCatalog: async () => over.catalog ?? [],
    submitEnquiry: async (a) => { log.enquiries.push(a); return over.enquiryId === undefined ? "enq-1" : over.enquiryId; }
  };
  return { deps, log };
}
const input = (text, extra = {}) => ({ phone: PHONE, text, isButton: false, profileName: "Fake Patient", messageId: "wamid.FAKE", labId: "lab-1", session: { id: "s1", status: "active", current_state: "START" }, patient: { id: "p1", name: "Fake Patient", mrn: "MRN-FAKE-1" }, ...extra });

test("everything defaults off and fails closed", async () => {
  const s = mergeSettings([]);
  assert.ok(Object.values(s.flags).every((v) => v === false));
  assert.equal(flagOn({ flags: { global_enabled: false, report_status: true } }, "report_status"), false);
  const { deps, log } = makeDeps({});
  const r = await handleInbound(input("where is my report"), deps);
  assert.equal(r.handled, false);
  assert.equal(log.sent.length, 0);
});

test("global kill switch stops every automation even when individual flags are on", async () => {
  const { deps, log } = makeDeps({ ...ON, global_enabled: false });
  assert.equal((await handleInbound(input("send my report"), deps)).handled, false);
  assert.equal(log.sent.length + log.docs.length + log.events.length, 0);
});

test("intent classification", () => {
  const c = (t, o) => classifyIntent(t, o).intent;
  assert.equal(c("where is my report"), "report_status");
  assert.equal(c("please send my report"), "report_resend");
  assert.equal(c("Latest Report", { isButton: true }), "report_resend");
  assert.equal(c("Book follow-up", { isButton: true }), "book_followup");
  assert.equal(c("I want a home visit tomorrow"), "book_followup");
  assert.equal(c("what is the price of thyroid profile"), "package_enquiry");
  assert.equal(c("is my result serious?"), "medical_advice");
  assert.equal(c("is this report high or normal, should I worry"), "medical_advice");
  assert.equal(c("your service is worst, I want a refund"), "complaint");
  assert.equal(c("START"), "opt_in");
  assert.equal(c("asdf qwerty"), "unknown");
  assert.equal(classifyIntent("Hi").passthrough, true);
  assert.equal(classifyIntent("Trend Report", { isButton: true }).passthrough, true);
  assert.equal(extractReqno("status of R202610280001 please"), "R202610280001");
});

test("report status answers from the live status; resend sends the PDF only when complete and only to the owner", async () => {
  let { deps, log } = makeDeps();
  let r = await handleInbound(input("where is my report"), deps);
  assert.equal(r.action, "report_status");
  assert.match(log.sent[0].text, /ready/i);
  assert.equal(log.docs.length, 0);

  ({ deps, log } = makeDeps());
  r = await handleInbound(input("send my report"), deps);
  assert.equal(r.action, "report_resent");
  assert.equal(log.docs.length, 1);
  assert.equal(log.docs[0].phone, PHONE);
  assert.ok(log.events.some((e) => e.event_type === "report_resent"));

  ({ deps, log } = makeDeps(ON, { status: { overall_status: "PARTIAL_REPORT" } }));
  r = await handleInbound(input("send my report"), deps);
  assert.equal(r.action, "report_not_complete");
  assert.equal(log.docs.length, 0);
});

test("a requisition that is not registered to the sender is never sent or confirmed", async () => {
  const { deps, log } = makeDeps();
  const r = await handleInbound(input("send report R202699999999"), deps);
  assert.equal(r.action, "handoff");
  assert.equal(r.reason, "phone_mismatch");
  assert.equal(log.docs.length, 0);
  assert.doesNotMatch(log.sent.map((m) => m.text).join(" "), /R202699999999/);
  assert.equal(log.threads.length, 1);
});

test("resend is rate-limited per phone per day", async () => {
  const { deps, log } = makeDeps(ON, { priorCounts: { report_resent: 3 } });
  const r = await handleInbound(input("send my report"), deps);
  assert.equal(r.reason, "resend_limit");
  assert.equal(log.docs.length, 0);
});

test("no report on this number hands off with a polite reply", async () => {
  const { deps, log } = makeDeps(ON, { reports: [] });
  const r = await handleInbound(input("where is my report"), deps);
  assert.equal(r.reason, "report_not_found");
  assert.equal(log.threads.length, 1);
  assert.equal(log.handoffs[0], "s1");
});

test("booking creates an enquiry carrying the campaign and offer ids, once a day", async () => {
  const campaign = { campaign_id: "cccccccc-0000-0000-0000-000000000001", offer_id: "offer-diwali", campaign_name: "Fake Campaign" };
  let { deps, log } = makeDeps(ON, { campaign });
  let r = await handleInbound(input("Book follow-up", { isButton: true }), deps);
  assert.equal(r.action, "booking_created");
  assert.equal(log.enquiries[0].campaign.offer_id, "offer-diwali");
  assert.ok(log.events.some((e) => e.event_type === "booking_created" && e.campaign_id === campaign.campaign_id));

  ({ deps, log } = makeDeps(ON, { priorCounts: { booking_created: 1 } }));
  r = await handleInbound(input("book home visit"), deps);
  assert.equal(r.action, "booking_duplicate");
  assert.equal(log.enquiries.length, 0);

  ({ deps, log } = makeDeps(ON, { enquiryId: null }));
  r = await handleInbound(input("book home visit"), deps);
  assert.equal(r.reason, "booking_failed"); // lead is not lost: goes to staff
});

test("package and price answers come only from the catalogue, with a booking offer", async () => {
  let { deps, log } = makeDeps(ON, { catalog: [{ name: "Fake Wellness Package", price: 1999 }] });
  let r = await handleInbound(input("price of full body checkup"), deps);
  assert.equal(r.action, "package_info");
  assert.match(log.sent[0].text, /Fake Wellness Package - Rs 1999/);
  assert.match(log.sent[0].text, /BOOK/);

  ({ deps, log } = makeDeps(ON, { catalog: [] }));
  r = await handleInbound(input("price of full body checkup"), deps);
  assert.equal(r.reason, "catalogue_miss");
  assert.doesNotMatch(log.sent.map((m) => m.text).join(" "), /Rs \d/);
});

test("medical-advice, complaint and unrecognised messages go to staff; no clinical content in the reply", async () => {
  for (const [text, reason] of [["is my result serious?", "medical_advice"], ["this is the worst service, refund me", "complaint"], ["blah blah zzz", "unrecognised"]]) {
    const { deps, log } = makeDeps();
    const r = await handleInbound(input(text), deps);
    assert.equal(r.action, "handoff");
    assert.equal(r.reason, reason);
    assert.equal(log.threads.length, 1);
    assert.equal(log.docs.length, 0);
    assert.doesNotMatch(log.sent[0].text, /normal|abnormal|serious|diagnos/i);
  }
});

test("flags are independent: a flag that is off leaves the message to the existing bot", async () => {
  const { deps, log } = makeDeps({ ...ON, book_followup: false });
  const r = await handleInbound(input("book home visit"), deps);
  assert.equal(r.handled, false);
  assert.equal(log.enquiries.length, 0);
  const off = makeDeps({ ...ON, human_handoff: false });
  assert.equal((await handleInbound(input("blah blah zzz"), off.deps)).handled, false);
});

test("an open staff thread owns the chat: the bot stays quiet and the message is appended", async () => {
  const { deps, log } = makeDeps(ON, { openThread: { id: "t1", status: "assigned", unread_count: 0 } });
  const r = await handleInbound(input("where is my report"), deps);
  assert.equal(r.action, "appended_to_thread");
  assert.equal(log.sent.length, 0);
  assert.equal(log.messages[0].sender, "patient");
});

test("existing bot menu flows are not intercepted (greetings, trend button, mid-flow sessions, human-handled sessions)", async () => {
  for (const [text, opts] of [["Hi", {}], ["Trend Report", { isButton: true }], ["send my report", { session: { id: "s1", status: "active", current_state: "REPORT_SELECT" } }], ["send my report", { session: { id: "s1", status: "handoff", current_state: "START" } }]]) {
    const { deps, log } = makeDeps();
    assert.equal((await handleInbound(input(text, opts), deps)).handled, false, text);
    assert.equal(log.sent.length, 0);
  }
});

test("START opts back in only when its flag is on", async () => {
  let { deps, log } = makeDeps();
  let r = await handleInbound(input("START"), deps);
  assert.equal(r.action, "opt_in");
  assert.equal(log.optIns.length, 1);
  ({ deps, log } = makeDeps({ ...ON, start_optin: false }));
  assert.equal((await handleInbound(input("START"), deps)).handled, false);
  assert.equal(log.optIns.length, 0);
});

test("outside the 24 h window the bot never sends free-form text", async () => {
  const { deps, log } = makeDeps();
  const old = Date.parse("2026-10-28T08:00:00Z") / 1000 - 30 * 3600;
  await handleInbound(input("where is my report", { messageTimestampMs: old * 1000 }), deps);
  assert.equal(log.sent.length, 0);
  assert.ok(log.events.some((e) => e.event_type === "window_closed_skip"));
});

test("tracker events carry the phone hash, never the number or message text", async () => {
  const { deps, log } = makeDeps();
  await handleInbound(input("where is my report"), deps);
  assert.ok(log.events.length >= 2);
  const blob = JSON.stringify(log.events.map((e) => ({ ...e, phone: undefined })));
  assert.ok(log.events.every((e) => e.phone_hash === phoneHash(PHONE)));
  assert.doesNotMatch(blob, /where is my report/);
  assert.equal(phoneHash("9000000001"), phoneHash("+91 90000 00001"));
});

test("staff reply: free text inside the window; refused outside it unless an approved template is configured", async () => {
  const calls = { text: [], tpl: [], events: [] };
  const mk = (templates = []) => ({
    loadSettings: async () => mergeSettings([{ key: "params", value: { window_reopen_templates: templates } }]),
    sendText: async (m) => calls.text.push(m), sendTemplate: async (m) => calls.tpl.push(m),
    appendThreadMessage: async () => {}, recordEvent: async (e) => calls.events.push(e), now: () => Date.parse("2026-10-28T08:00:00Z")
  });
  const open = { id: "t1", phone10: "9000000001", phone_hash: "h", last_inbound_at: "2026-10-28T02:00:00Z" };
  const closed = { ...open, last_inbound_at: "2026-10-26T02:00:00Z" };
  assert.equal((await replyToThread({ thread: open, text: "Hello" }, mk())).sent, "text");
  let r = await replyToThread({ thread: closed, text: "Hello" }, mk());
  assert.equal(r.status, 409);
  assert.equal(calls.text.length, 1);
  r = await replyToThread({ thread: closed, template: { name: "invented_one" } }, mk([{ name: "approved_followup", language: "en", params: [] }]));
  assert.equal(r.status, 409);
  r = await replyToThread({ thread: closed, template: { name: "approved_followup", params: ["x"] } }, mk([{ name: "approved_followup", language: "en", params: ["note"] }]));
  assert.equal(r.sent, "template");
  assert.equal(calls.tpl[0].templateName, "approved_followup");
});

test("settings validation, reply-text overrides and language fallback", () => {
  assert.equal(validateFlagsPatch({ nope: true }).ok, false);
  assert.equal(validateFlagsPatch({ report_status: "yes" }).ok, false);
  assert.deepEqual(validateFlagsPatch({ report_status: true }).clean, { report_status: true });
  assert.equal(validateParamsPatch({ min_confidence: 5 }).ok, false);
  assert.equal(validateParamsPatch({ window_reopen_templates: [{ name: "Bad Name!" }] }).ok, false);
  assert.equal(validateTextOverrides({ en: { holding_reply: "x {oops}" } }).ok, false);
  assert.equal(validateTextOverrides({ fr: {} }).ok, false);
  assert.equal(validateTextOverrides({ hi: { holding_reply: "namaste" } }).ok, true);
  assert.equal(resolveText("holding_reply", { lang: "hi" }), DEFAULT_TEXTS.en.holding_reply); // empty hi falls back to en
  assert.equal(resolveText("holding_reply", { lang: "hi", overrides: { hi: { holding_reply: "namaste" } } }), "namaste");
  assert.equal(resolveText("package_line", { vars: { name: "A", price: 5 } }), "A - Rs 5");
});

test("window math, tag normalising and tracker aggregation", () => {
  assert.equal(windowState("2026-10-28T00:00:00Z", Date.parse("2026-10-28T23:59:00Z")).open, true);
  assert.equal(windowState("2026-10-28T00:00:00Z", Date.parse("2026-10-29T00:00:01Z")).open, false);
  assert.equal(windowState(null).open, false);
  assert.deepEqual(normaliseTags(["Billing", "billing", " Follow Up "]), ["billing", "follow-up"]);
  const agg = aggregateEvents([
    { event_type: "inbound_message", phone_hash: "a", campaign_id: "c1", created_at: "2026-10-28T01:00:00Z", intent: "book_followup" },
    { event_type: "booking_created", phone_hash: "a", campaign_id: "c1", created_at: "2026-10-28T01:01:00Z" },
    { event_type: "handoff_created", phone_hash: "b", created_at: "2026-10-27T01:00:00Z" }
  ]);
  assert.equal(agg.distinct_patients, 2);
  assert.equal(agg.by_campaign.c1.bookings, 1);
  assert.equal(agg.by_type.handoff_created, 1);
});

test("a failure after the patient was already answered is reported as handled (no second reply from the legacy flow)", async () => {
  const { deps, log } = makeDeps(ON);
  deps.recordEvent = async (e) => { if (e.event_type === "report_status_sent") return; if (e.event_type === "bot_reply") throw new Error("db down"); };
  const r = await handleInbound(input("where is my report"), deps);
  assert.equal(r.handled, true);
  assert.equal(r.action, "error_after_reply");
  assert.equal(log.sent.length, 1);
});

test("a failure before any reply still throws so the webhook falls through to the legacy flow", async () => {
  const { deps, log } = makeDeps(ON);
  deps.loadSettings = async () => { throw new Error("settings down"); };
  await assert.rejects(handleInbound(input("where is my report"), deps), /settings down/);
  assert.equal(log.sent.length, 0);
});

test("campaign attribution looks the recipient up by every stored phone format", async () => {
  const { mobileVariants } = await import("../lib/whatsappBot/store.js");
  assert.deepEqual(mobileVariants("+91 90000 00001"), ["919000000001", "9000000001", "+919000000001"]);
  assert.deepEqual(mobileVariants("123"), []);
});
