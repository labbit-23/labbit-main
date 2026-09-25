// Drive-time ETAs from Ola Maps, for the phlebo screen.
//
// FREE CALLS ONLY, by decision (2026-09-25): the one endpoint used is
// Routing Distance Matrix Basic, which Ola lists at ₹0. Do not add a paid
// endpoint (geocode, autocomplete, reverse-geocode, ...) to this path --
// it's driven by phlebos' devices and must never become a cost surface.
// Guards: destination cap per request, and a short in-memory cache so the
// 60s dashboard poll / several phlebos in one area don't multiply calls.
//
// The API key is domain-restricted on Ola's dashboard and checked against
// Origin, which a server-side call never sends on its own, so it is set
// explicitly (same as labit-app's api/app/geocode.py).
const BASE = "https://api.olamaps.io/routing/v1/distanceMatrix/basic";
const ORIGIN_HEADER = "https://app.labit.online";
export const MAX_STOPS = 8;
const TTL_MS = 60_000;

const cache = new Map(); // key -> { at, value }

const r4 = (n) => Math.round(Number(n) * 1e4) / 1e4; // ~11 m: near-identical positions share a cache entry
const valid = (p) =>
  p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) &&
  Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

/** @returns {Promise<Record<string,{minutes:number,km:number}>>} keyed by stop id; {} on any failure. */
export async function fetchEtas(origin, stops) {
  const key = process.env.OLAMAPS_API_KEY;
  if (!key || !valid(origin)) return {};
  const usable = (stops || []).filter((s) => s?.id && valid(s)).slice(0, MAX_STOPS);
  if (!usable.length) return {};

  const ck = `${r4(origin.lat)},${r4(origin.lng)}>${usable.map((s) => `${r4(s.lat)},${r4(s.lng)}`).join("|")}`;
  const hit = cache.get(ck);
  const out = {};
  let elements = hit && Date.now() - hit.at < TTL_MS ? hit.value : null;

  if (!elements) {
    const qs = new URLSearchParams({
      origins: `${r4(origin.lat)},${r4(origin.lng)}`,
      destinations: usable.map((s) => `${r4(s.lat)},${r4(s.lng)}`).join("|"),
      api_key: key,
    });
    try {
      const res = await fetch(`${BASE}?${qs}`, { headers: { Origin: ORIGIN_HEADER }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return {};
      elements = (await res.json())?.rows?.[0]?.elements || null;
    } catch {
      return {};
    }
    if (!elements) return {};
    if (cache.size > 500) cache.clear();
    cache.set(ck, { at: Date.now(), value: elements });
  }

  usable.forEach((s, i) => {
    const e = elements[i];
    if (e && Number.isFinite(e.duration) && Number.isFinite(e.distance)) {
      out[s.id] = { minutes: Math.max(1, Math.round(e.duration / 60)), km: Math.round(e.distance / 100) / 10 };
    }
  });
  return out;
}
