import { botRoute } from "@/lib/whatsappBot/adminAuth";
import { PERMISSIONS } from "@/lib/whatsappBot/constants";
import { patientTimeline } from "@/lib/whatsappBot/inboxStore";

// GET ?phone=<10 digits> | ?phone_hash=<hash> | ?mrn=<MRN> -> one patient's timeline: bot/inbox events plus the campaign messages sent to them
export const GET = botRoute(PERMISSIONS.trackerView, async (request) => {
  const sp = new URL(request.url).searchParams;
  const phone = sp.get("phone"), hash = sp.get("phone_hash"), mrn = sp.get("mrn");
  if (!phone && !hash && !mrn) return { ok: false, error: "phone, phone_hash or mrn required" };
  return { ok: true, ...(await patientTimeline({ phone, phoneHashKey: hash, mrn, limit: sp.get("limit") })) };
});
