import { runDue } from "@/lib/marketingCampaigns";
import { marketingRoute } from "@/lib/marketingCampaigns/adminAuth";
import { writeMarketingAudit } from "@/lib/marketingCampaigns/store";

// POST -> sends one bounded batch for each scheduled campaign whose send_after has passed (inside the send window only).
// Nothing calls this automatically: staff trigger it here, or an external scheduler calls the internal route's `due` action.
export const POST = marketingRoute(async (_req, { actor }) => {
  const r = await runDue({ labId: String(process.env.DEFAULT_LAB_ID || "").trim() });
  if (r.due) await writeMarketingAudit({ actor, action: "campaign.run_due", details: { due: r.due, sent: r.results.reduce((n, x) => n + (x.sent || 0), 0) } });
  return r;
});
