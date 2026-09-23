// Pure logic for the Labit App's BMD/DEXA summary
// (app/api/internal/app-bmd/summary/[mrn]/route.js), extracted so it's
// unit-testable without a live Supabase connection -- same split as
// lib/visitScheduling.js.
//
// COMP_LABELS/boneClassify/findTotalRegion are ported line-for-line from
// sdrc-dexa-app's lib/bmd-compute.js (parseRegions, boneClassify) -- see the
// route's own header comment for why mdb_snapshot (not xps_composition) is
// the correct source (director, 2026-09-23).
//
// COMP_LABELS itself is confirmed against a MORE authoritative source found
// afterward: sdrc-dexa-worker's worker/parse_mdb.py::TOTALBODY_COMP_LABELS,
// which cites "confirmed against GE Lunar DPX display for patient
// 20260513066" and documents TWO label schemes sharing this same raw_json
// shape -- true total-body (1/2/3/7/59/60, values in GRAMS) vs osteo's own
// "estimated composition" (0/1/5/6, values in PERCENTAGE x10). Total is 7 in
// one scheme and 0 in the other -- they never collide, which is exactly why
// findTotalRegion's `label===7 && bone_mass>0` check reliably picks out the
// true total-body entry. Only the total-body half is ported here (this
// route only ever reads scan_type='total_body' scans), so the osteo scheme
// (0/1/5/6) never enters this code path and is deliberately not included
// below.

export const COMP_LABELS = { 1: "Arms", 2: "Legs", 3: "Trunk", 7: "Total", 59: "Android", 60: "Gynoid" };

export function boneClassify(t) {
  if (t == null) return null;
  if (t <= -2.5) return "osteoporosis";
  if (t <= -1.0) return "low_mass";
  return "normal";
}

export function parseRaw(raw_json) {
  let raw = raw_json;
  for (let i = 0; i < 2 && typeof raw === "string"; i++) {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  return typeof raw === "object" && raw !== null ? raw : null;
}

/** The one true total-body composition entry, or null. A total_body scan's
 * mdb_snapshot.composition can hold BOTH the real total-body entry and
 * per-osteo-scan "estimated composition" rows in the same object, keyed by
 * different img_handles -- the real one is identified by its label-7
 * ("Total") row having bone_mass > 0 (estimated rows always have
 * bone_mass = 0). Picking the wrong entry silently gives numbers in the
 * wrong scale, so this check is load-bearing, not decorative. */
export function findTotalRegion(rawJson) {
  const snap = rawJson?.mdb_snapshot;
  const compEntries = Object.values(snap?.composition || {});
  if (!compEntries.length) return null;

  const isTotalbodyEntry = (rows) =>
    rows.some((r) => parseInt(r.label, 10) === 7 && parseFloat(r.bone_mass || 0) > 0);
  const rows = compEntries.find(isTotalbodyEntry);
  if (!rows) return null;

  const totalRow = rows.find((r) => COMP_LABELS[parseInt(r.label, 10)] === "Total");
  if (!totalRow) return null;

  const fat = Math.abs(parseFloat(totalRow.fat_mass) || 0);
  const lean = Math.abs(parseFloat(totalRow.lean_mass) || 0);
  const bone = Math.abs(parseFloat(totalRow.bone_mass) || 0);
  const total = fat + lean + bone;
  if (total <= 0) return null;
  return {
    fatKg: fat / 1000, leanKg: lean / 1000, boneKg: bone / 1000,
    fatPercent: parseFloat(((fat / total) * 100).toFixed(1)),
  };
}
