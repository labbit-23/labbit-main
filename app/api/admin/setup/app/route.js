import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import {
  canManageSetup,
  getSessionUserAndLab,
  getWhatsappOutboundConfig,
  parseMaybeJson
} from "../_shared";

function defaultAppSetup() {
  return {
    features: {
      auto_dispatch_enabled: true,
      auto_dispatch_paused_default: true,
      report_dispatch_monitor_enabled: true,
      whatsapp_inbox_enabled: true,
      whatsapp_bot_enabled: true,
      cto_dashboard_enabled: true,
      booking_requests_enabled: true,
      quickbook_enabled: true
    },
    docs: {
      lookback_hours: 24,
      cooloff_lab_minutes: 30,
      cooloff_radiology_minutes: 10
    }
  };
}

export async function GET(request) {
  const response = NextResponse.next();
  try {
    const { user, labId } = await getSessionUserAndLab(request, response);
    if (!user || !canManageSetup(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!labId) return NextResponse.json({ error: "No lab access found" }, { status: 400 });

    const config = await getWhatsappOutboundConfig(labId);
    const templates = parseMaybeJson(config?.templates);
    const defaults = defaultAppSetup();
    const setup = {
      ...defaults,
      ...(typeof templates?.app_setup === "object" ? templates.app_setup : {}),
      features: {
        ...defaults.features,
        ...(templates?.app_setup?.features || {})
      },
      docs: {
        ...defaults.docs,
        ...(templates?.app_setup?.docs || {})
      }
    };
    return NextResponse.json({ ok: true, setup });
  } catch (error) {
    console.error("[admin/setup/app][GET] error", error);
    return NextResponse.json({ error: "Failed to load app setup" }, { status: 500 });
  }
}

export async function POST(request) {
  const response = NextResponse.next();
  try {
    const { user, labId } = await getSessionUserAndLab(request, response);
    if (!user || !canManageSetup(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!labId) return NextResponse.json({ error: "No lab access found" }, { status: 400 });

    const body = await request.json();
    const incoming = typeof body?.setup === "object" && body.setup ? body.setup : {};

    const config = await getWhatsappOutboundConfig(labId);
    if (!config?.id) return NextResponse.json({ error: "whatsapp_outbound config missing for lab" }, { status: 400 });
    const templates = parseMaybeJson(config.templates);
    const defaults = defaultAppSetup();

    const nextSetup = {
      ...defaults,
      ...(typeof incoming === "object" ? incoming : {}),
      features: {
        ...defaults.features,
        ...(incoming?.features || {})
      },
      docs: {
        ...defaults.docs,
        ...(incoming?.docs || {})
      }
    };

    const nextTemplates = {
      ...templates,
      app_setup: nextSetup
    };

    const { error } = await supabase.from("labs_apis").update({ templates: nextTemplates }).eq("id", config.id);
    if (error) throw error;
    return NextResponse.json({ ok: true, setup: nextSetup });
  } catch (error) {
    console.error("[admin/setup/app][POST] error", error);
    return NextResponse.json({ error: "Failed to save app setup" }, { status: 500 });
  }
}

