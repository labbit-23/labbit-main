import { botRoute, readJson, auditStaff } from "@/lib/whatsappBot/adminAuth";
import { PERMISSIONS, DEFAULT_FLAGS, FLAG_LABELS } from "@/lib/whatsappBot/constants";
import { loadSettings, saveSettingKey, readRawSettingKey } from "@/lib/whatsappBot/store";
import { validateFlagsPatch } from "@/lib/whatsappBot/settings";

// GET -> { flags, labels, defaults }.  PUT { flags: { report_status: true, ... } } merges into the stored flags.
export const GET = botRoute(PERMISSIONS.botView, async () => {
  const s = await loadSettings({ maxAgeMs: 0 });
  return { ok: true, flags: s.flags, labels: FLAG_LABELS, defaults: DEFAULT_FLAGS };
});

export const PUT = botRoute(PERMISSIONS.botManage, async (request, { user }) => {
  const { flags } = await readJson(request);
  const v = validateFlagsPatch(flags);
  if (!v.ok || !Object.keys(v.clean).length) return { ok: false, errors: v.errors.length ? v.errors : ["no flags given"] };
  const current = await readRawSettingKey("flags");
  await saveSettingKey("flags", { ...current, ...v.clean }, { userId: user.id || null });
  await auditStaff(request, user, "flags.update", "whatsapp_bot_settings", "flags", { changed: v.clean });
  return { ok: true, flags: (await loadSettings({ maxAgeMs: 0 })).flags };
});
