// Shared helpers for "is this address text a real address?" decisions.
//
// WhatsApp/web booking requests that only share a location pin arrive with a
// placeholder area (e.g. quickbookings.area = "Not provided"). That placeholder
// used to flow into visits.address and patient_addresses.area verbatim, hiding
// the pin that was actually shared (RAKSHA, 2026-10-11).

const PLACEHOLDER_LOCATION_TEXT = new Set([
  "not provided",
  "not available",
  "not specified",
  "not given",
  "n/a",
  "na",
  "nil",
  "none",
  "null",
  "unknown",
  "location pending",
  "pin shared",
  "-",
  "--",
]);

export function isPlaceholderLocationText(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return true;
  return PLACEHOLDER_LOCATION_TEXT.has(text);
}

// Returns the trimmed text, or "" when it is empty / a placeholder.
export function cleanLocationText(value) {
  const text = String(value ?? "").trim();
  return isPlaceholderLocationText(text) ? "" : text;
}

export function coordsLabel(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return "";
  return `${la},${ln}`;
}
