import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseWhatsappInbox(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

function parseTemplates(templates) {
  if (!templates) return {};
  if (typeof templates === "string") {
    try {
      return JSON.parse(templates);
    } catch {
      return {};
    }
  }
  return typeof templates === "object" ? templates : {};
}

function defaultSettings() {
  return {
    shortcuts: [
      {
        key: "/r",
        label: "Report reply",
        type: "template",
        message:
          "Please find your report attached. If you need any clarification, reply here and our team will help you."
      },
      {
        key: "/hv",
        label: "Home visit bot flow",
        type: "handover",
        flow: "home_visit"
      },
      {
        key: "/menu",
        label: "Main menu bot flow",
        type: "handover",
        flow: "main_menu"
      },
      {
        key: "/reports",
        label: "Report bot flow",
        type: "handover",
        flow: "reports"
      }
    ]
  };
}

function sanitizeSettings(input) {
  const defaults = defaultSettings();
  const rawShortcuts = Array.isArray(input?.shortcuts) ? input.shortcuts : defaults.shortcuts;

  const shortcuts = rawShortcuts
    .map((item) => ({
      key: String(item?.key || "").trim().toLowerCase(),
      label: String(item?.label || "").trim(),
      type: String(item?.type || "").trim().toLowerCase(),
      message: String(item?.message || "").trim(),
      flow: String(item?.flow || "").trim().toLowerCase()
    }))
    .filter((item) => item.key.startsWith("/") && (item.type === "template" || item.type === "handover"))
    .slice(0, 20)
    .map((item) => {
      if (item.type === "template") {
        return {
          key: item.key,
          label: item.label || item.key,
          type: "template",
          message: item.message
        };
      }
      return {
        key: item.key,
        label: item.label || item.key,
        type: "handover",
        flow: ["home_visit", "reports", "main_menu"].includes(item.flow) ? item.flow : "main_menu"
      };
    });

  return {
    shortcuts: shortcuts.length > 0 ? shortcuts : defaults.shortcuts
  };
}

async function getWhatsappOutboundConfig(labId) {
  const { data, error } = await supabase
    .from("labs_apis")
    .select("id, templates")
    .eq("lab_id", labId)
    .eq("api_name", "whatsapp_outbound")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function GET(request) {
  const response = NextResponse.next();

  try {
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;
    if (!user || !canUseWhatsappInbox(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const labId = Array.isArray(user.labIds) ? user.labIds.find(Boolean) : null;
    if (!labId) {
      return NextResponse.json({ error: "No lab access found" }, { status: 400 });
    }

    const config = await getWhatsappOutboundConfig(labId);
    const templates = parseTemplates(config?.templates);
    const settings = sanitizeSettings(templates?.chat_console_settings || defaultSettings());

    return NextResponse.json({ settings });
  } catch (err) {
    console.error("[whatsapp/settings][GET] error", err);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function POST(request) {
  const response = NextResponse.next();

  try {
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;
    if (!user || !canUseWhatsappInbox(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const labId = Array.isArray(user.labIds) ? user.labIds.find(Boolean) : null;
    if (!labId) {
      return NextResponse.json({ error: "No lab access found" }, { status: 400 });
    }

    const body = await request.json();
    const settings = sanitizeSettings(body?.settings || {});

    const config = await getWhatsappOutboundConfig(labId);
    if (!config?.id) {
      return NextResponse.json(
        { error: "whatsapp_outbound config missing. Please configure WhatsApp API first." },
        { status: 400 }
      );
    }

    const templates = parseTemplates(config.templates);
    const nextTemplates = {
      ...templates,
      chat_console_settings: settings
    };

    const { error: updateError } = await supabase
      .from("labs_apis")
      .update({ templates: nextTemplates })
      .eq("id", config.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    console.error("[whatsapp/settings][POST] error", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}

