import { botRoute } from "@/lib/whatsappBot/adminAuth";
import { PERMISSIONS } from "@/lib/whatsappBot/constants";
import { recentPatients } from "@/lib/whatsappBot/inboxStore";

// GET ?days=14&limit=50 -> patients with recent interactions (phone hash + MRN only; no phone numbers or names)
export const GET = botRoute(PERMISSIONS.trackerView, async (request) => {
  const sp = new URL(request.url).searchParams;
  return { ok: true, patients: await recentPatients({ limit: sp.get("limit"), days: Number(sp.get("days")) || 14 }) };
});
