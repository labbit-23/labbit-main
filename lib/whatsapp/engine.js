// lib/whatsapp/engine.js

export async function processMessage(session, userInput, phone) {
  const state = session.current_state || "START";
  const context = session.context || {};

  const input = userInput.toUpperCase();

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
            "Please enter your Patient ID or registered mobile number to receive your report.",
          newState: "REPORT_WAITING_INPUT",
          context
        };
      }

      if (input === "BOOK_HOME_VISIT") {
        return {
          replyType: "TEXT",
          replyText:
            "Please enter the tests or package you would like to book.",
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
          "Thank you. Our team will verify and send your report shortly.",
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
        replyText: "Please enter your area/location.",
        newState: "BOOKING_AREA",
        context
      };

    case "BOOKING_AREA":

      context.area = userInput;

      return {
        replyType: "TEXT",
        replyText: "Please enter preferred date (DD-MM-YYYY).",
        newState: "BOOKING_DATE",
        context
      };

    case "BOOKING_DATE":

      context.selected_date = userInput;

      return {
        replyType: "TEXT",
        replyText: "Please enter preferred time slot (e.g., 7AM-9AM).",
        newState: "BOOKING_SLOT",
        context
      };

    case "BOOKING_SLOT":

      context.selected_slot = userInput;

      return {
        replyType: "CALL_QUICKBOOK",
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
            "🕒 Lab Timings:\n\nMon–Sat: 7:00 AM – 8:00 PM\nSunday: 7:00 AM – 2:00 PM",
          newState: "START",
          context: {}
        };
      }

      if (input === "SEND_LOCATION") {
        return {
          replyType: "SEND_LOCATION",
          newState: "START",
          context: {}
        };
      }

      if (input === "FEEDBACK") {
        return {
          replyType: "TEXT",
          replyText:
            "We value your feedback ❤️\n\nPlease type your feedback below.",
          newState: "FEEDBACK_WAITING",
          context
        };
      }

      return {
        replyType: "MORE_SERVICES_MENU",
        newState: "MORE_SERVICES",
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
          "Thank you for your feedback! We truly appreciate it.",
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
          "Our executive will respond shortly. Thank you for your patience.",
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