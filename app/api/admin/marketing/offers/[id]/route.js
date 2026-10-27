import { marketingRoute, readJson } from "@/lib/marketingCampaigns/adminAuth";
import { archiveOffer, getOffer, saveOffer, writeMarketingAudit } from "@/lib/marketingCampaigns/store";

export const GET = marketingRoute(async (_req, { params }) => {
  const offer = await getOffer(params.id);
  return offer ? { ok: true, offer } : { ok: false, error: "Offer not found" };
});

export const PUT = marketingRoute(async (request, { actor, params }) => {
  const r = await saveOffer({ id: params.id, input: await readJson(request), actor });
  if (r.ok) await writeMarketingAudit({ actor, action: "offer.update", details: { offer_id: params.id } });
  return r;
});

export const DELETE = marketingRoute(async (_req, { actor, params }) => {
  const r = await archiveOffer(params.id);
  await writeMarketingAudit({ actor, action: "offer.archive", details: { offer_id: params.id } });
  return r;
});
