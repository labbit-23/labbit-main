// lib/whatsapp/engine.js

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

export async function processMessage(session, userInput, phone, options = {}) {
  const state = session.current_state || "START";
  const context = session.context || {};
  const botFlowConfig = options.botFlowConfig || {};

  const rawInput = (userInput || "").trim();
  const input = rawInput.toUpperCase();

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
    case "START":

      if (input === "REQUEST_REPORTS") {
        return {
          replyType: "TEXT",
          replyText:
            getFlowText(
              botFlowConfig,
              "report_request_prompt",
              "Please enter your Patient ID or registered mobile number to receive your report."
            ),
          newState: "REPORT_WAITING_INPUT",
          context
        };
      }

      if (input === "BOOK_HOME_VISIT") {
        return {
          replyType: "TEXT",
          replyText:
            getFlowText(
              botFlowConfig,
              "booking_test_prompt",
              "Please enter the tests or package you would like to book."
            ),
          newState: "BOOKING_TEST_SELECTION",
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


    // ===================================================
    // REPORT FLOW
    // ===================================================
    case "REPORT_WAITING_INPUT":

      return {
        replyType: "INTERNAL_NOTIFY",
        notifyText: `📄 Report Request\nPhone: ${phone}\nInput: ${userInput}`,
        replyText:
          getFlowText(
            botFlowConfig,
            "report_request_ack",
            "Thank you. Our team will verify and send your report shortly."
          ),
        newState: "START",
        context: {}
      };


    // ===================================================
    // BOOKING FLOW
    // ===================================================
    case "BOOKING_TEST_SELECTION":

      context.tests = userInput;

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

    case "BOOKING_AREA":

      context.area = userInput;

      return {
        replyType: "BOOKING_DATE_MENU",
        newState: "BOOKING_DATE",
        context
      };

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

    case "BOOKING_SLOT":
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
        return {
          replyType: "HANDOFF",
          replyText:
            "Connecting you to our executive. Please wait...",
          newState: "HUMAN_HANDOVER",
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
          newState: "START",
          context: {}
        };
      }

      if (input === "SHARE_ADDRESS") {
        return {
          replyType: "LAB_ADDRESS_TEXT",
          newState: "START",
          context: {}
        };
      }

      if (input === "SHARE_TIMINGS") {
        return {
          replyType: "LAB_TIMINGS_TEXT",
          newState: "START",
          context: {}
        };
      }

      if (input === "SHARE_BOTH") {
        return {
          replyType: "SEND_LOCATION_AND_ADDRESS",
          newState: "START",
          context: {}
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
          newState: "START",
          context: {}
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
    case "PACKAGE_MENU":
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

    case "PACKAGE_VARIANT_MENU":
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
