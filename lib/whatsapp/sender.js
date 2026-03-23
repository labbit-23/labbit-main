//lib/whatsapp/sender.js

import { AsyncLocalStorage } from "node:async_hooks";
import { supabase } from "@/lib/supabaseServer";

const whatsappSendContextStore = new AsyncLocalStorage();

export function runWithWhatsappSendContext(context, fn) {
  return whatsappSendContextStore.run(context || {}, fn);
}

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
          { id: "DOWNLOAD_TREND_REPORTS", title: "📈 View Trend Report" },
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
          { id: "SHARE_LOCATION_PIN", title: "📍 Main Location" },
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

function truncateButtonTitle(value, max = 20) {
  const text = String(value || "").trim();
  if (!text) return "Option";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const MAIN_MENU_ROW = {
  id: "MAIN_MENU",
  title: "🏠 Main Menu",
  description: "Go back to home options"
};

function withMainMenuRow(rows = [], maxRows = 10) {
  const cleaned = (rows || [])
    .filter((row) => row?.id && row?.title)
    .filter((row) => row.id !== MAIN_MENU_ROW.id);

  if (cleaned.length >= maxRows) {
    return [...cleaned.slice(0, maxRows - 1), MAIN_MENU_ROW];
  }

  return [...cleaned, MAIN_MENU_ROW];
}

function sanitizeWhatsappText(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function sanitizePayloadTextFields(value, key = "") {
  const textKeys = new Set([
    "body",
    "text",
    "title",
    "description",
    "caption",
    "name",
    "address"
  ]);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayloadTextFields(item, key));
  }

  if (value && typeof value === "object") {
    const next = {};
    for (const [k, v] of Object.entries(value)) {
      next[k] = sanitizePayloadTextFields(v, k);
    }
    return next;
  }

  if (typeof value === "string" && textKeys.has(key)) {
    return sanitizeWhatsappText(value);
  }

  return value;
}

// --------------------------------------------------
// Generic Send Function
// --------------------------------------------------
async function sendWhatsApp({ labId, phone, payload, logText, sender = null }) {
  const apiConfig = await getWhatsappConfig(labId);
  const sanitizedPayload = sanitizePayloadTextFields(payload);
  const sanitizedLogText = typeof logText === "string" ? sanitizeWhatsappText(logText) : logText;
  const devEndpoint = process.env.WHATSAPP_DEV_ENDPOINT?.trim();
  const sendContext = whatsappSendContextStore.getStore() || {};
  const shouldRouteToDevEndpoint = Boolean(devEndpoint) && Boolean(sendContext?.useDevEndpoint);
  const endpoint = shouldRouteToDevEndpoint ? devEndpoint : apiConfig.base_url;
  const isSimulated = Boolean(sendContext?.simulated || sender?.simulated);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiConfig.auth_details.api_key,
      "x-lab-id": String(labId || "")
    },
    body: JSON.stringify(sanitizedPayload)
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
      message: sanitizedLogText || JSON.stringify(sanitizedPayload),
      direction: response.ok ? "outbound" : "status",
      payload: {
        simulated: isSimulated,
        sender,
        request: sanitizedPayload,
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

export async function sendDocumentMessage({
  labId,
  phone,
  documentUrl,
  filename = "document.pdf",
  caption = "",
  sender = null
}) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "document",
    document: {
      link: documentUrl,
      filename,
      caption
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: caption || `Document sent: ${filename}`,
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
            title: truncateButtonTitle(button.title)
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
  const rows = [...(menuConfig.moreServicesMenu.rows || [])];

  if (!rows.some((row) => row?.id === "EXPLORE_PACKAGES")) {
    rows.push({
      id: "EXPLORE_PACKAGES",
      title: "🧪 Explore Packages",
      description: "View health packages"
    });
  }

  if (!rows.some((row) => row?.id === "DOWNLOAD_TREND_REPORTS")) {
    rows.push({
      id: "DOWNLOAD_TREND_REPORTS",
      title: "📈 Download Trend Reports",
      description: "Select a patient report to get trend PDF"
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
        text: menuConfig.moreServicesMenu.bodyText
      },
      action: {
        button: menuConfig.moreServicesMenu.buttonText,
        sections: [
          {
            title: menuConfig.moreServicesMenu.sectionTitle,
            rows: withMainMenuRow(rows).map((row) => ({
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
    logText: "More Services Menu Sent"
  });
}

// --------------------------------------------------
// REPORT INPUT PROMPT (Buttons)
// --------------------------------------------------
export async function sendReportInputPrompt({
  labId,
  phone
}) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "Choose report option:"
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "REPORT_DOWNLOAD_LATEST",
              title: "Latest Report"
            }
          },
          {
            type: "reply",
            reply: {
              id: "REPORT_PREVIOUS_LIST",
              title: "Last 5 Reports"
            }
          },
          {
            type: "reply",
            reply: {
              id: "TREND_LATEST",
              title: "Trend Reports"
            }
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Report input prompt sent"
  });
}

// --------------------------------------------------
// REPORT SELECTION MENU
// --------------------------------------------------
export async function sendReportSelectionMenu({
  labId,
  phone,
  reports
}) {

  const rows = (reports || []).slice(0,5).map((r) => {

    const firstName = (r.patient_name || "Patient")
      .replace(/^(DR\.?|MR\.?|MRS\.?|MS\.?|CAPT\.?|COL\.?|LT\.?|MAJ\.?|PROF\.?)\s+/i, "")
      .split(/\s+/)[0]
      .toUpperCase();

    return {
      id: `REPORT_${r.reqid}`,
      title: truncateTitle(`${r.reqno} ${firstName}`),
      description: r.display_title
    };

  });

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: "We found your recent reports. Select one to download."
      },
      action: {
        button: "View Reports",
        sections: [
          {
            title: "Recent Reports",
            rows: withMainMenuRow(rows)
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Report selection menu sent"
  });
}

export async function sendReportPostDownloadMenu({
  labId,
  phone
}) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "Would you like to download a trend report, select from last 5 reports, or go back to the main menu?"
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "TREND_LATEST",
              title: "Trend Reports"
            }
          },
          {
            type: "reply",
            reply: {
              id: "REPORT_SELECT_ANOTHER",
              title: "Last 5 Reports"
            }
          },
          {
            type: "reply",
            reply: {
              id: "MAIN_MENU",
              title: "Main Menu"
            }
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Report post-download menu sent"
  });
}

