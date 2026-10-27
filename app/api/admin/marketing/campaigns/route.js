import { buildCampaignConfig, createCampaign, listCampaigns } from "@/lib/marketingCampaigns";
import { marketingRoute, readJson } from "@/lib/marketingCampaigns/adminAuth";
import { getSegment, writeMarketingAudit } from "@/lib/marketingCampaigns/store";

export const GET = marketingRoute(async (request) => ({ ok: true, campaigns: await listCampaigns({ limit: new URL(request.url).searchParams.get("limit") }) }));

// POST { name, template_key, header_image_url?, button_text?, segment_id | filter, offer_id?, pilot_size?, limits?{per_run_cap,daily_cap,rate_per_minute,window_*,cooldown_days}, send_after? }
// Limits are clamped to the hard ceilings in code; the panel cannot raise them. send_after is applied by the `schedule` action after prepare.
export const POST = marketingRoute(async (request, { actor }) => {
  const body = await readJson(request);
  let segmentRow = null;
  if (body.segment_id) {
    segmentRow = await getSegment(body.segment_id);
    if (!segmentRow || segmentRow.archived_at) return { ok: false, error: "Segment not found" };
  }
  const built = buildCampaignConfig(body, segmentRow);
  if (built.errors.length) return { ok: false, error: built.errors.join("; ") };
  const labId = String(body.lab_id || process.env.DEFAULT_LAB_ID || "").trim();
  const r = await createCampaign({ labId, name: body.name, config: built.config, segmentId: segmentRow?.id || null, offerId: body.offer_id || null, createdBy: actor.name });
  if (r.ok) await writeMarketingAudit({ actor, action: "campaign.create", campaignId: r.campaign_id, details: { template_key: r.config.template.key, segment_id: segmentRow?.id || null, offer_id: body.offer_id || null, limits: r.config.limits, pilot_size: r.config.pilot_size } });
  return r;
});
