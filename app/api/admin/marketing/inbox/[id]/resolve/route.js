import { botRoute, readJson, auditStaff } from "@/lib/whatsappBot/adminAuth";
import { PERMISSIONS } from "@/lib/whatsappBot/constants";
import { getThread, updateThread, addNote } from "@/lib/whatsappBot/inboxStore";
import { recordEvent } from "@/lib/whatsappBot/store";
import { publicThread } from "@/lib/whatsappBot/inboxActions";

// POST { note?: string, reopen?: boolean } resolves the thread (or re-opens it with reopen:true)
export const POST = botRoute(PERMISSIONS.inboxReply, async (request, { user, params }) => {
  const thread = await getThread(params.id);
  if (!thread) return { ok: false, status: 404, error: "not_found" };
  const { note, reopen } = await readJson(request);
  if (reopen) {
    const updated = await updateThread(thread.id, { status: thread.assigned_to ? "assigned" : "open", resolved_at: null });
    await auditStaff(request, user, "inbox.reopen", "whatsapp_inbox_thread", thread.id);
    return { ok: true, thread: publicThread(updated) };
  }
  if (note) await addNote({ threadId: thread.id, authorId: user.id || null, authorName: user.name || null, body: note });
  const updated = await updateThread(thread.id, { status: "resolved", resolved_at: new Date().toISOString(), unread_count: 0 });
  await recordEvent({ phone_hash: thread.phone_hash, mrn: thread.mrn, thread_id: thread.id, event_type: "staff_resolved" });
  await auditStaff(request, user, "inbox.resolve", "whatsapp_inbox_thread", thread.id, { with_note: Boolean(note) });
  return { ok: true, thread: publicThread(updated) };
});
