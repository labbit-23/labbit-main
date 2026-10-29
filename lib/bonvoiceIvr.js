// Bonvoice's DTMF field is a comma-separated journey through nested menus.
// Keep this parser pure so the webhook's side effects stay small and the
// PBX menu contract can be tested independently.

export function parseDtmfKeys(value) {
  return String(value || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

export function resolveBonvoiceJourney(value) {
  const keys = parseDtmfKeys(value);
  if (!keys.length) return { action: "no_input", terminal: true, keys };

  let menu = "main";
  let lastNavigation = null;

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];

    if (menu === "main") {
      if (key === "1") {
        menu = "whatsapp_confirmation";
        lastNavigation = "latest_report_menu";
        continue;
      }
      if (key === "2") return { action: "home_visit_callback_requested", terminal: true, keys };
      if (key === "3") return { action: "schedule_enquiry", terminal: true, keys };
      if (key === "4") {
        menu = "collection_centre";
        lastNavigation = "collection_centre_menu";
        continue;
      }
      if (key === "9") return { action: "cx_team_requested", terminal: true, keys };
      return { action: "invalid_dtmf", terminal: true, keys, invalid_key: key, menu };
    }

    if (menu === "whatsapp_confirmation") {
      if (key === "1") return { action: "send_latest_report", terminal: true, keys };
      if (key === "2") {
        menu = "no_whatsapp";
        lastNavigation = "no_whatsapp_prompt";
        continue;
      }
      if (key === "3") {
        menu = "main";
        lastNavigation = "back_to_main";
        continue;
      }
      if (key === "9") return { action: "report_dispatch_team_requested", terminal: true, keys };
      return { action: "invalid_dtmf", terminal: true, keys, invalid_key: key, menu };
    }

    if (menu === "no_whatsapp") {
      if (key === "1") {
        menu = "main";
        lastNavigation = "back_to_main";
        continue;
      }
      if (key === "9") return { action: "report_dispatch_team_requested", terminal: true, keys };
      return { action: "invalid_dtmf", terminal: true, keys, invalid_key: key, menu };
    }

    if (menu === "collection_centre") {
      if (key === "1") return { action: "collection_centre_sd_road", terminal: true, keys };
      if (key === "2") return { action: "collection_centre_marredpally", terminal: true, keys };
      if (key === "3") return { action: "collection_centre_yapral", terminal: true, keys };
      if (key === "4") {
        menu = "main";
        lastNavigation = "back_to_main";
        continue;
      }
      if (key === "9") return { action: "cx_team_requested", terminal: true, keys };
      return { action: "invalid_dtmf", terminal: true, keys, invalid_key: key, menu };
    }
  }

  const incompleteActions = {
    whatsapp_confirmation: "latest_report_menu_abandoned",
    no_whatsapp: "latest_report_no_whatsapp",
    collection_centre: "collection_centre_menu_abandoned",
  };
  return {
    action: incompleteActions[menu] || lastNavigation || "logged_only",
    terminal: false,
    keys,
    menu,
  };
}