export async function sendReportHistoryTrendMenu({
  labId,
  phone
}) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "Choose one option:"
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "REPORT_PREVIOUS_LIST",
              title: "Last 5 Reports"
            }
          },
          {
            type: "reply",
            reply: {
              id: "TREND_LATEST",
              title: "Trend Report"
            }
          },
          {
            type: "reply",
            reply: {
              id: "MAIN_MENU",
              title: "Main Menu"
            }
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Report history/trend menu sent"
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
            rows: withMainMenuRow(
              (menuConfig.locationOptionsMenu.rows || []).filter((row) =>
                ["SHARE_LOCATION_PIN", "SHARE_BRANCH_LOCATIONS"].includes(row?.id)
              )
            ).map((row) => ({
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
            rows: withMainMenuRow(menuConfig.branchLocationsMenu.rows).map((row) => ({
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
            rows: withMainMenuRow(
              (dates || []).slice(0, 7).map((date) => ({
                id: `DATE_${date.iso}`,
                title: date.title,
                description: date.description || ""
              }))
            )
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

export async function sendBookingServicesMenu({
  labId,
  phone,
  hasActiveVisit = false,
  activeVisitSummary = ""
}) {
  const rows = [];

  if (hasActiveVisit) {
    rows.push({
      id: "BOOKING_VIEW_ACTIVE_VISIT",
      title: "📋 View Booked Visit",
      description: "See your current visit details"
    });
    rows.push({
      id: "BOOKING_CHANGE_CANCEL_VISIT",
      title: "🔁 Change / Cancel Visit",
      description: "Request modification with executive"
    });
  }

  rows.push({
    id: "BOOKING_NEW_VISIT",
    title: hasActiveVisit ? "➕ Book Another Visit" : "🏠 Book Home Visit",
    description: "Schedule a fresh home collection"
  });
  rows.push({
    id: "BOOKING_CONTACT_EXECUTIVE",
    title: "📞 Contact Executive",
    description: "Get quick assistance"
  });

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: hasActiveVisit
          ? `You already have an active visit.\n${activeVisitSummary || "Choose an action below."}`
          : "Home visit services: choose one option."
      },
      action: {
        button: "Home Visit Services",
        sections: [
          {
            title: "Visit Assistance",
            rows: withMainMenuRow(rows)
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Booking services menu sent"
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
  // WhatsApp list allows max 10 rows.
  // For slots, prioritize slot pagination and skip Main Menu row.
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
      title:
        safePage === 1
          ? "Afternoon slots →"
          : safePage === 2
            ? "Evening slots →"
            : "More slots",      
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

export async function sendBookingLocationMenu({
  labId,
  phone
}) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: "Do you want to share location for easier home sample collection?"
      },
      action: {
        button: "Choose Option",
        sections: [
          {
            title: "Location Preference",
            rows: withMainMenuRow([
              {
                id: "SHARE_CURRENT_LOCATION",
                title: "Send Current Pin",
                description: "Fastest for navigation"
              },
              {
                id: "SHARE_CUSTOM_LOCATION",
                title: "Type Address",
                description: "Share custom location text"
              },
              {
                id: "SKIP_LOCATION",
                title: "Skip for now",
                description: "Continue without location"
              }
            ])
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Booking location menu sent"
  });
}

export async function sendBookingPostConfirmLocationMenu({
  labId,
  phone
}) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: "Would you like to share your location for easier home visit navigation? (Optional)"
      },
      action: {
        button: "Share Location (Optional)",
        sections: [
          {
            title: "Location Options",
            rows: withMainMenuRow([
              {
                id: "BOOKING_SHARE_CURRENT_LOCATION",
                title: "📍 Current Location",
                description: "Share WhatsApp location pin"
              },
              {
                id: "BOOKING_SHARE_MAPS_LINK",
                title: "🗺️ Maps Link / Area",
                description: "Paste link or type area"
              },
              {
                id: "BOOKING_SKIP_LOCATION",
                title: "Skip for now",
                description: "Continue without location"
              }
            ])
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Post-booking optional location menu sent"
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
        text: "Choose a package to view price and details."
      },
      action: {
        button: "View Packages",
        sections: [
          {
            title: "Health Packages",
            rows: withMainMenuRow(safeRows).map((row) => ({
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
        text: `Select an option for ${packageName || "this package"}.`
      },
      action: {
        button: "View Variants",
        sections: [
          {
            title: "Available Variants",
            rows: withMainMenuRow(rows || []).map((row) => ({
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
