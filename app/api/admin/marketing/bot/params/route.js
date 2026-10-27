import { botRoute, readJson, auditStaff } from "@/lib/whatsappBot/adminAuth";
import { PERMISSIONS, DEFAULT_PARAMS } from "@/lib/whatsappBot/constants";
import { loadSettings, saveSettingKey, readRawSettingKey } from "@/lib/whatsappBot/store";
import { validateParamsPatch } from "@/lib/whatsappBot/settings";

// GET -> { params, defaults }.  PUT { params: { min_confidence: 0.7, window_reopen_templates: [{name, language, label, params}] } }
export const GET = botRoute(PERMISSIONS.botView, async () => {
  const s = await loadSettings({ maxAgeMs: 0 });
  return { ok: true, params: s.params, defaults: DEFAULT_PARAMS };
});

export const PUT = botRoute(PERMISSIONS.botManage, async (request, { user }) => {
  const { params } = await readJson(request);
  const v = validateParamsPatch(params);
  if (!v.ok || !Object.keys(v.clean).length) return { ok: false, errors: v.errors.length ? v.errors : ["no params given"] };
  const current = await readRawSettingKey("params");
  await saveSettingKey("params", { ...current, ...v.clean }, { userId: user.id || null });
  await auditStaff(request, user, "params.update", "whatsapp_bot_settings", "params", { changed_keys: Object.keys(v.clean) });
  return { ok: true, params: (await loadSettings({ maxAgeMs: 0 })).params };
});
