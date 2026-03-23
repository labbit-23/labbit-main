import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { canManageCampaigns, getCampaignSessionUser } from "../_shared";

export async function GET(request) {
  try {
    const user = await getCampaignSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageCampaigns(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await supabase
      .from("campaigns")
      .select("id, name, segment_type, date, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    return NextResponse.json({ campaigns: data || [] }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to load campaigns" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const user = await getCampaignSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageCampaigns(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const name = String(body?.name || "").trim();
    const segmentType = String(body?.segment_type || "").trim();
    const campaignDate = String(body?.date || "").trim();

    if (!name || !segmentType || !campaignDate) {
      return NextResponse.json(
        { error: "name, segment_type and date are required" },
        { status: 400 }
      );
    }

    const payload = {
      name,
      segment_type: segmentType,
      date: campaignDate,
      status: "draft"
    };

    const { data, error } = await supabase
      .from("campaigns")
      .insert(payload)
      .select("id, name, segment_type, date, status, created_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ campaign: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to create campaign" },
      { status: 500 }
    );
  }
}

