// Offers: pure helpers (no I/O). An offer row (marketing_offers):
//   { id, name, discount_type:'pct'|'flat', value, applies_to_packages:[text], valid_from, valid_to (dates), tier_map:{ <tier>:{ value?, text?, packages? } }, terms, code }
// A recipient's offer_tier (from labit-core) picks a tier_map entry; no entry -> the offer's base values.

const TYPES = ["pct", "flat"];
const isDate = (v) => v == null || v === "" || /^\d{4}-\d{2}-\d{2}$/.test(String(v));

export function normalizeOffer(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const tierMap = {};
  if (o.tier_map && typeof o.tier_map === "object" && !Array.isArray(o.tier_map)) {
    for (const [tier, t] of Object.entries(o.tier_map)) {
      if (!t || typeof t !== "object") continue;
      tierMap[String(tier).trim()] = {
        ...(t.value != null && t.value !== "" ? { value: Number(t.value) } : {}),
        ...(t.text ? { text: String(t.text).trim().slice(0, 300) } : {}),
        ...(Array.isArray(t.packages) ? { packages: t.packages.map((p) => String(p).trim()).filter(Boolean) } : {})
      };
    }
  }
  return {
    name: String(o.name || "").trim(),
    discount_type: String(o.discount_type || "").trim().toLowerCase(),
    value: Number(o.value),
    applies_to_packages: Array.isArray(o.applies_to_packages) ? o.applies_to_packages.map((p) => String(p).trim()).filter(Boolean) : [],
    valid_from: o.valid_from ? String(o.valid_from).slice(0, 10) : null,
    valid_to: o.valid_to ? String(o.valid_to).slice(0, 10) : null,
    tier_map: tierMap,
    terms: String(o.terms || "").trim().slice(0, 2000),
    code: String(o.code || "").trim().toUpperCase().slice(0, 30)
  };
}

export function validateOffer(o) {
  const errors = [];
  if (!o.name) errors.push("name is required");
  if (!TYPES.includes(o.discount_type)) errors.push("discount_type must be pct or flat");
  if (!Number.isFinite(o.value) || o.value <= 0) errors.push("value must be a positive number");
  if (o.discount_type === "pct" && o.value > 100) errors.push("pct value cannot exceed 100");
  if (!isDate(o.valid_from) || !isDate(o.valid_to)) errors.push("valid_from/valid_to must be YYYY-MM-DD");
  if (o.valid_from && o.valid_to && o.valid_from > o.valid_to) errors.push("valid_from is after valid_to");
  for (const [tier, t] of Object.entries(o.tier_map || {})) {
    if (t.value != null && (!Number.isFinite(t.value) || t.value <= 0 || (o.discount_type === "pct" && t.value > 100))) errors.push(`tier ${tier}: invalid value`);
  }
  if (o.code && !/^[A-Z0-9_-]{2,30}$/.test(o.code)) errors.push("code must be 2-30 letters/digits/-/_");
  return errors;
}

/** Active on `todayIst` (YYYY-MM-DD) when inside [valid_from, valid_to]; an open end is open. */
export function offerIsActive(offer, todayIst) {
  if (!offer) return false;
  if (offer.valid_from && todayIst < String(offer.valid_from).slice(0, 10)) return false;
  if (offer.valid_to && todayIst > String(offer.valid_to).slice(0, 10)) return false;
  return true;
}

function money(n) { return Number.isInteger(n) ? String(n) : n.toFixed(2); }

/** The benefit sentence for one tier, e.g. "20% off on Executive Health Checkup". */
export function offerTextFor(offer, tier) {
  const t = (tier && offer.tier_map?.[tier]) || {};
  if (t.text) return t.text;
  const value = t.value != null ? t.value : Number(offer.value);
  const pk = (t.packages && t.packages.length ? t.packages : offer.applies_to_packages) || [];
  const what = offer.discount_type === "flat" ? `Rs ${money(value)} off` : `${money(value)}% off`;
  return pk.length ? `${what} on ${pk.join(", ")}` : what;
}

/** "30 Nov 2026" for a YYYY-MM-DD, or "". */
export function formatValidTill(validTo) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(validTo || ""));
  if (!m) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

/** Per-recipient snapshot stored on campaign_recipients. */
export function snapshotFor(offer, row) {
  const tier = row?.offer_tier ? String(row.offer_tier) : null;
  const focus = Array.isArray(row?.focus_areas) ? row.focus_areas.map(String).filter(Boolean) : [];
  return {
    offer_id: offer?.id || null,
    offer_text: offer ? offerTextFor(offer, tier) : null,
    focus_areas: focus.length ? focus.join(", ") : null,
    offer_tier: tier
  };
}
