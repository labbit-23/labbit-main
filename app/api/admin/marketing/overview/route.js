import { marketingOverview } from "@/lib/marketingCampaigns";
import { marketingRoute } from "@/lib/marketingCampaigns/adminAuth";

// GET ?days=30&refresh=0|1 -> cross-campaign totals, per-campaign rows and a per-day trend (aggregates only)
export const GET = marketingRoute(async (request) => {
  const sp = new URL(request.url).searchParams;
  return marketingOverview({ days: sp.get("days") || 30, refresh: sp.get("refresh") === "1" });
});
