// Shared "is this the Labit App hub" gate for /api/internal/app-* routes
// (app-catalog, app-patients, app-booking). One token, one check -- do not
// duplicate this inline per route (the catalog route below predates this
// helper and should be migrated to it next time it's touched).
export function appHubAuthorized(request) {
  const expected = process.env.APP_HUB_INTERNAL_TOKEN || "";
  if (!expected) return false;
  const provided = (
    request.headers.get("x-internal-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
  return !!provided && provided === expected;
}

export const DEFAULT_SDRC_LAB_ID = String(
  process.env.DEFAULT_SDRC_LAB_ID || process.env.DEFAULT_LAB_ID ||
  "b539c161-1e2b-480b-9526-d4b37bd37b1e"
).trim();
