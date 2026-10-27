import { marketingRoute } from "@/lib/marketingCampaigns/adminAuth";
import { TEMPLATES } from "@/lib/marketingCampaigns/templateRegistry";

// GET -> { ok, templates:[...] } straight from the registry (draft ones included, flagged by status; only approved can start a campaign).
export const GET = marketingRoute(async () => ({ ok: true, templates: TEMPLATES }));
