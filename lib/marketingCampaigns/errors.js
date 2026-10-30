// supabase-js puts a gateway's raw HTML error page into error.message when the database API answers 502/504.
// Never let that reach a screen.
export function friendlyErrorMessage(err) {
  const raw = String(err?.message || err || "").trim();
  if (/<\s*html|<\s*body|<\s*title/i.test(raw)) {
    const code = raw.match(/\b(50[0-4])\b/)?.[1];
    return `The database service did not answer${code ? ` (${code})` : ""}. Please retry in a moment.`;
  }
  return raw || "Internal error";
}
