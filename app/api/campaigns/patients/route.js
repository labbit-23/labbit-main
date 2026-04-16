import { NextResponse } from "next/server";
import { fetchCampaignPatients } from "@/lib/campaigns/shivam";
import { getTrendReportUrl } from "@/lib/neosoft/client";
import { supabase } from "@/lib/supabaseServer";
import {
  canManageCampaigns,
  getCampaignSessionUser,
  resolveLabIdForUser
} from "../_shared";
import {
  inspectRecipientTemplateParams,
  resolveCampaignTemplateSettings
} from "@/lib/campaigns/whatsapp";

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

export async function GET(request) {
  try {
    const user = await getCampaignSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageCampaigns(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const inactiveSince = String(searchParams.get("inactive_since") || "").trim();
    const segmentType = String(searchParams.get("segment_type") || "inactive_patients").trim();
    const locationId = String(searchParams.get("location_id") || "").trim() || null;
    const campaignId = String(searchParams.get("campaign_id") || "").trim();
    const templateName = String(searchParams.get("template_name") || "").trim();
    let resolvedInactiveSince = inactiveSince;
    let resolvedSegmentType = segmentType;

    if (campaignId) {
      const { data: campaign, error: campaignError } = await supabase
        .from("campaigns")
        .select("id, date, segment_type")
        .eq("id", campaignId)
        .single();
      if (campaignError || !campaign) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }
      resolvedInactiveSince = String(campaign?.date || "").trim();
      resolvedSegmentType = String(campaign?.segment_type || "").trim() || resolvedSegmentType;
    }

    const labId = await resolveLabIdForUser(user);
    const templateSettings = await resolveCampaignTemplateSettings({
      labId,
      templateName
    });

    const patients = await fetchCampaignPatients({
      labId,
      segmentType: resolvedSegmentType,
      inactiveSince: resolvedInactiveSince,
      cutoffDate: resolvedInactiveSince,
      locationId,
      newCentreStartDate:
        String(process.env.CAMPAIGN_NEW_CENTRE_START_DATE || "2025-04-20").trim()
    });
    const enriched = (patients || []).map((row) => {
      const mrno = String(row?.mrno || "").trim();
      const mobile = String(row?.mobile || "").trim();
      return {
        ...row,
        last_health_checkup_formatted: normalizeCheckupDate(row?.last_health_checkup),
        contact_number:
          String(row?.contact_number || "").trim() ||
          String(process.env.CAMPAIGN_CONTACT_NUMBER || "").trim() ||
          null,
        trend_link: mrno ? getTrendReportUrl(mrno) : "",
        booking_link: buildBookingLink({ mobile, mrno: mrno || null })
      };
    });

    const checks = enriched.map((recipient) => {
      const inspected = inspectRecipientTemplateParams({
        recipient,
        templateSettings
      });
      return {
        recipient,
        inspected
      };
    });

    const passing = checks.filter((row) => row.inspected.ok);
    const failing = checks.filter((row) => !row.inspected.ok);

    const missingCounter = new Map();
    for (const row of failing) {
      for (const miss of row.inspected.missing || []) {
        const key = String(miss?.field || miss?.name || "unknown").trim();
        if (!key) continue;
        missingCounter.set(key, (missingCounter.get(key) || 0) + 1);
      }
    }

    const missingFields = [...missingCounter.entries()]
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count);

    const sampleFailures = failing.slice(0, 25).map((row) => ({
      name: row.recipient?.name || null,
      mobile: row.recipient?.mobile || null,
      missing_fields: (row.inspected.missing || []).map((item) => item.field || item.name)
    }));

    return NextResponse.json(
      {
        ok: true,
        template: {
          key: templateSettings.templateKey,
          name: templateSettings.templateName,
          language: templateSettings.languageCode
        },
        totals: {
          recipients: checks.length,
          eligible: passing.length,
          blocked: failing.length
        },
        missing_fields: missingFields,
        sample_failures: sampleFailures
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch campaign patients" },
      { status: 500 }
    );
  }
}
