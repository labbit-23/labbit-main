import test from "node:test";
import assert from "node:assert/strict";
import { friendlyErrorMessage } from "../lib/marketingCampaigns/errors.js";

test("gateway HTML never reaches a screen", () => {
  const html = "<html>\n<head><title>502 Bad Gateway</title></head>\n<body><center><h1>502 Bad Gateway</h1></center></body></html>";
  const msg = friendlyErrorMessage(new Error(html));
  assert.ok(!msg.includes("<"));
  assert.match(msg, /502/);
  assert.match(msg, /retry/i);
});

test("ordinary errors pass through, empty ones get a default", () => {
  assert.equal(friendlyErrorMessage(new Error("canceling statement due to statement timeout")), "canceling statement due to statement timeout");
  assert.equal(friendlyErrorMessage(null), "Internal error");
});
