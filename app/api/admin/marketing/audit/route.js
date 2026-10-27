import { marketingRoute } from "@/lib/marketingCampaigns/adminAuth";
import { listMarketingAudit } from "@/lib/marketingCampaigns/store";

// GET ?campaign_id=&limit=100
export const GET = marketingRoute(async (request) => {
  const sp = new URL(request.url).searchParams;
  return { ok: true, audit: await listMarketingAudit({ campaignId: sp.get("campaign_id") || null, limit: sp.get("limit") || 100 }) };
});
