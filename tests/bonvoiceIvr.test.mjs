import assert from "node:assert/strict";
import test from "node:test";

const { parseDtmfKeys, resolveBonvoiceJourney } = await import("../lib/bonvoiceIvr.js");

test("normalizes the comma-separated DTMF journey", () => {
  assert.deepEqual(parseDtmfKeys(" 1, 3, 4,1 "), ["1", "3", "4", "1"]);
});

test("resolves every terminal path in the latest Bonvoice menu", () => {
  const cases = {
    "1,1": "send_latest_report",
    "1,2": "latest_report_no_whatsapp",
    "1,2,9": "report_dispatch_team_requested",
    "1,9": "report_dispatch_team_requested",
    "2": "home_visit_callback_requested",
    "3": "schedule_enquiry",
    "4,1": "collection_centre_sd_road",
    "4,2": "collection_centre_marredpally",
    "4,3": "collection_centre_yapral",
    "4,9": "cx_team_requested",
    "9": "cx_team_requested",
  };
  for (const [dtmf, action] of Object.entries(cases)) {
    assert.equal(resolveBonvoiceJourney(dtmf).action, action, dtmf);
  }
});

test("walks back-to-main navigation before applying the final choice", () => {
  assert.equal(resolveBonvoiceJourney("1,3,2").action, "home_visit_callback_requested");
  assert.equal(resolveBonvoiceJourney("1,2,1,1,1").action, "send_latest_report");
  assert.equal(resolveBonvoiceJourney("4,4,4,3").action, "collection_centre_yapral");
});

test("labels incomplete, empty, and invalid journeys for review", () => {
  assert.equal(resolveBonvoiceJourney("").action, "no_input");
  assert.equal(resolveBonvoiceJourney("1").action, "latest_report_menu_abandoned");
  assert.equal(resolveBonvoiceJourney("4").action, "collection_centre_menu_abandoned");
  assert.deepEqual(resolveBonvoiceJourney("7"), {
    action: "invalid_dtmf",
    terminal: true,
    keys: ["7"],
    invalid_key: "7",
    menu: "main",
  });
});

