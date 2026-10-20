import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { groupTestsBySystem } from "../lib/packageSystems.js";

const data = JSON.parse(fs.readFileSync(new URL("../lib/data/health-packages.json", import.meta.url), "utf8"));
const group = (names) => groupTestsBySystem(names, data.testCategoryMap);

test("groups by the catalog's own category map, ignoring case, punctuation and the * marker", () => {
  const out = group(["thyroid stimulating hormone (tsh)", "HbA1c", "Lipid Profile*"]);
  const bySystem = Object.fromEntries(out.map((g) => [g.system, g.tests]));
  assert.deepEqual(bySystem.Thyroid, ["thyroid stimulating hormone (tsh)"]);
  assert.ok(bySystem.Diabetes?.includes("HbA1c"));
  assert.ok(bySystem.Cardiac?.includes("Lipid Profile"), "footnote star stripped from the shown name");
});

test("an unknown test goes under 'Other tests', last, never guessed", () => {
  const out = group(["Totally Unknown Assay", "HbA1c"]);
  assert.equal(out.at(-1).system, "Other tests");
  assert.deepEqual(out.at(-1).tests, ["Totally Unknown Assay"]);
});

test("every published package variant groups with at most a couple of tests unmapped", () => {
  let total = 0, other = 0;
  for (const g of data.packages) for (const v of g.variants) {
    const grouped = group(v.tests);
    total += v.tests.length;
    other += grouped.find((x) => x.system === "Other tests")?.tests.length ?? 0;
    assert.equal(grouped.flatMap((x) => x.tests).length, v.tests.length, `no test lost in ${v.name}`);
  }
  assert.ok(other / total < 0.02, `unmapped ${other}/${total}`);
});
