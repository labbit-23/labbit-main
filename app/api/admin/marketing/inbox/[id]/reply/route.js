import { botRoute, readJson, auditStaff } from "@/lib/whatsappBot/adminAuth";
import { PERMISSIONS } from "@/lib/whatsappBot/constants";
import { getThread, updateThread } from "@/lib/whatsappBot/inboxStore";
import { replyToThread } from "@/lib/whatsappBot/inboxActions";
import { loadSettings, recordEvent, appendThreadMessage } from "@/lib/whatsappBot/store";

// POST { text } inside the 24 h window; outside it { template: { name, params: [] } } with a name from settings.params.window_reopen_templates,
// otherwise 409 { error: "window_closed", allowed_templates }.
export const POST = botRoute(PERMISSIONS.inboxReply, async (request, { user, params }) => {
  const thread = await getThread(params.id);
  if (!thread) return { ok: false, status: 404, error: "not_found" };
  const body = await readJson(request);
  const { sendTextMessage, sendTemplateMessage } = await import("@/lib/whatsapp/sender");
  const sender = { name: user.name || "staff", role: "staff", userType: "staff" };
  const result = await replyToThread({ thread, text: body.text, template: body.template, staffUserId: user.id || null }, {
    loadSettings: () => loadSettings({ maxAgeMs: 0 }), recordEvent, appendThreadMessage,
    sendText: ({ phone, labId, text }) => sendTextMessage({ labId, phone: `91${phone}`, text, sender }),
    sendTemplate: ({ phone, labId, templateName, languageCode, templateParams }) => sendTemplateMessage({ labId, phone: `91${phone}`, templateName, languageCode, templateParams, sender }),
    markReplied: (id) => updateThread(id, { unread_count: 0, last_message_at: new Date().toISOString(), last_staff_reply_at: new Date().toISOString() })
  });
  await auditStaff(request, user, result.ok ? "inbox.reply" : "inbox.reply_refused", "whatsapp_inbox_thread", thread.id, { sent: result.sent || null, error: result.error || null });
  return result;
});
