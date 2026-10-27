import { botRoute } from "@/lib/whatsappBot/adminAuth";
import { PERMISSIONS } from "@/lib/whatsappBot/constants";
import { getThread, threadDetail, updateThread, patientTimeline } from "@/lib/whatsappBot/inboxStore";
import { publicThread } from "@/lib/whatsappBot/inboxActions";

// GET -> thread + messages + notes + the patient's interaction timeline. Opening a thread clears its unread counter.
export const GET = botRoute(PERMISSIONS.inboxView, async (_request, { params }) => {
  const thread = await getThread(params.id);
  if (!thread) return { ok: false, status: 404, error: "not_found" };
  const [detail, timeline] = await Promise.all([threadDetail(thread.id), patientTimeline({ phone: thread.phone10, limit: 100 })]);
  if (thread.unread_count) await updateThread(thread.id, { unread_count: 0 });
  return { ok: true, thread: publicThread(thread), ...detail, timeline };
});
