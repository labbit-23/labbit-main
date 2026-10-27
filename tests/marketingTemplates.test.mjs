import test from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, META_LIMITS as L } from "../lib/marketingCampaigns/templateRegistry.js";
import { VARIABLES } from "../lib/patientMessageJobs/variables.js";

test("registry keys, names and categories are sane", () => {
  const keys = TEMPLATES.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const t of TEMPLATES) {
    assert.match(t.name, /^[a-zA-Z0-9_]+$/, `${t.key}: name must be lowercase/underscore (Meta)`);
    assert.ok(["UTILITY", "MARKETING"].includes(t.category), t.key);
    assert.ok(["approved", "draft"].includes(t.status), t.key);
    assert.ok(["image", "none"].includes(t.header.type), t.key);
    if (t.header.type === "image") assert.match(t.header.sample_url, /^https:\/\//);
    assert.ok(t.purpose && t.notes, t.key);
  }
});

test("every param exists in variables.js and matches the {{n}} placeholders in the body", () => {
  for (const t of TEMPLATES) {
    for (const p of t.params) assert.ok(VARIABLES[p], `${t.key}: unknown variable ${p}`);
    const nums = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    assert.deepEqual([...new Set(nums)].sort((a, b) => a - b), t.params.map((_, i) => i + 1), `${t.key}: placeholders vs params`);
    assert.ok(!/^\s*\{\{/.test(t.body) && !/\}\}\s*$/.test(t.body), `${t.key}: Meta rejects a body starting/ending with a variable`);
    assert.ok(!/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(t.body), `${t.key}: adjacent variables`);
  }
});

test("Meta length and button limits", () => {
  for (const t of TEMPLATES) {
    assert.ok(t.body.length <= L.bodyMax, `${t.key}: body too long`);
    if (t.footer) assert.ok(t.footer.length <= L.footerMax, `${t.key}: footer`);
    const qr = t.buttons.filter((b) => b.type === "quick_reply");
    const url = t.buttons.filter((b) => b.type === "url");
    assert.equal(qr.length + url.length, t.buttons.length, `${t.key}: unknown button type`);
    assert.ok(qr.length <= L.maxQuickReplies, `${t.key}: quick replies`);
    assert.ok(url.length <= L.maxUrlButtons, `${t.key}: url buttons`);
    assert.ok(t.buttons.length <= L.maxButtons);
    for (const b of qr) assert.ok(b.text.length > 0 && b.text.length <= L.quickReplyTextMax, `${t.key}: ${b.text}`);
    for (const b of url) {
      assert.ok(b.text.length > 0 && b.text.length <= L.urlTextMax, `${t.key}: ${b.text}`);
      assert.match(b.url, /^https:\/\//);
      assert.ok((b.url.match(/\{\{\d+\}\}/g) || []).length <= 1, `${t.key}: one variable per URL`);
    }
  }
});

test("Marketing templates carry an opt-out path; Utility ones carry no offer wording; no hardcoded phone", () => {
  for (const t of TEMPLATES.filter((x) => x.category === "MARKETING")) {
    assert.ok(t.buttons.some((b) => /stop/i.test(b.text)), `${t.key}: needs a STOP button`);
  }
  for (const t of TEMPLATES.filter((x) => x.category === "UTILITY")) {
    assert.ok(!/\b(offer|discount|off|book now|% )/i.test(t.body), `${t.key}: promotional wording in a Utility body`);
  }
  for (const t of TEMPLATES) assert.ok(!/\b\d{10}\b/.test(t.body), `${t.key}: hardcoded phone in body`);
});
