import { buildCampaignConfig, deleteDraftCampaign, getCampaignDetail, updateCampaign } from "@/lib/marketingCampaigns";
import { marketingRoute, readJson } from "@/lib/marketingCampaigns/adminAuth";
import { getSegment, writeMarketingAudit } from "@/lib/marketingCampaigns/store";

export const GET = marketingRoute(async (_req, { params }) => getCampaignDetail({ campaignId: params.id }));

// PATCH: drafts only. Same body as create.
export const PATCH = marketingRoute(async (request, { actor, params }) => {
  const body = await readJson(request);
  const segmentRow = body.segment_id ? await getSegment(body.segment_id) : null;
  if (body.segment_id && !segmentRow) return { ok: false, error: "Segment not found" };
  const built = buildCampaignConfig(body, segmentRow);
  if (built.errors.length) return { ok: false, error: built.errors.join("; ") };
  const r = await updateCampaign({ campaignId: params.id, name: body.name, config: built.config, offerId: body.offer_id, segmentId: segmentRow?.id });
  if (r.ok) await writeMarketingAudit({ actor, action: "campaign.update", campaignId: params.id, details: { limits: r.config.limits } });
  return r;
});

// DELETE: drafts with no recipients only.
export const DELETE = marketingRoute(async (_req, { actor, params }) => {
  const r = await deleteDraftCampaign({ campaignId: params.id });
  if (r.ok) await writeMarketingAudit({ actor, action: "campaign.delete", campaignId: params.id });
  return r;
});
