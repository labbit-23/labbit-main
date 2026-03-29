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

function defaultBotFlowTemplates() {
  return {
    report_notify_number: "",
    feedback_url: "",
    bot_flow: {
      texts: {
        report_request_ack: "Thank you. Our team will verify and send your report shortly.",
        wait_for_executive_text: "Thanks for your message. Please wait, our executive will reach out to help you shortly.",
        handoff_open_text: "Connecting you to our executive. Please wait...",
        handoff_closed_text: "Our executives are currently offline. Reply YES to request a callback on the next working day.",
        booking_submitted_ack: "Your booking request has been received. Our team will contact you shortly.",
        booking_submitted_failed: "We could not submit your booking right now. Our team will contact you shortly.",
        booking_date_invalid: "Please choose a date from menu or type in DD-MM-YYYY format.",
        booking_slot_invalid: "Please choose a valid time slot from the menu.",
        booking_location_text_prompt: "Please enter your area/location.",
        feedback_redirect_text: "We value your feedback. Please share it here.",
        thank_you_feedback_text: "You’re welcome. We’d love your feedback:",
        lab_timings_text: "Mon-Sat: 7:00 AM - 8:00 PM\nSunday: 7:00 AM - 2:00 PM"
      },
      links: {
        feedback_url: ""
      },
      agent_hours: {
        open: "07:00",
        close: "21:00",
        days: ["mon", "tue", "wed", "thu", "fri", "sat"]
      },
      team_notify: {
        webhook_url: ""
      },
      report_notify_number: ""
    },
    whatsapp_menus: {
      main_menu: {
        body_text: "Welcome to SDRC Lab.\n\nHow can we assist you today?",
        buttons: [
          { id: "REQUEST_REPORTS", title: "Request Reports" },
          { id: "BOOK_HOME_VISIT", title: "Book Home Visit" },
          { id: "MORE_SERVICES", title: "More Services" }
        ]
      },
      more_services: {
        body_text: "More Services",
        button_text: "View Services",
        section_title: "Customer Support",
        rows: [
          { id: "TALK_EXECUTIVE", title: "Talk to Executive" },
          { id: "LAB_TIMINGS", title: "Lab Timings" },
          { id: "SEND_LOCATION", title: "Send Lab Location" },
          { id: "DOWNLOAD_TREND_REPORTS", title: "View Trend Report" },
          { id: "EXPLORE_PACKAGES", title: "Explore Packages" },
          { id: "FEEDBACK", title: "Feedback" }
        ]
      },
      location_options: {
        body_text: "What would you like to receive about our lab location?",
        button_text: "Choose Option",
        section_title: "Location Details",
        rows: [
          { id: "SHARE_LOCATION_PIN", title: "Main Location" },
          { id: "SHARE_BRANCH_LOCATIONS", title: "Other Branches" }
        ]
      },
      branch_locations: {
        body_text: "Please choose a branch location.",
        button_text: "Select Branch",
        section_title: "Branches",
        rows: []
      }
    }
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

    const config = await getWhatsappOutboundConfig(labId);
    if (!config?.id) {
      return NextResponse.json(
        { error: "whatsapp_outbound config missing. Please configure WhatsApp API first." },
        { status: 400 }
      );
    }

    const templates = parseTemplates(config.templates);
    let nextTemplates = templates;
    let settings = sanitizeSettings(templates?.chat_console_settings || defaultSettings());

    if (body?.action === "seed_bot_flow") {
      const defaults = defaultBotFlowTemplates();
      nextTemplates = {
        ...templates,
        report_notify_number: templates?.report_notify_number ?? defaults.report_notify_number,
        feedback_url: templates?.feedback_url ?? defaults.feedback_url,
        bot_flow: {
          ...defaults.bot_flow,
          ...(templates?.bot_flow || {}),
          texts: {
            ...defaults.bot_flow.texts,
            ...(templates?.bot_flow?.texts || {}),
          },
          links: {
            ...defaults.bot_flow.links,
            ...(templates?.bot_flow?.links || {}),
          },
          agent_hours: {
            ...defaults.bot_flow.agent_hours,
            ...(templates?.bot_flow?.agent_hours || {}),
          },
          team_notify: {
            ...defaults.bot_flow.team_notify,
            ...(templates?.bot_flow?.team_notify || {}),
          },
        },
        whatsapp_menus: {
          ...defaults.whatsapp_menus,
          ...(templates?.whatsapp_menus || {}),
        },
      };
    } else {
      settings = sanitizeSettings(body?.settings || {});
      nextTemplates = {
        ...templates,
        chat_console_settings: settings
      };
    }

    const { error: updateError } = await supabase
      .from("labs_apis")
      .update({ templates: nextTemplates })
      .eq("id", config.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ ok: true, settings, templates: nextTemplates });
  } catch (err) {
    console.error("[whatsapp/settings][POST] error", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
