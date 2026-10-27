import { botRoute, auditStaff } from "@/lib/whatsappBot/adminAuth";
import { PERMISSIONS } from "@/lib/whatsappBot/constants";
import { saveSettingKey, readRawSettingKey } from "@/lib/whatsappBot/store";

// POST -> switches every bot automation off at once (global_enabled=false). Individual flags keep their values for re-enabling.
export const POST = botRoute(PERMISSIONS.botManage, async (request, { user }) => {
  const current = await readRawSettingKey("flags");
  await saveSettingKey("flags", { ...current, global_enabled: false }, { userId: user.id || null });
  await auditStaff(request, user, "kill_switch", "whatsapp_bot_settings", "flags", { global_enabled: false });
  return { ok: true, global_enabled: false };
});
