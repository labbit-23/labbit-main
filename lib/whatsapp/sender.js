//lib/whatsapp/sender.js

import { supabase } from "@/lib/supabaseServer";

// --------------------------------------------------
// Fetch WhatsApp API Config Per Lab
// --------------------------------------------------
async function getWhatsappConfig(labId) {
  const { data, error } = await supabase
    .from("labs_apis")
    .select("base_url, auth_details, templates")
    .eq("lab_id", labId)
    .eq("api_name", "whatsapp_outbound")
    .single();

  if (error || !data) {
    throw new Error("WhatsApp API config not found for lab");
  }

  return data;
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

function getMenuConfig(templates) {
  const parsedTemplates = parseTemplates(templates);
  const menus = parsedTemplates.whatsapp_menus || {};

  return {
    mainMenu: {
      bodyText:
        menus?.main_menu?.body_text ||
        "Welcome to SDRC Lab 👋\n\nHow can we assist you today?",
      buttons:
        menus?.main_menu?.buttons ||
        [
          { id: "REQUEST_REPORTS", title: "🧾 Request Reports" },
          { id: "BOOK_HOME_VISIT", title: "🏠 Book Home Visit" },
          { id: "MORE_SERVICES", title: "➕ More Services" }
        ]
    },
    moreServicesMenu: {
      bodyText: menus?.more_services?.body_text || "More Services 👇",
      buttonText: menus?.more_services?.button_text || "View Services",
      sectionTitle: menus?.more_services?.section_title || "Customer Support",
      rows:
        menus?.more_services?.rows ||
        [
          { id: "TALK_EXECUTIVE", title: "👤 Talk to Executive" },
          { id: "LAB_TIMINGS", title: "🕒 Lab Timings" },
          { id: "SEND_LOCATION", title: "📍 Send Lab Location" },
          { id: "EXPLORE_PACKAGES", title: "🧪 Explore Packages" },
          { id: "FEEDBACK", title: "⭐ Feedback" }
        ]
    },
    locationOptionsMenu: {
      bodyText:
        menus?.location_options?.body_text ||
        "What would you like to receive about our lab location?",
      buttonText: menus?.location_options?.button_text || "Choose Option",
      sectionTitle: menus?.location_options?.section_title || "Location Details",
      rows:
        menus?.location_options?.rows ||
        [
          { id: "SHARE_LOCATION_PIN", title: "📍 Map Pin" },
          { id: "SHARE_ADDRESS", title: "🏢 Full Address" },
          { id: "SHARE_TIMINGS", title: "🕒 Lab Timings" },
          { id: "SHARE_BOTH", title: "📌 Address + Pin" },
          { id: "SHARE_BRANCH_LOCATIONS", title: "🏥 Other Branches" }
        ]
    },
    branchLocationsMenu: {
      bodyText:
        menus?.branch_locations?.body_text ||
        "Please choose a branch location.",
      buttonText: menus?.branch_locations?.button_text || "Select Branch",
      sectionTitle: menus?.branch_locations?.section_title || "Branches",
      rows:
        menus?.branch_locations?.rows ||
        [
          {
            id: "BRANCH_SD",
            title: "SD Branch",
            description: "Open in Google Maps",
            url: "https://maps.app.goo.gl/E3ymBXD1ptwAWTk6A"
          },
          {
            id: "BRANCH_MARREDPALLY",
            title: "Marredpally Branch",
            description: "Open in Google Maps",
            url: "https://maps.app.goo.gl/B9S59F16Rhvb3bFg8"
          },
          {
            id: "BRANCH_YAPRAL",
            title: "Yapral Branch",
            description: "Open in Google Maps",
            url: "https://maps.app.goo.gl/Yts1hfbMREEkVPQ77"
          }
        ]
    }
  };
}

function truncateTitle(value, max = 24) {
  const text = String(value || "").trim();
  if (!text) return "Option";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// --------------------------------------------------
// Generic Send Function
// --------------------------------------------------
async function sendWhatsApp({ labId, phone, payload, logText, sender = null }) {
  const apiConfig = await getWhatsappConfig(labId);

  const response = await fetch(apiConfig.base_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiConfig.auth_details.api_key
    },
    body: JSON.stringify(payload)
  });

  const rawText = await response.text();

  let result;
  try {
    result = rawText ? JSON.parse(rawText) : {};
  } catch {
    result = { raw: rawText };
  }

  // Log outbound message safely
  try {
    await supabase.from("whatsapp_messages").insert({
      lab_id: labId,
      phone,
      message: logText || JSON.stringify(payload),
      direction: response.ok ? "outbound" : "status",
      payload: {
        sender,
        request: payload,
        response: result
      }
    });
  } catch (logError) {
    console.error("Failed to log WhatsApp message:", logError);
  }

  if (!response.ok) {
    throw new Error(
      result?.message ||
      `WhatsApp failed: ${response.status} ${rawText}`
    );
  }

  return result;
}

// --------------------------------------------------
// TEXT MESSAGE
// --------------------------------------------------
export async function sendTextMessage({
  labId,
  phone,
  text,
  sender = null
}) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "text",
    text: {
      body: text
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: text,
    sender
  });
}

