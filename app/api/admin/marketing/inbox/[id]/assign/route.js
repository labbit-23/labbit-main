import { botRoute, readJson, auditStaff } from "@/lib/whatsappBot/adminAuth";
import { PERMISSIONS } from "@/lib/whatsappBot/constants";
import { getThread, updateThread } from "@/lib/whatsappBot/inboxStore";
import { recordEvent } from "@/lib/whatsappBot/store";
import { publicThread } from "@/lib/whatsappBot/inboxActions";

// POST { assignee: "me" | "<staff user id>" | null }  (null unassigns and re-opens)
export const POST = botRoute(PERMISSIONS.inboxReply, async (request, { user, params }) => {
  const thread = await getThread(params.id);
  if (!thread) return { ok: false, status: 404, error: "not_found" };
  const { assignee } = await readJson(request);
  const target = assignee === "me" ? String(user.id || "") : assignee ? String(assignee).slice(0, 64) : null;
  const updated = await updateThread(thread.id, { assigned_to: target, status: target ? "assigned" : "open" });
  await recordEvent({ phone_hash: thread.phone_hash, mrn: thread.mrn, thread_id: thread.id, event_type: "staff_assigned" });
  await auditStaff(request, user, "inbox.assign", "whatsapp_inbox_thread", thread.id, { assigned: Boolean(target), self: assignee === "me" });
  return { ok: true, thread: publicThread(updated) };
});
