// lib/phone.js

export function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

export function phoneLast10(value) {
  const digits = digitsOnly(value);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function toCanonicalIndiaPhone(value) {
  const digits = digitsOnly(value);
  if (!digits) return "";

  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length > 12) {
    return `91${digits.slice(-10)}`;
  }
  return digits;
}

export function phoneVariantsIndia(value) {
  const raw = String(value || "").trim();
  const digits = digitsOnly(raw);
  const last10 = phoneLast10(value);
  const canonical = toCanonicalIndiaPhone(value);
  const plusCanonical = canonical ? `+${canonical}` : "";
  const canonicalFromLast10 = last10 ? `91${last10}` : "";
  const plusFromLast10 = last10 ? `+91${last10}` : "";
  const waPrefixCanonical = canonical ? `whatsapp:+${canonical}` : "";
  const waPrefixFromLast10 = last10 ? `whatsapp:+91${last10}` : "";
  const waJidCanonical = canonical ? `${canonical}@s.whatsapp.net` : "";
  const waJidFromLast10 = last10 ? `91${last10}@s.whatsapp.net` : "";
  const waJidPlusCanonical = canonical ? `+${canonical}@s.whatsapp.net` : "";

  return Array.from(
    new Set(
      [
        raw,
        digits,
        last10,
        canonical,
        plusCanonical,
        canonicalFromLast10,
        plusFromLast10,
        waPrefixCanonical,
        waPrefixFromLast10,
        waJidCanonical,
        waJidFromLast10,
        waJidPlusCanonical
      ].filter(Boolean)
    )
  );
}
