import { botRoute, readJson, auditStaff } from "@/lib/whatsappBot/adminAuth";
import { PERMISSIONS } from "@/lib/whatsappBot/constants";
import { getThread, addNote, threadDetail } from "@/lib/whatsappBot/inboxStore";

// POST { body } adds an internal note (never sent to the patient). GET lists notes.
export const GET = botRoute(PERMISSIONS.inboxView, async (_r, { params }) => {
  const thread = await getThread(params.id);
  if (!thread) return { ok: false, status: 404, error: "not_found" };
  return { ok: true, notes: (await threadDetail(thread.id)).notes };
});

export const POST = botRoute(PERMISSIONS.inboxReply, async (request, { user, params }) => {
  const thread = await getThread(params.id);
  if (!thread) return { ok: false, status: 404, error: "not_found" };
  const { body } = await readJson(request);
  if (!String(body || "").trim()) return { ok: false, error: "body_required" };
  await addNote({ threadId: thread.id, authorId: user.id || null, authorName: user.name || null, body });
  await auditStaff(request, user, "inbox.note", "whatsapp_inbox_thread", thread.id);
  return { ok: true, notes: (await threadDetail(thread.id)).notes };
});
