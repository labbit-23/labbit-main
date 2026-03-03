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
  const digits = digitsOnly(value);
  const last10 = phoneLast10(value);
  const canonical = toCanonicalIndiaPhone(value);
  const plusCanonical = canonical ? `+${canonical}` : "";
  const canonicalFromLast10 = last10 ? `91${last10}` : "";
  const plusFromLast10 = last10 ? `+91${last10}` : "";

  return Array.from(
    new Set(
      [
        String(value || "").trim(),
        digits,
        last10,
        canonical,
        plusCanonical,
        canonicalFromLast10,
        plusFromLast10
      ].filter(Boolean)
    )
  );
}

