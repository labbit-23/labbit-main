import test from "node:test";
import assert from "node:assert/strict";
import { chunkForInFilter, IN_FILTER_BUDGET_BYTES } from "../lib/inChunks.js";

const enc = (chunk) => encodeURIComponent(chunk.join(",")).length;

test("200 24-char message ids no longer go out as one 5 KB filter (that returned 502 via nginx)", () => {
  const ids = Array.from({ length: 200 }, (_, i) => `6ae49e5f98340${String(i).padStart(11, "0")}`);
  const chunks = chunkForInFilter(ids);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(enc(c) <= IN_FILTER_BUDGET_BYTES, `chunk of ${c.length} is ${enc(c)} bytes`);
  assert.deepEqual(chunks.flat(), ids);
});

test("long wamid-style ids and +91 variants stay under the budget", () => {
  const ids = Array.from({ length: 120 }, (_, i) => `wamid.HBgMOTE5ODQ5NTkwNzA4FQIAERgS${String(i).padStart(8, "0")}AA==`);
  for (const c of chunkForInFilter(ids)) assert.ok(enc(c) <= IN_FILTER_BUDGET_BYTES);
  const phones = Array.from({ length: 100 }, (_, i) => `98495907${String(i).padStart(2, "0")}`).flatMap((p) => [p, `91${p}`, `+91${p}`]);
  for (const c of chunkForInFilter(phones)) assert.ok(enc(c) <= IN_FILTER_BUDGET_BYTES);
});

test("never returns an empty chunk, handles empty input and an oversize single value", () => {
  assert.deepEqual(chunkForInFilter([]), []);
  assert.deepEqual(chunkForInFilter(null), []);
  const huge = "x".repeat(5000);
  assert.deepEqual(chunkForInFilter([huge, "a"]), [[huge], ["a"]]);
});
