// lib/whatsapp/engine.js

import { lookupReports } from "@/lib/neosoft/client";

function normalizePhone(phone) {

  if (!phone) return phone;

  // Remove non-digits
  let p = phone.replace(/\D/g, "");

  // Remove leading 91 if present
  if (p.startsWith("91") && p.length === 12) {
    p = p.substring(2);
  }

  return p;
}

function getFlowText(botFlowConfig, key, fallback) {
  return botFlowConfig?.texts?.[key] || fallback;
}

function isValidDateInput(value) {
  return /^\d{2}-\d{2}-\d{4}$/.test(value);
}

function parseDateInput(rawInput) {
  if (!rawInput) return null;

  if (rawInput.startsWith("DATE_")) {
    const iso = rawInput.replace("DATE_", "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [year, month, day] = iso.split("-");
    return {
      iso,
      display: `${day}-${month}-${year}`
    };
  }

  const trimmed = rawInput.trim();
  if (isValidDateInput(trimmed)) {
    const [day, month, year] = trimmed.split("-");
    return {
      iso: `${year}-${month}-${day}`,
      display: trimmed
    };
  }

  return null;
}

function parseSlotInput(rawInput, context = {}) {
  if (!rawInput) return { slotName: null, slotId: null };

  const slotMap = context.available_slots || {};

  if (rawInput.startsWith("SLOT_")) {
    const slotId = rawInput.replace("SLOT_", "").trim();
    return {
      slotId,
      slotName: slotMap[slotId] || null
    };
  }

  if (slotMap[rawInput]) {
    return {
      slotId: rawInput,
      slotName: slotMap[rawInput]
    };
  }

  return {
    slotId: null,
    slotName: rawInput
  };
}

function parseHmToMinutes(value, fallbackMinutes) {
  const text = String(value || "").trim();
  if (!/^\d{1,2}:\d{2}$/.test(text)) return fallbackMinutes;
  const [h, m] = text.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return fallbackMinutes;
  }
  return h * 60 + m;
}

function getIstTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  return {
    weekday: String(map.weekday || "").toLowerCase().slice(0, 3),
    minutes: Number(map.hour || 0) * 60 + Number(map.minute || 0)
  };
}

function isAgentAvailableNow(botFlowConfig = {}) {
  const config = botFlowConfig?.agent_hours || {};
  const openMinutes = parseHmToMinutes(config.open, 7 * 60);
  const closeMinutes = parseHmToMinutes(config.close, 21 * 60);
  const days = Array.isArray(config.days) && config.days.length > 0
    ? config.days.map((d) => String(d).toLowerCase().slice(0, 3))
    : ["mon", "tue", "wed", "thu", "fri", "sat"];

  const { weekday, minutes } = getIstTimeParts();
  if (!days.includes(weekday)) return false;
  return minutes >= openMinutes && minutes <= closeMinutes;
}

function detectIntent(text) {

  if (!text) return null;

  const t = text.toLowerCase();

  const intents = {

    REQUEST_REPORTS: [
      "reports",
      "my report",
      "lab report",
      "blood report",
      "test report",
      "download report",
      "send report",
      "my reports",
      "lab results",
      "test results"
    ],

    BOOK_HOME_VISIT: [
      "book",
      "book test",
      "blood test",
      "home visit",
      "home collection",
      "sample collection"
    ],

    EXPLORE_PACKAGES: [
      "package",
      "health package",
      "checkup",
      "full body checkup",
      "price",
      "packages"
    ],

    SEND_LOCATION: [
      "location",
      "address",
      "map",
      "where are you",
      "directions"
    ],

    LAB_TIMINGS: [
      "timing",
      "timings",
      "open",
      "close",
      "working hours"
    ],

    TALK_EXECUTIVE: [
      "help",
      "support",
      "agent",
      "executive",
      "talk to someone",
      "call me"
    ],

    MORE_SERVICES: [
      "info",
      "information",
      "more info",
      "details",
      "tell me more"
    ]

  };

  for (const [intent, keywords] of Object.entries(intents)) {
    for (const k of keywords) {
      if (t.includes(k)) {
        return intent;
      }
    }
  }

  return null;
}