// --------------------------------------------------
// MAIN MENU (Buttons)
// --------------------------------------------------
export async function sendMainMenu({
  labId,
  phone
}) {
  const apiConfig = await getWhatsappConfig(labId);
  const menuConfig = getMenuConfig(apiConfig.templates);

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: menuConfig.mainMenu.bodyText
      },
      action: {
        buttons: menuConfig.mainMenu.buttons.slice(0, 3).map((button) => ({
          type: "reply",
          reply: {
            id: button.id,
            title: button.title
          }
        }))
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Main Menu Sent"
  });
}

// --------------------------------------------------
// MORE SERVICES (List)
// --------------------------------------------------
export async function sendMoreServicesMenu({
  labId,
  phone
}) {
  const apiConfig = await getWhatsappConfig(labId);
  const menuConfig = getMenuConfig(apiConfig.templates);

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: menuConfig.moreServicesMenu.bodyText
      },
      action: {
        button: menuConfig.moreServicesMenu.buttonText,
        sections: [
          {
            title: menuConfig.moreServicesMenu.sectionTitle,
            rows: menuConfig.moreServicesMenu.rows.slice(0, 10).map((row) => ({
              id: row.id,
              title: row.title,
              description: row.description || ""
            }))
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "More Services Menu Sent"
  });
}

// --------------------------------------------------
// LOCATION OPTIONS MENU
// --------------------------------------------------
export async function sendLocationOptionsMenu({
  labId,
  phone
}) {
  const apiConfig = await getWhatsappConfig(labId);
  const menuConfig = getMenuConfig(apiConfig.templates);

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: menuConfig.locationOptionsMenu.bodyText
      },
      action: {
        button: menuConfig.locationOptionsMenu.buttonText,
        sections: [
          {
            title: menuConfig.locationOptionsMenu.sectionTitle,
            rows: menuConfig.locationOptionsMenu.rows.slice(0, 10).map((row) => ({
              id: row.id,
              title: row.title,
              description: row.description || ""
            }))
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Location options menu sent"
  });
}

// --------------------------------------------------
// BRANCH LOCATIONS MENU
// --------------------------------------------------
export async function sendBranchLocationsMenu({
  labId,
  phone
}) {
  const apiConfig = await getWhatsappConfig(labId);
  const menuConfig = getMenuConfig(apiConfig.templates);

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: menuConfig.branchLocationsMenu.bodyText
      },
      action: {
        button: menuConfig.branchLocationsMenu.buttonText,
        sections: [
          {
            title: menuConfig.branchLocationsMenu.sectionTitle,
            rows: menuConfig.branchLocationsMenu.rows.slice(0, 10).map((row) => ({
              id: row.id,
              title: row.title,
              description: row.description || ""
            }))
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Branch locations menu sent"
  });
}

// --------------------------------------------------
// BOOKING DATE MENU
// --------------------------------------------------
export async function sendBookingDateMenu({
  labId,
  phone,
  dates
}) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: "Please select preferred date for home visit."
      },
      action: {
        button: "Select Date",
        sections: [
          {
            title: "Next 7 Days",
            rows: (dates || []).slice(0, 7).map((date) => ({
              id: `DATE_${date.iso}`,
              title: date.title,
              description: date.description || ""
            }))
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Booking date menu sent"
  });
}

// --------------------------------------------------
// BOOKING SLOT MENU
// --------------------------------------------------
export async function sendBookingSlotMenu({
  labId,
  phone,
  dateLabel,
  timeSlots,
  page = 1
}) {
  const pageSize = 9;
  const safePage = Math.max(1, Number(page) || 1);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;
  const slotSlice = (timeSlots || []).slice(start, end);
  const hasMore = end < (timeSlots || []).length;

  const rows = slotSlice.map((slot) => ({
    id: `SLOT_${slot.id}`,
    title: slot.title,
    description: slot.description || ""
  }));

  if (hasMore) {
    rows.push({
      id: `SLOT_PAGE_${safePage + 1}`,
      title: "More time slots",
      description: "View additional available slots"
    });
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: `Please select preferred time slot for ${dateLabel}.`
      },
      action: {
        button: "Select Time Slot",
        sections: [
          {
            title: "Available Time Slots",
            rows
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Booking slot menu sent"
  });
}

export async function sendPackageMenu({
  labId,
  phone,
  rows,
  page = 1,
  hasMore = false
}) {
  const safeRows = [...(rows || [])];
  if (hasMore) {
    safeRows.push({
      id: `PKG_PAGE_${Number(page || 1) + 1}`,
      title: "More Packages",
      description: "View more health packages"
    });
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: "Please choose a package category."
      },
      action: {
        button: "Explore Packages",
        sections: [
          {
            title: "Health Packages",
            rows: safeRows.slice(0, 10).map((row) => ({
              id: row.id,
              title: truncateTitle(row.title),
              description: row.description || ""
            }))
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Package menu sent"
  });
}

export async function sendPackageVariantMenu({
  labId,
  phone,
  packageName,
  rows
}) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: `Select a variant for ${packageName || "this package"}.`
      },
      action: {
        button: "View Variants",
        sections: [
          {
            title: "Available Variants",
            rows: (rows || []).slice(0, 10).map((row) => ({
              id: row.id,
              title: truncateTitle(row.title),
              description: row.description || ""
            }))
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Package variant menu sent"
  });
}

// --------------------------------------------------
// LOCATION MESSAGE
// --------------------------------------------------
export async function sendLocationMessage({
  labId,
  phone,
  latitude,
  longitude,
  name,
  address
}) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "location",
    location: {
      latitude,
      longitude,
      name,
      address
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Location Sent"
  });
}
