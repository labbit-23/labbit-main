import { botRoute, readJson, auditStaff } from "@/lib/whatsappBot/adminAuth";
import { PERMISSIONS } from "@/lib/whatsappBot/constants";
import { loadSettings, saveSettingKey, readRawSettingKey } from "@/lib/whatsappBot/store";
import { DEFAULT_TEXTS, LANGS, validateTextOverrides, allowedPlaceholders } from "@/lib/whatsappBot/texts";

// GET -> { languages, defaults, overrides, placeholders }.
// PUT { texts: { en: { holding_reply: "..." }, hi: { holding_reply: "..." } } } merges per key; empty string / null reverts that key.
export const GET = botRoute(PERMISSIONS.botView, async () => {
  const s = await loadSettings({ maxAgeMs: 0 });
  const placeholders = Object.fromEntries(Object.keys(DEFAULT_TEXTS.en).map((k) => [k, allowedPlaceholders(k)]));
  return { ok: true, languages: LANGS, defaults: DEFAULT_TEXTS, overrides: s.texts, placeholders };
});

export const PUT = botRoute(PERMISSIONS.botManage, async (request, { user }) => {
  const { texts } = await readJson(request);
  const v = validateTextOverrides(texts);
  if (!v.ok) return { ok: false, errors: v.errors };
  const current = await readRawSettingKey("texts");
  const merged = { ...current };
  for (const [lang, map] of Object.entries(texts)) {
    merged[lang] = { ...(merged[lang] || {}) };
    for (const [key, value] of Object.entries(map)) {
      if (value === null || value === "") delete merged[lang][key];
      else if (v.clean[lang]?.[key] !== undefined) merged[lang][key] = v.clean[lang][key];
    }
  }
  await saveSettingKey("texts", merged, { userId: user.id || null });
  await auditStaff(request, user, "texts.update", "whatsapp_bot_settings", "texts", { keys: Object.values(texts).flatMap((m) => Object.keys(m)) });
  return { ok: true, overrides: (await loadSettings({ maxAgeMs: 0 })).texts };
});
