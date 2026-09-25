// File: app/api/internal/routing/eta/route.js
//
// Phlebo screen ETA: POST { origin: {lat,lng}, stops: [{id, lat?, lng?, pincode?, area?}] }
// -> { etas: { [id]: { minutes, km, approx? } } }. Free Ola calls only (see
// lib/olaEta.js). Never errors on a routing failure -- an empty map just
// means the cards show no ETA.
//
// A stop with no saved pin falls back to the median position of OTHER saved
// pins in the same pincode (else the same area name) -- our own data, so no
// geocoding call. Those ETAs are flagged approx: true.
import { NextResponse } from "next/server";
import { getSessionUser, deny } from "@/lib/uac/authz";
import { scoped, query } from "@/lib/pgScoped";
import { fetchEtas, MAX_STOPS } from "@/lib/olaEta";

const hasPin = (s) => Number.isFinite(Number(s?.lat)) && Number.isFinite(Number(s?.lng)) && s.lat != null && s.lng != null;

async function areaCentroid(s) {
  const pincode = String(s.pincode || "").trim();
  const area = String(s.area || "").trim().toLowerCase();
  if (!pincode && !area) return null;
  const rows = await query(
    `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY lat) AS lat,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY lng) AS lng,
            count(*)::int AS n
     FROM patient_addresses
     WHERE lat IS NOT NULL AND lng IS NOT NULL
       AND ${pincode ? "pincode = $1" : "lower(trim(area)) = $1"}`,
    [pincode || area]
  );
  const r = rows[0];
  return r && r.n >= 3 && r.lat != null ? { lat: Number(r.lat), lng: Number(r.lng) } : null; // <3 pins = not representative
}

export async function POST(request) {
  const user = await getSessionUser(request);
  if (!user) return deny("Not authenticated", 401);
  const body = await request.json().catch(() => ({}));
  const stops = Array.isArray(body?.stops) ? body.stops.slice(0, MAX_STOPS) : [];

  const exact = stops.filter(hasPin);
  const approxIds = new Set();
  const resolved = [...exact];
  const cache = new Map();
  try {
    await scoped({ mode: "all", labId: null }, async () => {
      for (const s of stops.filter((x) => !hasPin(x))) {
        const k = `${s.pincode || ""}|${String(s.area || "").toLowerCase()}`;
        if (!cache.has(k)) cache.set(k, await areaCentroid(s));
        const c = cache.get(k);
        if (c) { resolved.push({ id: s.id, ...c }); approxIds.add(s.id); }
      }
    });
  } catch { /* fallback is optional; exact-pin ETAs still go out */ }

  const etas = await fetchEtas(body?.origin, resolved);
  for (const id of approxIds) if (etas[id]) etas[id].approx = true;
  return NextResponse.json({ etas });
}
