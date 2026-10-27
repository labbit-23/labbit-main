import { fetchAudienceSummary } from "@/lib/marketingCampaigns/audienceClient";
import { marketingRoute, readJson } from "@/lib/marketingCampaigns/adminAuth";
import { getSegment } from "@/lib/marketingCampaigns/store";

// POST { filter:{...} } or { segment_id } -> labit-core aggregates (funnel, breakdowns, cost estimate, anonymised sample). Never rows or identifiers.
export const POST = marketingRoute(async (request) => {
  const body = await readJson(request);
  let filter = body.filter;
  if (body.segment_id) {
    const seg = await getSegment(body.segment_id);
    if (!seg) return { ok: false, error: "Segment not found" };
    filter = seg.filter;
  }
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return { ok: false, error: "Provide filter (object) or segment_id" };
  return { ok: true, summary: await fetchAudienceSummary(filter) };
});
