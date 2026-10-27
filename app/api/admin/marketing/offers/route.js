import { marketingRoute, readJson } from "@/lib/marketingCampaigns/adminAuth";
import { listOffers, saveOffer, writeMarketingAudit } from "@/lib/marketingCampaigns/store";

export const GET = marketingRoute(async () => ({ ok: true, offers: await listOffers() }));

// POST { name, discount_type:"pct"|"flat", value, applies_to_packages?, valid_from?, valid_to?, tier_map?, terms?, code? }
export const POST = marketingRoute(async (request, { actor }) => {
  const r = await saveOffer({ input: await readJson(request), actor });
  if (r.ok) await writeMarketingAudit({ actor, action: "offer.create", details: { offer_id: r.offer.id, offer_name: r.offer.name } });
  return r;
});
