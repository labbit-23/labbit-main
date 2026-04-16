import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import {
  canManageCampaigns,
  getCampaignSessionUser,
  resolveLabIdForUser
} from "../_shared";

function parseTemplates(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? raw : {};
}

function toTemplateCatalog(templates) {
  const parsed = parseTemplates(templates);
  const registry = parsed?.templates && typeof parsed.templates === "object" ? parsed.templates : {};

  const rows = Object.entries(registry)
    .map(([key, value]) => {
      const item = value && typeof value === "object" ? value : {};
      const templateName = String(item?.template_name || key || "").trim();
      if (!templateName) return null;

      const params = Array.isArray(item?.params)
        ? item.params
            .map((param, index) => {
              const row = param && typeof param === "object" ? param : {};
              const field = String(row?.field || row?.source_field || "").trim();
              if (!field) return null;
              return {
                name: String(row?.name || `p${index + 1}`).trim() || `p${index + 1}`,
                field,
                required: row?.required === undefined ? true : Boolean(row.required),
                transform: String(row?.transform || "").trim() || null
              };
            })
            .filter(Boolean)
        : [];

      if (params.length === 0) return null;

      return {
        key: String(key || templateName).trim(),
        template_name: templateName,
        language: String(item?.language || parsed?.default_language || "en").trim() || "en",
        params,
        params_order: params.map((param) => param.field)
      };
    })
    .filter(Boolean);

  return {
    default_template: String(parsed?.default_template || "").trim() || null,
    templates: rows
  };
}

export async function GET(request) {
  try {
    const user = await getCampaignSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageCampaigns(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const labId = await resolveLabIdForUser(user);

    const [{ data: campaigns, error: campaignsError }, { data: marketingConfig, error: marketingError }] =
      await Promise.all([
        supabase
          .from("campaigns")
          .select("id, name, segment_type, date, status, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("labs_apis")
          .select("templates")
          .eq("lab_id", labId)
          .eq("api_name", "whatsapp_marketing")
          .single()
      ]);

    if (campaignsError) throw campaignsError;
    if (marketingError) throw marketingError;

    const catalog = toTemplateCatalog(marketingConfig?.templates);
    return NextResponse.json(
      {
        campaigns: campaigns || [],
        template_catalog: catalog.templates,
        default_template:
          catalog.default_template ||
          String(catalog.templates?.[0]?.template_name || "").trim() ||
          null
      },
      { status: 200 }
    );
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
