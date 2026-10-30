import { dryRunDiff, prepareCampaign, resumeCampaign, scheduleCampaign, sendBatch, stopCampaign, testSend } from "@/lib/marketingCampaigns";
import { marketingRoute, readJson } from "@/lib/marketingCampaigns/adminAuth";
import { hasSuccessfulTest, writeMarketingAudit } from "@/lib/marketingCampaigns/store";

// POST { action, ... }
//   prepare   { dry_run=true, pilot_size?, expand? }  dry_run:false stores recipients; expand adds the rest of the audience after a pilot
//   diff                                              counts only: what a re-prepare would add/remove vs stored recipients
//   test      { numbers?, recipient? }                only numbers on the MARKETING_TEST_NUMBERS allowlist (default: all of them)
//   send      { batch_size? }                         one capped batch (hard caps, window, circuit breaker, opt-out apply)
//   stop | resume
//   schedule  { send_after: ISO | null }              needs a prepared campaign; null clears. Sent by the due runner (see run-due)
export const POST = marketingRoute(async (request, { actor, params }) => {
  const body = await readJson(request);
  const action = String(body.action || "").trim();
  const campaignId = params.id;
  // The lab is fixed by the server: a request body can never point a send at another lab's WhatsApp credentials.
  const labId = String(process.env.DEFAULT_LAB_ID || "").trim();
  let r;
  let details = {};
  if (action === "prepare") {
    const dry = body.dry_run !== false;
    r = await prepareCampaign({ campaignId, dryRun: dry, pilotSize: body.pilot_size ?? null, expand: body.expand === true });
    details = { dry_run: dry, pilot_size: body.pilot_size ?? null, expand: body.expand === true, eligible: r.stats?.eligible };
    if (dry) return r; // dry runs write nothing: no audit row
  } else if (action === "diff") {
    return dryRunDiff({ campaignId });
  } else if (action === "test") {
    r = await testSend({ labId, campaignId, numbers: body.numbers, recipient: body.recipient, allowlist: process.env.MARKETING_TEST_NUMBERS || "" });
    details = { numbers_count: Array.isArray(r.results) ? r.results.length : 0, delivered_ok: Array.isArray(r.results) ? r.results.filter((x) => x.ok).length : 0 };
    // "Test done" (which unlocks pilot, send and schedule) means at least one real message went out, not merely that the call returned.
    if (r.ok !== false && !details.delivered_ok) r = { ...r, ok: false, error: r.error || "No test message was sent. Check the results below." };
  } else if (action === "send") {
    if (!(await hasSuccessfulTest(campaignId))) return { ok: false, error: "Send a successful test message to a staff number first." };
    r = await sendBatch({ labId, campaignId, batchSize: body.batch_size });
    details = { batch_size: body.batch_size ?? null, sent: r.sent, failed: r.failed, skipped: r.skipped, stopped_reason: r.stopped_reason || null };
  } else if (action === "stop") r = await stopCampaign({ campaignId });
  else if (action === "resume") r = await resumeCampaign({ campaignId });
  else if (action === "schedule") {
    if (body.send_after && !(await hasSuccessfulTest(campaignId))) return { ok: false, error: "Send a successful test message to a staff number first." };
    r = await scheduleCampaign({ campaignId, sendAfter: body.send_after });
    details = { send_after: r.send_after ?? null };
  } else return { ok: false, error: `Unknown action: ${action}` };
  await writeMarketingAudit({ actor, action: `campaign.${action}`, campaignId, details: { ...details, ok: r?.ok !== false, error: r?.error || null } });
  return r;
});
