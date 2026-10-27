import { botRoute } from "@/lib/whatsappBot/adminAuth";
import { PERMISSIONS } from "@/lib/whatsappBot/constants";
import { listThreads } from "@/lib/whatsappBot/inboxStore";
import { publicThread } from "@/lib/whatsappBot/inboxActions";

// GET ?status=open|assigned|resolved (default: all unresolved) &assigned=none|<user id> &tag= &q=<10-digit phone or MRN> &limit=50 &before=<iso>
export const GET = botRoute(PERMISSIONS.inboxView, async (request, { user }) => {
  const sp = new URL(request.url).searchParams;
  const assigned = sp.get("assigned") === "me" ? String(user.id || "") : sp.get("assigned");
  const rows = await listThreads({ status: sp.get("status"), assignedTo: assigned, tag: sp.get("tag"), q: sp.get("q"), limit: sp.get("limit"), before: sp.get("before") });
  return { ok: true, threads: rows.map(publicThread), next_before: rows.length ? rows[rows.length - 1].last_message_at : null };
});