export async function processMessage(session, userInput, phone, options = {}) {
  const state = session.current_state || "START";
  const context = session.context || {};
  const botFlowConfig = options.botFlowConfig || {};

  const rawInput = (userInput || "").trim();
  let input = rawInput.toUpperCase();
  console.log("STATE:", state, "INPUT:", input, "CONTEXT KEYS:", Object.keys(context));

  // ---------------------------------------------------
  // Instagram / URL messages → show Main Menu
  // ---------------------------------------------------

  if (/instagram\.com|http:\/\/|https:\/\//i.test(rawInput)) {
    return {
      replyType: "MAIN_MENU",
      newState: "START",
      context: {}
    };
  }

  // ------------------------------------
  // INTENT DETECTION (AI-like routing)
  // ------------------------------------

  const isStructuredId = /^(REPORT_|SLOT_|DATE_|PKG_|PKGV_|BRANCH_|SLOT_PAGE_|PKG_PAGE_)/.test(rawInput.toUpperCase());

  const detectedIntent = !isStructuredId ? detectIntent(rawInput) : null;

  if (detectedIntent) {
    input = detectedIntent;
  }

  // ---------------------------------------------------
  // GREETING RESET
  // ---------------------------------------------------

  if (/^(hi|hello|hey|menu)/i.test(rawInput)) {
    const activeStates = ["REPORT_SELECTION", "BOOKING_DATE", "BOOKING_SLOT", 
      "BOOKING_LOCATION_WAITING_TEXT", "BOOKING_LOCATION_WAITING_PIN",
      "PACKAGE_MENU", "PACKAGE_VARIANT_MENU", "HANDOFF_CALLBACK_WAITING"];
    
    if (activeStates.includes(state)) {
      // Don't reset mid-flow, just fall through to the state machine
    } else {
      return {
        replyType: "MAIN_MENU",
        newState: "START",
        context: {}
      };
    }
  }

  if (input === "HELP") {
  return {
    replyType: "HANDOFF",
    replyText: "Connecting you to our executive. Please wait...",
    newState: "HUMAN_HANDOVER",
    context
  };
}

  // ---------------------------------------------------
  // GLOBAL COMMANDS (work from anywhere)
  // ---------------------------------------------------
  if (input === "MAIN_MENU") {
    return {
      replyType: "MAIN_MENU",
      newState: "START",
      context: {}
    };
  }

  if (input === "MORE_SERVICES") {
    return {
      replyType: "MORE_SERVICES_MENU",
      newState: "MORE_SERVICES",
      context
    };
  }
  // ---------------------------------------------------
  // STATE MACHINE
  // ---------------------------------------------------
  switch (state) {

    // ===================================================
    // START (Main Menu)
    // ===================================================
    case "START": {

      if (input === "__MEDIA__") {
        const mediaUrl = options?.inboundMedia?.url || null;
        return {
          replyType: "INTERNAL_NOTIFY",
          notifyText: [
            "📄 Report Request",
            `Phone: ${phone}`,
            "Input: Image attachment",
            mediaUrl ? `Attachment: ${mediaUrl}` : null
          ]
            .filter(Boolean)
            .join("\n"),
          replyText:
            getFlowText(
              botFlowConfig,
              "report_request_ack",
              "Thank you. Our team will verify and send your report shortly."
            ),
          newState: "START",
          context: {}
        };
      }

      if (input === "REQUEST_REPORTS") {

        try {

          const cleanPhone = normalizePhone(phone);
          const reports = await lookupReports(cleanPhone);
          console.log("Reports returned:", reports);
          if (reports && reports.length > 0) {

            const reportOptions = {};

            reports.slice(0,5).forEach((r,index) => {
              reportOptions[String(index+1)] = {
                reqid: r.reqid,
                reqno: r.reqno,
                patient_name: r.patient_name,
                reqdt: r.reqdt
              };
            });

            return {
              replyType: "REPORT_SELECTION_MENU",
              reports: reports.slice(0,5).map(r => {

              const d = new Date(r.reqdt);
              const formatted = d.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric"
              });

              return {
                ...r,
                display_title: `Req No: ${r.reqno} • ${formatted}`
              };

            }),
              newState: "REPORT_SELECTION",
              context: {
                ...context,
                report_options: reportOptions
              }
            };

          }

          return {
            replyType: "INTERNAL_NOTIFY",
            notifyText: `📄 Report Request\nPhone: ${phone}\nInput: WhatsApp number`,
            replyText:
              getFlowText(
                botFlowConfig,
                "report_request_ack",
                "Thank you. Our team will verify and send your report shortly."
              ),
            newState: "START",
            context: {}
          };

        } catch (err) {

          return {
            replyType: "INTERNAL_NOTIFY",
            notifyText: `📄 Report Request\nPhone: ${phone}\nInput: WhatsApp number`,
            replyText:
              getFlowText(
                botFlowConfig,
                "report_request_ack",
                "Thank you. Our team will verify and send your report shortly."
              ),
            newState: "START",
            context: {}
          };

        }

      }

      if (input === "BOOK_HOME_VISIT") {
        return {
          replyType: "BOOKING_DATE_MENU",
          newState: "BOOKING_DATE",
          context
        };
      }

      if (input === "MORE_SERVICES") {
        return {
          replyType: "MORE_SERVICES_MENU",
          newState: "MORE_SERVICES",
          context
        };
      }

      return {
        replyType: "MAIN_MENU",
        newState: "START",
        context: {}
      };
    }

    // ===================================================
    // REPORT FLOW
    // ===================================================
    case "REPORT_WAITING_INPUT": {
      if (input === "REPORT_USE_REGISTERED_NUMBER") {
        return {
          replyType: "INTERNAL_NOTIFY",
          notifyText: `📄 Report Request\nPhone: ${phone}\nInput: Registered number (same WhatsApp)`,
          replyText:
            getFlowText(
              botFlowConfig,
              "report_request_ack",
              "Thank you. Our team will verify and send your report shortly."
            ),
          newState: "START",
          context: {}
        };
      }

      {
        const mediaUrl = options?.inboundMedia?.url || null;
        const inputText =
          input === "__MEDIA__" ? "Image attachment" : (userInput || "");
        return {
          replyType: "INTERNAL_NOTIFY",
          notifyText: [
            "📄 Report Request",
            `Phone: ${phone}`,
            `Input: ${inputText}`,
            mediaUrl ? `Attachment: ${mediaUrl}` : null
          ]
            .filter(Boolean)
            .join("\n"),
          replyText:
            getFlowText(
              botFlowConfig,
              "report_request_ack",
              "Thank you. Our team will verify and send your report shortly."
            ),
          newState: "START",
          context: {}
        };
      }
    }

    // ===================================================
    // BOOKING FLOW
    // ===================================================
    case "BOOKING_AREA": {
      // Backward compatibility: older sessions asked area first.
      // Keep accepting and move to date/time flow.
      if (rawInput) context.area = rawInput;
      return {
        replyType: "BOOKING_DATE_MENU",
        newState: "BOOKING_DATE",
        context
      };
    }
    case "BOOKING_TEST_SELECTION": {
      // Backward compatibility for any in-flight sessions that still land here first.
      context.tests = userInput;
      if (!context.area || !context.selected_date || !context.selected_slot) {
        return {
          replyType: "TEXT",
          replyText: getFlowText(
            botFlowConfig,
            "booking_area_prompt",
            "Please enter your area/location."
          ),
          newState: "BOOKING_AREA",
          context
        };
      }

      return {
        replyType: "CALL_QUICKBOOK",
        replyText: getFlowText(
          botFlowConfig,
          "booking_submitted_ack",
          "Your booking request has been received. Our team will contact you shortly."
        ),
        newState: "START",
        context
      };
    }
    case "BOOKING_DATE":
      {
        const parsedDate = parseDateInput(rawInput);
        if (!parsedDate) {
          return {
            replyType: "TEXT",
            replyText: getFlowText(
              botFlowConfig,
              "booking_date_invalid",
              "Please choose a date from menu or type in DD-MM-YYYY format."
            ),
            newState: "BOOKING_DATE",
            context
          };
        }

        context.selected_date_iso = parsedDate.iso;
        context.selected_date = parsedDate.display;
      }

      return {
        replyType: "BOOKING_SLOT_MENU",
        newState: "BOOKING_SLOT",
        context
      };

    case "REPORT_SELECTION": {

      if (input.startsWith("REPORT_")) {

        const reqid = input.replace("REPORT_", "").trim();

        const entry = Object.values(context.report_options || {})
          .find(r => r.reqid === reqid);

        let firstName = "Patient";

        if (entry?.patient_name) {

          const parts = entry.patient_name.trim().split(/\s+/);

          for (const p of parts) {
            const clean = p.replace(/[^a-z]/gi, "");
            if (clean.length > 4) {
              firstName = clean.toUpperCase();
              firstName = firstName.substring(0,20);
              break;
            }
          }

        }

        const filename =
          `SDRC_Report_${entry?.reqno || reqid}_${firstName}.pdf`;

        return {
          replyType: "SEND_DOCUMENT",
          documentUrl: `${process.env.NEOSOFT_API_BASE_URL}/report/${reqid}`,
          filename,
          newState: "START",
          context: {}
        };
      }   
      return {
      replyType: "MAIN_MENU",
      newState: "START",
      context: {}
    };
  }   
    case "BOOKING_SLOT": {
      if (input.startsWith("SLOT_PAGE_")) {
        const pageNo = Number(input.replace("SLOT_PAGE_", "").trim());
        context.slot_page = Number.isFinite(pageNo) && pageNo > 0 ? pageNo : 1;

        return {
          replyType: "BOOKING_SLOT_MENU",
          newState: "BOOKING_SLOT",
          context
        };
      }

      {
        const parsedSlot = parseSlotInput(rawInput, context);
        if (input.startsWith("SLOT_") && !parsedSlot.slotName) {
          return {
            replyType: "TEXT",
            replyText: getFlowText(
              botFlowConfig,
              "booking_slot_invalid",
              "Please choose a valid time slot from the menu."
            ),
            newState: "BOOKING_SLOT",
            context
          };
        }

        context.selected_slot = parsedSlot.slotName || userInput;
        context.selected_slot_id = parsedSlot.slotId;
        context.slot_page = 1;
      }

      return {
        replyType: "TEXT",
        replyText: getFlowText(
          botFlowConfig,
          "booking_location_text_prompt",
          "Please enter your area/location."
        ),
        newState: "BOOKING_LOCATION_WAITING_TEXT",
        context
      };
    }
    case "BOOKING_LOCATION_CHOICE": {
      // Legacy fallback: collapse old location choice into a simple text capture.
      if (input === "SHARE_CURRENT_LOCATION") {
        return {
          replyType: "TEXT",
          replyText: getFlowText(
            botFlowConfig,
            "booking_location_text_prompt",
            "Please enter your area/location."
          ),
          newState: "BOOKING_LOCATION_WAITING_TEXT",
          context
        };
      }
    }
      if (input === "SHARE_CUSTOM_LOCATION") {
        return {
          replyType: "TEXT",
          replyText: getFlowText(
            botFlowConfig,
            "booking_location_text_prompt",
            "Please enter your area/location."
          ),
          newState: "BOOKING_LOCATION_WAITING_TEXT",
          context
        };
      }

      if (input === "SKIP_LOCATION") {
        return {
          replyType: "TEXT",
          replyText: getFlowText(
            botFlowConfig,
            "booking_location_text_prompt",
            "Please enter your area/location."
          ),
          newState: "BOOKING_LOCATION_WAITING_TEXT",
          context
        };
      }

      return {
        replyType: "TEXT",
        replyText: getFlowText(
          botFlowConfig,
          "booking_location_text_prompt",
          "Please enter your area/location."
        ),
        newState: "BOOKING_LOCATION_WAITING_TEXT",
        context
      };

    case "BOOKING_LOCATION_WAITING_PIN":
      // Legacy fallback: accept a location pin but submit immediately.
      if (options?.inboundLocation?.latitude && options?.inboundLocation?.longitude) {
        context.location_source = "current_pin";
        context.location_lat = Number(options.inboundLocation.latitude);
        context.location_lng = Number(options.inboundLocation.longitude);
        context.location_name = options.inboundLocation.name || null;
        context.location_address = options.inboundLocation.address || null;
        context.area = context.area || options.inboundLocation.address || options.inboundLocation.name || "Location shared on WhatsApp";
        return {
          replyType: "CALL_QUICKBOOK",
          replyText: getFlowText(
            botFlowConfig,
            "booking_submitted_ack",
            "Your booking request has been received. Our team will contact you shortly."
          ),
          newState: "START",
          context
        };
      }

      return {
        replyType: "TEXT",
        replyText: getFlowText(
          botFlowConfig,
          "booking_location_text_prompt",
          "Please enter your area/location."
        ),
        newState: "BOOKING_LOCATION_WAITING_TEXT",
        context
      };

    case "BOOKING_LOCATION_WAITING_TEXT":
      if (rawInput) {
        context.location_source = "manual_text";
        context.location_text = rawInput;
        context.area = rawInput;
      } else {
        context.location_source = "not_provided";
      }

      return {
        replyType: "CALL_QUICKBOOK",
        replyText: getFlowText(
          botFlowConfig,
          "booking_submitted_ack",
          "Your booking request has been received. Our team will contact you shortly."
        ),
        newState: "START",
        context
      };

    case "BOOKING_PRESCRIPTION_WAITING":
      // Legacy sessions can still land here; skip straight to submission.
      if (options?.inboundMedia?.url) {
        context.prescription = options.inboundMedia.url;
      }

      return {
        replyType: "CALL_QUICKBOOK",
        replyText: getFlowText(
          botFlowConfig,
          "booking_submitted_ack",
          "Your booking request has been received. Our team will contact you shortly."
        ),
        newState: "START",
        context
      };

    case "BOOKING_TEST_DETAILS":
      // Legacy sessions can still land here; store optional user text and submit.
      if (rawInput) {
        context.tests = userInput;
      }
      return {
        replyType: "CALL_QUICKBOOK",
        replyText: getFlowText(
          botFlowConfig,
          "booking_submitted_ack",
          "Your booking request has been received. Our team will contact you shortly."
        ),
        newState: "START",
        context
      };

    // ===================================================
    // MORE SERVICES
    // ===================================================
    case "MORE_SERVICES":

      if (input === "TALK_EXECUTIVE") {
        if (isAgentAvailableNow(botFlowConfig)) {
          return {
            replyType: "HANDOFF",
            replyText:
              getFlowText(
                botFlowConfig,
                "handoff_open_text",
                "Connecting you to our executive. Please wait..."
              ),
            newState: "HUMAN_HANDOVER",
            context
          };
        }

        return {
          replyType: "TEXT",
          replyText:
            getFlowText(
              botFlowConfig,
              "handoff_closed_text",
              "Our executives are currently offline. Reply YES to request a callback on the next working day."
            ),
          newState: "HANDOFF_CALLBACK_WAITING",
          context
        };
      }

      if (input === "LAB_TIMINGS") {
        return {
          replyType: "TEXT",
          replyText:
            getFlowText(
              botFlowConfig,
              "lab_timings_text",
              "🕒 Lab Timings:\n\nMon–Sat: 7:00 AM – 8:00 PM\nSunday: 7:00 AM – 2:00 PM"
            ),
          newState: "START",
          context: {}
        };
      }

      if (input === "SEND_LOCATION") {
        return {
          replyType: "LOCATION_OPTIONS_MENU",
          newState: "LOCATION_OPTIONS",
          context
        };
      }

      if (input === "FEEDBACK") {
        return {
          replyType: "FEEDBACK_LINK",
          newState: "START",
          context: {}
        };
      }

      if (input === "EXPLORE_PACKAGES") {
        return {
          replyType: "PACKAGE_MENU",
          newState: "PACKAGE_MENU",
          context: {
            ...context,
            package_page: 1
          }
        };
      }

      return {
        replyType: "MORE_SERVICES_MENU",
        newState: "MORE_SERVICES",
        context
      };

    // ===================================================
    // LOCATION OPTIONS
    // ===================================================
    case "LOCATION_OPTIONS":
      if (input === "SHARE_LOCATION_PIN") {
        return {
          replyType: "SEND_LOCATION",
          newState: "MORE_SERVICES",
          context
        };
      }

      if (input === "SHARE_ADDRESS") {
        return {
          replyType: "LAB_ADDRESS_TEXT",
          newState: "MORE_SERVICES",
          context
        };
      }

      if (input === "SHARE_TIMINGS") {
        return {
          replyType: "LAB_TIMINGS_TEXT",
          newState: "MORE_SERVICES",
          context
        };
      }

      if (input === "SHARE_BOTH") {
        return {
          replyType: "SEND_LOCATION_AND_ADDRESS",
          newState: "MORE_SERVICES",
          context
        };
      }

      if (input === "SHARE_BRANCH_LOCATIONS") {
        return {
          replyType: "LOCATION_BRANCHES_MENU",
          newState: "LOCATION_BRANCHES",
          context
        };
      }

      return {
        replyType: "LOCATION_OPTIONS_MENU",
        newState: "LOCATION_OPTIONS",
        context
      };

    case "LOCATION_BRANCHES":
      if (input.startsWith("BRANCH_")) {
        return {
          replyType: "BRANCH_LOCATION_LINK",
          branchId: input,
          newState: "MORE_SERVICES",
          context
        };
      }

      return {
        replyType: "LOCATION_BRANCHES_MENU",
        newState: "LOCATION_BRANCHES",
        context
      };

    // ===================================================
    // PACKAGE FLOW
    // ===================================================
    case "PACKAGE_MENU": {
      if (input.startsWith("PKG_PAGE_")) {
        const pageNo = Number(input.replace("PKG_PAGE_", "").trim());
        context.package_page = Number.isFinite(pageNo) && pageNo > 0 ? pageNo : 1;
        return {
          replyType: "PACKAGE_MENU",
          newState: "PACKAGE_MENU",
          context
        };
      }

      if (input.startsWith("PKG_")) {
        const idx = Number(input.replace("PKG_", "").trim());
        if (!Number.isFinite(idx) || idx < 0) {
          return {
            replyType: "PACKAGE_MENU",
            newState: "PACKAGE_MENU",
            context
          };
        }

        context.selected_package_index = idx;
        const catalog = options.packageCatalog || [];
        const selectedPackage = catalog.find((pkg) => pkg.packageIndex === idx);
        const variantsCount = Array.isArray(selectedPackage?.variants)
          ? selectedPackage.variants.length
          : 0;

        if (variantsCount <= 1) {
          context.selected_variant_index = 0;
          context.last_explored_package_index = idx;
          context.last_explored_variant_index = 0;
          return {
            replyType: "PACKAGE_DETAILS_TEXT",
            newState: "START",
            context
          };
        }

        return {
          replyType: "PACKAGE_VARIANT_MENU",
          newState: "PACKAGE_VARIANT_MENU",
          context
        };
      }

      return {
        replyType: "PACKAGE_MENU",
        newState: "PACKAGE_MENU",
        context
      };
    }
    case "PACKAGE_VARIANT_MENU": {
      if (input === "PKG_BACK_LIST") {
        return {
          replyType: "PACKAGE_MENU",
          newState: "PACKAGE_MENU",
          context
        };
      }

      if (input.startsWith("PKGV_")) {
        const parts = input.replace("PKGV_", "").split("_");
        const packageIdx = Number(parts[0]);
        const variantIdx = Number(parts[1]);
        if (!Number.isFinite(packageIdx) || !Number.isFinite(variantIdx)) {
          return {
            replyType: "PACKAGE_VARIANT_MENU",
            newState: "PACKAGE_VARIANT_MENU",
            context
          };
        }

        context.selected_package_index = packageIdx;
        context.selected_variant_index = variantIdx;
        context.last_explored_package_index = packageIdx;
        context.last_explored_variant_index = variantIdx;

        return {
          replyType: "PACKAGE_DETAILS_TEXT",
          newState: "START",
          context
        };
      }

      return {
        replyType: "PACKAGE_VARIANT_MENU",
        newState: "PACKAGE_VARIANT_MENU",
        context
      };

    }
    // ===================================================
    // CALLBACK FLOW
    // ===================================================
    case "HANDOFF_CALLBACK_WAITING":
      if (["YES", "Y", "CALL", "CALLBACK", "REQUEST_CALLBACK"].includes(input)) {
        return {
          replyType: "INTERNAL_NOTIFY",
          notifyText: `📞 Callback Request\nPhone: ${phone}\nSource: WhatsApp`,
          replyText: getFlowText(
            botFlowConfig,
            "handoff_callback_saved_text",
            "Thank you. Our team will call you on the next working day."
          ),
          newState: "START",
          context: {}
        };
      }

      if (["NO", "N", "MAIN_MENU"].includes(input)) {
        return {
          replyType: "MAIN_MENU",
          newState: "START",
          context: {}
        };
      }

      return {
        replyType: "TEXT",
        replyText: getFlowText(
          botFlowConfig,
          "handoff_callback_prompt",
          "Reply YES to request a callback, or MAIN_MENU to return."
        ),
        newState: "HANDOFF_CALLBACK_WAITING",
        context
      };


    // ===================================================
    // FEEDBACK FLOW
    // ===================================================
    case "FEEDBACK_WAITING":

      return {
        replyType: "INTERNAL_NOTIFY",
        notifyText: `⭐ New Feedback\nPhone: ${phone}\nFeedback: ${userInput}`,
        replyText:
          getFlowText(
            botFlowConfig,
            "feedback_ack",
            "Thank you for your feedback! We truly appreciate it."
          ),
        newState: "START",
        context: {}
      };


    // ===================================================
    // HUMAN HANDOVER
    // ===================================================
    case "HUMAN_HANDOVER":
      return {
        replyType: "TEXT",
        replyText:
          getFlowText(
            botFlowConfig,
            "handoff_waiting_text",
            "Our executive will respond shortly. Thank you for your patience."
          ),
        newState: "HUMAN_HANDOVER",
        context
      };


    // ===================================================
    // DEFAULT FALLBACK
    // ===================================================
    default:
      return {
        replyType: "MAIN_MENU",
        newState: "START",
        context: {}
      };
  }
}
