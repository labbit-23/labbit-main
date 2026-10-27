// Minimal in-memory stand-in for the supabase-js query builder (only what lib/marketingCampaigns uses). Test helper, not a test.
import { randomUUID } from "node:crypto";

const read = (row, col) => {
  if (col.includes("->>")) { const [a, b] = col.split("->>"); const v = row[a]?.[b]; return v == null ? v : String(v); }
  return row[col];
};

export function installFake(client, seed = {}) {
  const tables = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  const get = (t) => (tables[t] ||= []);
  class Q {
    constructor(t) { this.t = t; this.op = "select"; this.f = []; this.ord = null; this.lim = null; this.rng = null; this.want = false; this.head = false; this.cnt = false; this.single = null; this.payload = null; this.opts = {}; }
    select(_c, o = {}) { if (this.op === "select") this.op = "select"; else this.want = true; if (o.head) this.head = true; if (o.count) this.cnt = true; return this; }
    insert(r) { this.op = "insert"; this.payload = r; return this; }
    upsert(r, o = {}) { this.op = "upsert"; this.payload = r; this.opts = o; return this; }
    update(p) { this.op = "update"; this.payload = p; return this; }
    delete() { this.op = "delete"; return this; }
    eq(c, v) { this.f.push((r) => read(r, c) === v); return this; }
    neq(c, v) { this.f.push((r) => read(r, c) !== v); return this; }
    in(c, a) { this.f.push((r) => a.includes(read(r, c))); return this; }
    gte(c, v) { this.f.push((r) => read(r, c) != null && read(r, c) >= v); return this; }
    lte(c, v) { this.f.push((r) => read(r, c) != null && read(r, c) <= v); return this; }
    lt(c, v) { this.f.push((r) => read(r, c) != null && read(r, c) < v); return this; }
    is(c, v) { this.f.push((r) => (v === null ? read(r, c) == null : read(r, c) === v)); return this; }
    not(c, _op, v) { this.f.push((r) => (v === null ? read(r, c) != null : read(r, c) !== v)); return this; }
    order(c, o = {}) { this.ord = [c, o.ascending !== false]; return this; }
    limit(n) { this.lim = n; return this; }
    range(a, b) { this.rng = [a, b]; return this; }
    maybeSingle() { this.single = "maybe"; return this; }
    then(res, rej) { return Promise.resolve().then(() => this.exec()).then(res, rej); }
    match(rows) { return rows.filter((r) => this.f.every((fn) => fn(r))); }
    exec() {
      const rows = get(this.t);
      if (this.op === "insert" || this.op === "upsert") {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload];
        const out = [];
        for (const p of list) {
          if (this.op === "upsert" && this.opts.onConflict) {
            const keys = this.opts.onConflict.split(",");
            const ex = rows.find((r) => keys.every((k) => r[k] === p[k]));
            if (ex) { if (!this.opts.ignoreDuplicates) Object.assign(ex, p); continue; }
          }
          const row = { id: randomUUID(), created_at: new Date().toISOString(), ...p };
          rows.push(row); out.push({ ...row });
        }
        return { data: this.want ? out : null, error: null };
      }
      let hit = this.match(rows);
      if (this.op === "update") { for (const r of hit) Object.assign(r, this.payload); return { data: this.want ? hit.map((r) => ({ ...r })) : null, error: null }; }
      if (this.op === "delete") { for (const r of hit) rows.splice(rows.indexOf(r), 1); return { data: null, error: null }; }
      if (this.ord) { const [c, asc] = this.ord; hit = [...hit].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1)); }
      const total = hit.length;
      if (this.rng) hit = hit.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) hit = hit.slice(0, this.lim);
      if (this.head) return { data: null, count: total, error: null };
      const data = hit.map((r) => ({ ...r }));
      if (this.single) return { data: data[0] || null, error: null };
      return { data, count: this.cnt ? total : undefined, error: null };
    }
  }
  const original = client.from;
  client.from = (t) => new Q(t);
  return { tables, get, restore: () => { client.from = original; } };
}
