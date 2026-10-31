// Split a list of values for a PostgREST `in.(...)` filter into chunks whose URL-encoded size stays small.
//
// Why: PostgREST echoes the request query string back in a response header (Content-Location). nginx in front of
// Supabase (supabase.sdrc.in) uses its default ~4k proxy buffer, so a large in.(...) filter succeeds at the database
// but the response is rejected: "upstream sent too big header" -> HTTP 502 with an HTML body. 200 message ids
// (~5.4 KB of query) always failed; 100 (~3.1 KB) passed. Chunk by encoded size, not by count, so longer ids or
// phone-number variants cannot silently push a chunk over the limit again. (Campaign Results, 2026-10-31.)
export const IN_FILTER_BUDGET_BYTES = 1800;

export function chunkForInFilter(values, budget = IN_FILTER_BUDGET_BYTES, maxItems = 200) {
  const chunks = [];
  let cur = [];
  let size = 0;
  for (const value of values || []) {
    const cost = encodeURIComponent(String(value)).length + 3; // "%2C" separator worst case
    if (cur.length && (size + cost > budget || cur.length >= maxItems)) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(value);
    size += cost;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}
