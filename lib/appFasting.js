// Fasting flags for the Labit App catalog. The source of truth is labit-core
// (labit_core.parameter.fasting_required, the same flag the phlebo screen
// reads in app/api/internal/visits/active). A test needs fasting when any of
// its parameters does. Everything here DEGRADES to "unknown" (null / empty
// map) on any failure -- a catalog must never fail, or claim "no fasting",
// because labit-core was unreachable.
import { query } from "@/lib/pgScoped";

/** @param {string[]} codes lab_tests.internal_code values -> Map<UPPER(code), boolean> */
export async function fastingByTestCodes(codes) {
  const out = new Map();
  const list = [...new Set((codes || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean))];
  if (!list.length) return out;
  try {
    const rows = await query(
      `SELECT upper(trim(t.code)) AS code, bool_or(p.fasting_required) AS fasting
         FROM labit_core.test t
         JOIN labit_core.test_parameter tp ON tp.test_id = t.id
         JOIN labit_core.parameter p ON p.id = tp.parameter_id
        WHERE upper(trim(t.code)) = ANY($1)
        GROUP BY 1`,
      [list]
    );
    for (const r of rows) out.set(r.code, !!r.fasting);
  } catch (err) {
    console.error("[appFasting] by code degraded to unknown:", err?.message || err);
  }
  return out;
}

export const normName = (s) => String(s || "").toLowerCase().replace(/[*]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** @param {string[]} names package test names -> Map<normName, boolean> (names the hub can resolve to a core test) */
export async function fastingByTestNames(names) {
  const out = new Map();
  const list = [...new Set((names || []).map(normName).filter(Boolean))];
  if (!list.length) return out;
  try {
    const rows = await query(
      `SELECT trim(regexp_replace(lower(regexp_replace(lt.lab_test_name, '[*]', '', 'g')), '[^a-z0-9]+', ' ', 'g')) AS n,
              bool_or(p.fasting_required) AS fasting
         FROM lab_tests lt
         JOIN labit_core.test t ON upper(trim(t.code)) = upper(trim(lt.internal_code))
         JOIN labit_core.test_parameter tp ON tp.test_id = t.id
         JOIN labit_core.parameter p ON p.id = tp.parameter_id
        WHERE trim(regexp_replace(lower(regexp_replace(lt.lab_test_name, '[*]', '', 'g')), '[^a-z0-9]+', ' ', 'g')) = ANY($1)
        GROUP BY 1`,
      [list]
    );
    for (const r of rows) out.set(r.n, !!r.fasting);
  } catch (err) {
    console.error("[appFasting] by name degraded to unknown:", err?.message || err);
  }
  return out;
}

/** A package needs fasting if any resolvable test does; false only when at
 * least one test resolved and none need it; null when nothing resolved. */
export function packageFasting(testNames, byName) {
  let resolved = 0;
  for (const n of testNames || []) {
    const v = byName.get(normName(n));
    if (v === true) return true;
    if (v === false) resolved += 1;
  }
  return resolved > 0 ? false : null;
}
