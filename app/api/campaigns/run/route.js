import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { toCanonicalIndiaPhone } from "@/lib/phone";
import { fetchInactivePatients } from "@/lib/campaigns/shivam";
import { sendCampaignTemplate } from "@/lib/campaigns/whatsapp";
import { getTrendReportUrl } from "@/lib/neosoft/client";
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

function buildBookingLink({ mobile, mrno }) {
  const base = String(process.env.CAMPAIGN_BOOKING_LINK_BASE_URL || "").trim();
  if (!base) return "";
  try {
    const url = new URL(base);
    if (mobile) url.searchParams.set("phone", String(mobile).replace(/\D/g, "").slice(-10));
    if (mrno) url.searchParams.set("mrno", String(mrno).trim());
    return url.toString();
  } catch {
    return base;
  }
}

function normalizeCheckupDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function getCampaignTemplateSettings() {
  const templateName = String(process.env.CAMPAIGN_TEMPLATE_NAME || "trend_campaign_v1").trim();
  const keysRaw = String(process.env.CAMPAIGN_TEMPLATE_PARAM_KEYS || "name").trim();
  const keys = keysRaw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return { templateName, keys: keys.length > 0 ? keys : ["name"] };
}

function buildTemplateParams(recipient, keys) {
  const tokenMap = {
    name: safeName(recipient?.name),
    mobile: String(recipient?.mobile || "").replace(/\D/g, "").slice(-10),
    mrno: String(recipient?.mrno || "").trim(),
    last_health_checkup: normalizeCheckupDate(recipient?.last_health_checkup),
    trend_link: recipient?.trend_link || "",
    booking_link: recipient?.booking_link || ""
  };

  return keys.map((key) => String(tokenMap[key] || "")).filter((value) => value !== "");
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
        const mrno = String(row?.mrno || "").trim() || null;
        uniqueByPhone.set(mobile, {
          mobile,
          name: safeName(row?.name),
          mrno,
          last_health_checkup: row?.last_health_checkup || null,
          trend_link: mrno ? getTrendReportUrl(mrno) : "",
          booking_link: buildBookingLink({ mobile, mrno })
        });
      }
    }
    const recipients = [...uniqueByPhone.values()];
    const templateSettings = getCampaignTemplateSettings();

    await supabase.from("campaign_recipients").delete().eq("campaign_id", campaign.id);

    if (recipients.length > 0) {
      const seedRows = recipients.map((row) => ({
        campaign_id: campaign.id,
        mobile: row.mobile,
        mrno: row.mrno || null,
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
          templateName: templateSettings.templateName,
          templateParams: buildTemplateParams(recipient, templateSettings.keys),
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
        recipients_with_mrno: recipients.filter((row) => row.mrno).length,
        sent,
        failed,
        template: {
          name: templateSettings.templateName,
          param_keys: templateSettings.keys
        }
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
