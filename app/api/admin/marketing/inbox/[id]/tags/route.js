import { botRoute, readJson, auditStaff } from "@/lib/whatsappBot/adminAuth";
import { PERMISSIONS } from "@/lib/whatsappBot/constants";
import { getThread, updateThread } from "@/lib/whatsappBot/inboxStore";
import { normaliseTags, publicThread } from "@/lib/whatsappBot/inboxActions";

// POST { add: ["billing"], remove: ["booking"] }  (tags are lower-case slugs, max 10 per thread)
export const POST = botRoute(PERMISSIONS.inboxReply, async (request, { user, params }) => {
  const thread = await getThread(params.id);
  if (!thread) return { ok: false, status: 404, error: "not_found" };
  const { add, remove } = await readJson(request);
  const drop = new Set(normaliseTags(remove));
  const tags = normaliseTags([...(thread.tags || []), ...normaliseTags(add)]).filter((t) => !drop.has(t));
  const updated = await updateThread(thread.id, { tags });
  await auditStaff(request, user, "inbox.tag", "whatsapp_inbox_thread", thread.id, { tag_count: tags.length });
  return { ok: true, thread: publicThread(updated) };
});
