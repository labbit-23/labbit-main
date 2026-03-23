import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { toCanonicalIndiaPhone } from "@/lib/phone";
import { fetchInactivePatients } from "@/lib/campaigns/shivam";
import { sendCampaignTemplate } from "@/lib/campaigns/whatsapp";
import {
  canManageCampaigns,
  getCampaignSessionUser,
  resolveLabIdForUser
} from "../_shared";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeName(name) {
  const trimmed = String(name || "").trim();
  return trimmed || "Patient";
}

export async function POST(request) {
  try {
    const user = await getCampaignSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageCampaigns(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const campaignId = String(body?.campaign_id || "").trim();
    if (!campaignId) {
      return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, name, segment_type, date, status")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const labId = await resolveLabIdForUser(user);

    const { error: markRunningError } = await supabase
      .from("campaigns")
      .update({ status: "running" })
      .eq("id", campaign.id);
    if (markRunningError) throw markRunningError;

    const patients = await fetchInactivePatients({ inactiveSince: campaign.date });
    const uniqueByPhone = new Map();
    for (const row of patients || []) {
      const mobile = toCanonicalIndiaPhone(row?.mobile);
      if (!mobile) continue;
      if (!uniqueByPhone.has(mobile)) {
        uniqueByPhone.set(mobile, {
          mobile,
          name: safeName(row?.name)
        });
      }
    }
    const recipients = [...uniqueByPhone.values()];

    await supabase.from("campaign_recipients").delete().eq("campaign_id", campaign.id);

    if (recipients.length > 0) {
      const seedRows = recipients.map((row) => ({
        campaign_id: campaign.id,
        mobile: row.mobile,
        mrno: null,
        status: "pending",
        sent_at: null
      }));
      const { error: seedError } = await supabase.from("campaign_recipients").insert(seedRows);
      if (seedError) throw seedError;
    }

    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      try {
        await sendCampaignTemplate({
          labId,
          phone: recipient.mobile,
          templateName: "trend_campaign_v1",
          templateParams: [recipient.name],
          sender: {
            id: user.id,
            name: user.name || "Campaign Admin",
            role: (user.executiveType || user.userType || "admin").toString().toLowerCase(),
            userType: user.userType || "executive"
          }
        });

        const { error: markSentError } = await supabase
          .from("campaign_recipients")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("campaign_id", campaign.id)
          .eq("mobile", recipient.mobile);
        if (markSentError) {
          console.error("[campaign-run] mark sent failed", {
            campaignId: campaign.id,
            mobile: recipient.mobile,
            error: markSentError.message
          });
        }
        sent += 1;
      } catch (sendError) {
        failed += 1;
        console.error("[campaign-run] send failed", {
          campaignId: campaign.id,
          mobile: recipient.mobile,
          error: sendError?.message || String(sendError)
        });
        const { error: markFailedError } = await supabase
          .from("campaign_recipients")
          .update({ status: "failed", sent_at: null })
          .eq("campaign_id", campaign.id)
          .eq("mobile", recipient.mobile);
        if (markFailedError) {
          console.error("[campaign-run] mark failed status failed", {
            campaignId: campaign.id,
            mobile: recipient.mobile,
            error: markFailedError.message
          });
        }
      }

      await sleep(200);
    }

    const { error: markCompleteError } = await supabase
      .from("campaigns")
      .update({ status: "completed" })
      .eq("id", campaign.id);
    if (markCompleteError) throw markCompleteError;

    return NextResponse.json(
      {
        ok: true,
        campaign_id: campaign.id,
        recipients: recipients.length,
        sent,
        failed
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to run campaign" },
      { status: 500 }
    );
  }
}
