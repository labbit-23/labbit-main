import { marketingRoute, readJson } from "@/lib/marketingCampaigns/adminAuth";
import { listSegments, saveSegment, writeMarketingAudit } from "@/lib/marketingCampaigns/store";

export const GET = marketingRoute(async () => ({ ok: true, segments: await listSegments() }));

// POST { name, filter:{...}, notes? }
export const POST = marketingRoute(async (request, { actor }) => {
  const r = await saveSegment({ input: await readJson(request), actor });
  if (r.ok) await writeMarketingAudit({ actor, action: "segment.create", details: { segment_id: r.segment.id, segment_name: r.segment.name } });
  return r;
});
