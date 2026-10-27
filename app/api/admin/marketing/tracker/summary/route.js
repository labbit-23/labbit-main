import { botRoute } from "@/lib/whatsappBot/adminAuth";
import { PERMISSIONS } from "@/lib/whatsappBot/constants";
import { trackerSummary } from "@/lib/whatsappBot/inboxStore";

// GET ?days=7 (1-90) -> aggregate counts by event type / intent / day / campaign, handoff reasons, open inbox threads
export const GET = botRoute(PERMISSIONS.trackerView, async (request) => ({ ok: true, ...(await trackerSummary(new URL(request.url).searchParams.get("days"))) }));
