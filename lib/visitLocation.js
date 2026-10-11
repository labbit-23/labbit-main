// Single place that answers "where is this visit?" for the admin visits table
// and the phlebo screens.
//
// Order of preference (first hit wins):
//   1. visit.lat / visit.lng          (column absent on some deployments)
//   2. coordinates written in visit.address / visit.location_text
//   3. a maps link written in visit.address / visit.location_text
//   4. the patient address the visit is linked to (visit.address_id)
//   5. SUGGESTION ONLY: the patient's single geo-coded saved address
//
// `suggested: true` means "we guessed from the patient's record, this
// booking did not carry a location" -- callers should render it differently
// and must not treat it as confirmed (e.g. no ETA routing off it).
import { cleanLocationText } from "./locationText";

const toNum = (v) => {
  if (v === null || typeof v === "undefined" || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const inRange = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

export function extractLatLngFromText(value) {
  const text = String(value || "");
  if (!text.trim()) return null;
  const patterns = [
    /[?&](?:q|query|ll)=(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i,
    /@(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
    /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (inRange(lat, lng)) return { lat, lng };
  }
  return null;
}

export function extractMapsLink(value) {
  const m = String(value || "").match(
    /(https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.com)[^\s]*)/i
  );
  return m ? m[1] : null;
}

const mapsPin = (lat, lng) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

const geoOf = (a) => {
  const lat = toNum(a?.lat);
  const lng = toNum(a?.lng);
  return inRange(lat, lng) ? { lat, lng } : null;
};

export function resolveVisitLocation(visit) {
  if (!visit) return null;

  const own = geoOf(visit);
  if (own) return { ...own, url: mapsPin(own.lat, own.lng), source: "visit", suggested: false };

  const texts = [visit.location_text, visit.address].filter((t) => cleanLocationText(t));
  for (const t of texts) {
    const c = extractLatLngFromText(t);
    if (c) return { ...c, url: mapsPin(c.lat, c.lng), source: "visit_text", suggested: false };
  }
  for (const t of texts) {
    const link = extractMapsLink(t);
    if (link) return { lat: null, lng: null, url: link, source: "visit_link", suggested: false };
  }

  const addresses = Array.isArray(visit.patient?.addresses) ? visit.patient.addresses : [];

  if (visit.address_id) {
    const linked = addresses.find((a) => String(a.id) === String(visit.address_id));
    const g = geoOf(linked);
    if (g) return { ...g, url: mapsPin(g.lat, g.lng), source: "linked_address", suggested: false };
  }

  const geoCoded = addresses.map(geoOf).filter(Boolean);
  if (geoCoded.length === 1) {
    const g = geoCoded[0];
    return { ...g, url: mapsPin(g.lat, g.lng), source: "patient_only_address", suggested: true };
  }

  return null;
}
