// lib/pgScoped.js
//
// Direct Postgres access for labit-main, bypassing Supabase's PostgREST/
// JS-SDK layer entirely -- the Node equivalent of labit-core's app/db.py.
// Director, 2026-09-14: "moving towards Supabase independence is a better
// path for this." Purpose here is narrower than a full data-layer swap:
// this exists so RLS policies can be enforced by Postgres itself (via
// session GUCs) for routes that used to rely on the browser holding the
// anon key directly, or on the service-role key's blanket RLS bypass with
// no second layer of defense. See db/RLS_HARDENING_PLAN.md.
//
// Connects as `labit_main_rw` -- a role created specifically WITHOUT
// BYPASSRLS (unlike `postgres`/`service_role`, which ignore RLS policies
// entirely). If this ever gets pointed at a bypassrls role, every policy
// this module exists to enforce becomes silently inert -- worth a startup
// assertion once the role is live in every environment (not added yet,
// see db/RLS_HARDENING_PLAN.md's handoff note).

import { Pool, types } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

// 2026-09-15 live incident: node-postgres parses `date` columns (OID 1082)
// into JS Date objects by default, which then JSON-serialize as full ISO
// timestamps ("2026-09-15T00:00:00.000Z"). The old Supabase/PostgREST path
// this replaced always returned plain "YYYY-MM-DD" strings, and frontend
// code across the app does exact string equality against that shape
// (v.visit_date === selectedYmd) -- the mismatched format made every
// category filter in ActiveVisitsTab.js silently compute empty, even
// though the API call itself succeeded and returned real data (confirmed
// live: 200 OK, 8kB response, zero visits showing on screen). Registering
// the type parser here fixes every route that touches a date column at
// once, rather than reformatting per-route.
types.setTypeParser(1082, (value) => value);

const DSN = process.env.LABIT_MAIN_PG_DSN;

let _pool = null;
function getPool() {
  if (!DSN) {
    throw new Error("[pgScoped] LABIT_MAIN_PG_DSN is not set");
  }
  if (!_pool) {
    // Same statement_timeout reasoning as labit-core's app/db.py (2026-08-11
    // incident there): a stuck/slow query must fail fast, not hang a pooled
    // connection (and every other request waiting on the pool) forever.
    _pool = new Pool({
      connectionString: DSN,
      max: 8,
      statement_timeout: 15000,
      idle_in_transaction_session_timeout: 15000,
    });
  }
  return _pool;
}

// AsyncLocalStorage, not a module-level variable -- each request/async chain
// gets its own copy, so concurrent requests never see each other's scope
// (same reasoning as labit-core's db.py using a contextvar for the same
// purpose).
const scopeStorage = new AsyncLocalStorage();

/**
 * Run `fn` with an RLS scope established for every query() call made inside
 * it (directly, or anywhere deeper in the same async chain). Scope shape:
 *   { mode: "all" | "lab", labId: string | null }
 * "all" is an app-level capability (e.g. a director role), not a database
 * bypass -- policies still evaluate, they just always return true for that
 * predicate branch. Mirrors labit-core's `scoped()`.
 */
export function scoped(scope, fn) {
  return scopeStorage.run(scope || null, fn);
}

async function applyScope(client) {
  const scope = scopeStorage.getStore();
  if (!scope) return; // nothing set -> GUCs stay NULL -> RLS denies. Fail closed.
  await client.query(
    `SELECT set_config('app.scope_mode', $1, true), set_config('app.lab_id', $2, true)`,
    [scope.mode || "", scope.labId || ""]
  );
}

/**
 * Run one query inside its own transaction, with the current scope (if any)
 * applied as the first statement of that transaction. Every call opens its
 * own transaction from the pool -- no change to atomicity/connection
 * lifetime versus a plain pool.query(), it just always scopes first.
 */
export async function query(sql, params = []) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await applyScope(client);
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result.rows;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}
