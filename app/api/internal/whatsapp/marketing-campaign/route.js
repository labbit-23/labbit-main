import { NextResponse } from "next/server";
import {
  campaignResults, createCampaign, prepareCampaign, recordOptOut, resumeCampaign, runDue, sendBatch, stopCampaign, testSend
} from "@/lib/marketingCampaigns";

// Marketing-campaign control (internal token, same as campaign-send). One POST { action, ... }:
//   create   { name, config }                       -> campaign_id
//   prepare  { campaign_id, dry_run=true }          -> counts, anonymised sample, cost estimate (dry_run:false stores recipients)
//   test     { campaign_id, numbers:[...] }         -> real template to staff numbers
//   send     { campaign_id, batch_size? }           -> one capped batch; call again while `more` is true
//   stop | resume { campaign_id }
//   due      {}                                     -> v3: one batch for every scheduled campaign whose send_after passed (call from an external scheduler)
//   optout   { phone }                              -> manual opt-out
// GET ?campaign_id=...&refresh=0|1                  -> results. Logic and limits live in lib/marketingCampaigns.

function getAuthToken(request) {
  return (
    request.headers.get("x-internal-token") ||
    request.headers.get("x-ingest-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
}

function authorized(request) {
  const expected = process.env.WHATSAPP_INTERNAL_SEND_TOKEN || process.env.WHATSAPP_EXTERNAL_INGEST_TOKEN || "";
  return Boolean(expected) && getAuthToken(request) === expected;
}

export async function POST(request) {
  try {
    if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const action = String(body?.action || "").trim();
    const labId = String(body?.lab_id || process.env.DEFAULT_LAB_ID || "").trim();
    const campaignId = String(body?.campaign_id || "").trim();
    if (action !== "create" && action !== "optout" && action !== "due" && !campaignId) return NextResponse.json({ error: "Missing campaign_id" }, { status: 400 });

    let result;
    if (action === "create") result = await createCampaign({ labId, name: body?.name, config: body?.config });
    else if (action === "prepare") result = await prepareCampaign({ campaignId, dryRun: body?.dry_run !== false });
    else if (action === "test") result = await testSend({ labId, campaignId, numbers: body?.numbers, recipient: body?.recipient });
    else if (action === "send") result = await sendBatch({ labId, campaignId, batchSize: body?.batch_size });
    else if (action === "stop") result = await stopCampaign({ campaignId });
    else if (action === "resume") result = await resumeCampaign({ campaignId });
    else if (action === "due") result = await runDue({ labId });
    else if (action === "optout") result = await recordOptOut(body?.phone, { source: "manual", reason: body?.reason || null });
    else return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    return NextResponse.json(result, { status: result?.ok === false ? 400 : 200 });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const campaignId = String(searchParams.get("campaign_id") || "").trim();
    if (!campaignId) return NextResponse.json({ error: "Missing campaign_id" }, { status: 400 });
    return NextResponse.json(await campaignResults({ campaignId, refresh: searchParams.get("refresh") !== "0" }));
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
}
