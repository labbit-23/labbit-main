import { marketingRoute, readJson } from "@/lib/marketingCampaigns/adminAuth";
import { archiveSegment, getSegment, saveSegment, writeMarketingAudit } from "@/lib/marketingCampaigns/store";

export const GET = marketingRoute(async (_req, { params }) => {
  const segment = await getSegment(params.id);
  return segment ? { ok: true, segment } : { ok: false, error: "Segment not found" };
});

// PUT { name, filter, notes? } (campaigns already created keep their own filter snapshot)
export const PUT = marketingRoute(async (request, { actor, params }) => {
  const r = await saveSegment({ id: params.id, input: await readJson(request), actor });
  if (r.ok) await writeMarketingAudit({ actor, action: "segment.update", details: { segment_id: params.id } });
  return r;
});

// DELETE archives (soft); existing campaigns are unaffected.
export const DELETE = marketingRoute(async (_req, { actor, params }) => {
  const r = await archiveSegment(params.id);
  await writeMarketingAudit({ actor, action: "segment.archive", details: { segment_id: params.id } });
  return r;
});
