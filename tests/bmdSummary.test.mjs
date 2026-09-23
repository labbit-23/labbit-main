// Tests for lib/bmdSummary.js. The bilateral-rows fixture below (labels
// 51/52/53) is shaped exactly like a REAL row pulled live from
// supabase.sdrc.in during development (2026-09-23) -- confirming a scan can
// hold composition entries that are NOT the true total-body entry, which is
// exactly the case findTotalRegion must reject.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boneClassify, parseRaw, findTotalRegion } from "@/lib/bmdSummary.js";

test("boneClassify: matches sdrc-dexa-app's own thresholds", () => {
  assert.equal(boneClassify(-2.5), "osteoporosis");
  assert.equal(boneClassify(-3.1), "osteoporosis");
  assert.equal(boneClassify(-1.0), "low_mass");
  assert.equal(boneClassify(-2.4), "low_mass");
  assert.equal(boneClassify(-0.99), "normal");
  assert.equal(boneClassify(0.5), "normal");
  assert.equal(boneClassify(null), null);
});

test("parseRaw: handles a plain object, a JSON string, and double-encoded JSON", () => {
  assert.deepEqual(parseRaw({ a: 1 }), { a: 1 });
  assert.deepEqual(parseRaw('{"a":1}'), { a: 1 });
  assert.deepEqual(parseRaw(JSON.stringify(JSON.stringify({ a: 1 }))), { a: 1 });
  assert.equal(parseRaw("not json"), null);
  assert.equal(parseRaw(null), null);
});

// A real bilateral-only entry (left_arm/left_leg/left_trunk) -- pulled live
// from a genuine total_body scan's mdb_snapshot.composition. NOT the total
// entry: labels 51/52/53 aren't in COMP_LABELS at all (they're
// BILATERAL_LABELS in sdrc-dexa-app, unused here), so even if bone_mass
// were > 0 this must never be picked as "Total".
const BILATERAL_ONLY_ROWS = [
  { comp_handle: "c1", img_handle: "img_a", label: "51", method: "2", bone_mass: "239.94895857654", fat_mass: "765.44817115184", lean_mass: "3992.3029690216" },
  { comp_handle: "c2", img_handle: "img_a", label: "52", method: "2", bone_mass: "806.6631260804", fat_mass: "5916.8384826323", lean_mass: "12044.403049568" },
  { comp_handle: "c3", img_handle: "img_a", label: "53", method: "2", bone_mass: "655.0843891949499", fat_mass: "8042.0", lean_mass: "9000.0" },
];

// A synthetic but realistic true-total entry: label 7, bone_mass > 0.
const TOTAL_ROWS = [
  { comp_handle: "c4", img_handle: "img_b", label: "7", method: "2", bone_mass: "3200.5", fat_mass: "18000.25", lean_mass: "45000.75" },
];

// An "estimated composition" row from an osteo scan sharing the same
// snapshot shape -- label 7 present, but bone_mass = 0 (the tell that
// distinguishes it from a real total-body scan).
const ESTIMATED_ROWS = [
  { comp_handle: "c5", img_handle: "img_c", label: "7", method: "1", bone_mass: "0", fat_mass: "500.0", lean_mass: "1200.0" },
];

test("findTotalRegion: null when there is no composition at all", () => {
  assert.equal(findTotalRegion({ mdb_snapshot: { composition: {} } }), null);
  assert.equal(findTotalRegion({ mdb_snapshot: {} }), null);
  assert.equal(findTotalRegion({}), null);
});

test("findTotalRegion: a bilateral-only entry (real captured shape) is never mistaken for Total", () => {
  assert.equal(findTotalRegion({ mdb_snapshot: { composition: { img_a: BILATERAL_ONLY_ROWS } } }), null);
});

test("findTotalRegion: an estimated-composition entry (bone_mass=0) is rejected even though label 7 is present", () => {
  assert.equal(findTotalRegion({ mdb_snapshot: { composition: { img_c: ESTIMATED_ROWS } } }), null);
});

test("findTotalRegion: picks the real total entry out of several, and converts g -> kg correctly", () => {
  const composition = { img_a: BILATERAL_ONLY_ROWS, img_c: ESTIMATED_ROWS, img_b: TOTAL_ROWS };
  const region = findTotalRegion({ mdb_snapshot: { composition } });
  assert.ok(region);
  assert.equal(region.fatKg, 18.00025);
  assert.equal(region.leanKg, 45.00075);
  assert.equal(region.boneKg, 3.2005);
  const total = 18000.25 + 45000.75 + 3200.5;
  assert.equal(region.fatPercent, parseFloat(((18000.25 / total) * 100).toFixed(1)));
});

test("findTotalRegion: a negative bone_mass is never selected as the total entry (matches the ported source: the >0 check runs on the raw value, before Math.abs)", () => {
  const rows = [{ label: "7", bone_mass: "-100", fat_mass: "2000", lean_mass: "5000" }];
  assert.equal(findTotalRegion({ mdb_snapshot: { composition: { img_x: rows } } }), null);
});

test("findTotalRegion: once a valid entry is selected, negative fat/lean readings are still folded in via Math.abs", () => {
  const rows = [{ label: "7", bone_mass: "100", fat_mass: "-2000", lean_mass: "-5000" }];
  const region = findTotalRegion({ mdb_snapshot: { composition: { img_x: rows } } });
  assert.ok(region);
  assert.equal(region.boneKg, 0.1);
  assert.equal(region.fatKg, 2);
  assert.equal(region.leanKg, 5);
});
