// Bot settings = flags + params + text overrides, stored as rows of public.whatsapp_bot_settings (key, value jsonb).
// Missing row / DB error => defaults => everything OFF (fail closed).
import { DEFAULT_FLAGS, DEFAULT_PARAMS, FLAG_KEYS, PARAM_KEYS } from "./constants.js";
import { validateTextOverrides } from "./texts.js";

export function mergeSettings(rows = []) {
  const byKey = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
  const flags = { ...DEFAULT_FLAGS };
  for (const k of FLAG_KEYS) if (typeof byKey.flags?.[k] === "boolean") flags[k] = byKey.flags[k];
  const params = { ...DEFAULT_PARAMS };
  for (const k of PARAM_KEYS) if (byKey.params && byKey.params[k] !== undefined) params[k] = byKey.params[k];
  const texts = validateTextOverrides(byKey.texts || {}).clean;
  return { flags, params, texts };
}

// A flag is effective only when the global switch is on too.
export function flagOn(settings, key) {
  return Boolean(settings?.flags?.global_enabled && settings?.flags?.[key]);
}

export function validateFlagsPatch(patch) {
  const errors = [];
  const clean = {};
  if (!patch || typeof patch !== "object") return { ok: false, errors: ["flags must be an object"], clean };
  for (const [k, v] of Object.entries(patch)) {
    if (!FLAG_KEYS.includes(k)) errors.push(`unknown flag: ${k}`);
    else if (typeof v !== "boolean") errors.push(`flag ${k} must be true or false`);
    else clean[k] = v;
  }
  return { ok: errors.length === 0, errors, clean };
}

export function validateParamsPatch(patch) {
  const errors = [];
  const clean = {};
  if (!patch || typeof patch !== "object") return { ok: false, errors: ["params must be an object"], clean };
  for (const [k, v] of Object.entries(patch)) {
    if (!PARAM_KEYS.includes(k)) { errors.push(`unknown param: ${k}`); continue; }
    if (k === "min_confidence") {
      if (typeof v !== "number" || v < 0.3 || v > 1) errors.push("min_confidence must be a number between 0.3 and 1");
      else clean[k] = v;
    } else if (k === "window_reopen_templates") {
      if (!Array.isArray(v) || v.length > 10 || v.some((t) => !t || typeof t.name !== "string" || !/^[a-z0-9_]{1,512}$/.test(t.name))) errors.push("window_reopen_templates must be a list (max 10) of { name, language, params }");
      else clean[k] = v.map((t) => ({ name: t.name, language: String(t.language || "en"), label: String(t.label || t.name).slice(0, 80), params: Array.isArray(t.params) ? t.params.map(String).slice(0, 8) : [] }));
    } else {
      if (!Number.isInteger(v) || v < 0 || v > 1000) errors.push(`${k} must be an integer between 0 and 1000`);
      else clean[k] = v;
    }
  }
  return { ok: errors.length === 0, errors, clean };
}
