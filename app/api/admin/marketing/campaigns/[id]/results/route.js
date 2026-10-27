import { campaignResults } from "@/lib/marketingCampaigns";
import { marketingRoute } from "@/lib/marketingCampaigns/adminAuth";

// GET ?refresh=0|1 (default 1: pull Meta delivery statuses first) &engagement=0|1 (default 1: replies and button taps)
export const GET = marketingRoute(async (request, { params }) => {
  const sp = new URL(request.url).searchParams;
  return campaignResults({ campaignId: params.id, refresh: sp.get("refresh") !== "0", engagement: sp.get("engagement") !== "0" });
});
