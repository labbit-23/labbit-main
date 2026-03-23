import { NextResponse } from "next/server";
import { fetchInactivePatients } from "@/lib/campaigns/shivam";
import { canManageCampaigns, getCampaignSessionUser } from "../_shared";

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
    return NextResponse.json(patients, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch campaign patients" },
      { status: 500 }
    );
  }
}

