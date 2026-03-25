import { NextResponse } from "next/server";
import { fetchInactivePatients } from "@/lib/campaigns/shivam";
import { getTrendReportUrl } from "@/lib/neosoft/client";
import { canManageCampaigns, getCampaignSessionUser } from "../_shared";

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

    const patients = await fetchInactivePatients({ inactiveSince });
    const enriched = (patients || []).map((row) => {
      const mrno = String(row?.mrno || "").trim();
      const mobile = String(row?.mobile || "").trim();
      return {
        ...row,
        trend_link: mrno ? getTrendReportUrl(mrno) : "",
        booking_link: buildBookingLink({ mobile, mrno: mrno || null })
      };
    });

    return NextResponse.json(enriched, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch campaign patients" },
      { status: 500 }
    );
  }
}
