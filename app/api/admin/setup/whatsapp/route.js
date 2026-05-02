import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import {
  canManageSetup,
  getSessionUserAndLab,
  getWhatsappOutboundConfig,
  parseMaybeJson
} from "../_shared";

function defaultWhatsappSetup(config = null) {
  const templates = parseMaybeJson(config?.templates);
  const chat = templates?.chat_console_settings || {};
  const apiBase = String(config?.base_url || "").trim();
  return {
    api_base_url: apiBase,
    internal_send_url:
      String(templates?.whatsapp_setup?.internal_send_url || process.env.NEXT_PUBLIC_WHATSAPP_INTERNAL_SEND_URL || "").trim(),
    report_template_name:
      String(chat?.report_send_template_name || templates?.whatsapp_setup?.report_template_name || "report_pdf").trim(),
    report_template_language:
      String(chat?.report_send_template_language || templates?.whatsapp_setup?.report_template_language || "en").trim(),
    source_service:
      String(templates?.whatsapp_setup?.source_service || "report_sender_worker").trim(),
    lab_id: String(config?.lab_id || "").trim(),
    report_status_reqno_url: `${apiBase.replace(/\/$/, "")}/report-status/{reqno}`,
    requisitions_by_date_url:
      String(templates?.whatsapp_setup?.requisitions_by_date_url || `${apiBase.replace(/\/$/, "")}/delivery/requisitions-by-date/{date}`).trim()
  };
}

export async function GET(request) {
  const response = NextResponse.next();
  try {
    const { user, labId } = await getSessionUserAndLab(request, response);
    if (!user || !canManageSetup(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!labId) return NextResponse.json({ error: "No lab access found" }, { status: 400 });

    const config = await getWhatsappOutboundConfig(labId);
    const setup = defaultWhatsappSetup(config);
    return NextResponse.json({ ok: true, setup });
  } catch (error) {
    console.error("[admin/setup/whatsapp][GET] error", error);
    return NextResponse.json({ error: "Failed to load WhatsApp setup" }, { status: 500 });
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
    if (!config?.id) {
      return NextResponse.json({ error: "whatsapp_outbound config missing for lab" }, { status: 400 });
    }
    const templates = parseMaybeJson(config.templates);
    const nextSetup = {
      ...defaultWhatsappSetup(config),
      api_base_url: String(incoming.api_base_url || "").trim() || String(config.base_url || "").trim(),
      internal_send_url: String(incoming.internal_send_url || "").trim(),
      report_template_name: String(incoming.report_template_name || "report_pdf").trim(),
      report_template_language: String(incoming.report_template_language || "en").trim(),
      source_service: String(incoming.source_service || "report_sender_worker").trim(),
      lab_id: String(incoming.lab_id || config.lab_id || "").trim(),
      report_status_reqno_url: String(incoming.report_status_reqno_url || "").trim(),
      requisitions_by_date_url: String(incoming.requisitions_by_date_url || "").trim()
    };

    const nextTemplates = {
      ...templates,
      whatsapp_setup: nextSetup,
      chat_console_settings: {
        ...(templates?.chat_console_settings || {}),
        report_send_template_name: nextSetup.report_template_name,
        report_send_template_language: nextSetup.report_template_language
      }
    };

    const { error } = await supabase.from("labs_apis").update({ templates: nextTemplates }).eq("id", config.id);
    if (error) throw error;
    return NextResponse.json({ ok: true, setup: nextSetup });
  } catch (error) {
    console.error("[admin/setup/whatsapp][POST] error", error);
    return NextResponse.json({ error: "Failed to save WhatsApp setup" }, { status: 500 });
  }
}

