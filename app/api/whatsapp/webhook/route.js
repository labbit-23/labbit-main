import { supabase } from "@/lib/supabaseServer";
import {
  getOrCreateSession,
  updateSession,
  handoffToHuman
} from "@/lib/whatsapp/sessions";
import { processMessage } from "@/lib/whatsapp/engine";
import { createReportRequestClickupTask } from "@/lib/clickup";
import {
  sendTextMessage,
  sendMainMenu,
  sendMoreServicesMenu,
  sendLocationMessage,
  sendLocationOptionsMenu,
  sendBranchLocationsMenu,
  sendBookingDateMenu,
  sendBookingSlotMenu,
  sendPackageMenu,
  sendPackageVariantMenu
} from "@/lib/whatsapp/sender";
import healthPackagesData from "@/lib/data/health-packages.json";

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

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function toCanonicalPhone(value) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length > 12) {
    return `91${digits.slice(-10)}`;
  }
  return digits;
}

function normalizePhoneVariants(rawPhone) {
  const digits = digitsOnly(rawPhone);
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  const canonical = toCanonicalPhone(rawPhone);
  return Array.from(new Set([rawPhone, canonical, digits, last10, last10 ? `91${last10}` : ""].filter(Boolean)));
}

function preferPatient(primary, secondary) {
  if (primary && !primary.is_lead) return primary;
  if (secondary && !secondary.is_lead) return secondary;
  return primary || secondary || null;
}

async function findLocalPatientByPhone(rawPhone) {
  const variants = normalizePhoneVariants(rawPhone);
  if (variants.length === 0) return null;

  const { data: rows } = await supabase
    .from("patients")
    .select("id, name, phone, email, dob, gender, mrn, is_lead")
    .in("phone", variants)
    .limit(10);

  const patients = rows || [];
  const nonLead = patients.find((p) => !p?.is_lead);
  return nonLead || patients[0] || null;
}

async function fetchExternalPatientProfile({ labId, phone }) {
  const cleanPhone = digitsOnly(phone);
  if (!cleanPhone) return null;

  const { data: apiConfig } = await supabase
    .from("labs_apis")
    .select("base_url, auth_details, templates")
    .eq("lab_id", labId)
    .eq("api_name", "external_patient_lookup")
    .maybeSingle();

  if (!apiConfig?.base_url || !apiConfig?.auth_details?.apikey) {
    return null;
  }

  const fieldMap = apiConfig.templates?.field_map || {
    name: "FNAME",
    dob: "DOB",
    gender: "SEX",
    email: "EMAIL",
    mrn: "MRN",
    external_key: "CREGNO"
  };

  const dataParam = encodeURIComponent(JSON.stringify([{ phone: cleanPhone }]));
  const url = `${apiConfig.base_url}&data=${dataParam}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiConfig.auth_details.apikey}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) return null;

  const payload = await response.json();
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.patients)
      ? payload.patients
      : payload
        ? [payload]
        : [];

  const first = rows[0];
  if (!first) return null;

  return {
    name: first[fieldMap.name]?.trim() || null,
    dob: first[fieldMap.dob] ? String(first[fieldMap.dob]).split(" ")[0] : null,
    gender: first[fieldMap.gender] ? String(first[fieldMap.gender]).trim() : null,
    email: first[fieldMap.email] || null,
    mrn: first[fieldMap.mrn] || null,
    external_key: first[fieldMap.external_key] || null
  };
}

function buildNext7Dates() {
  const list = [];
  const today = new Date();

  for (let i = 0; i < 7; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const iso = d.toISOString().slice(0, 10);
    const title = d.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short"
    });
    const description = i === 0 ? "Today" : i === 1 ? "Tomorrow" : "";

    list.push({ iso, title, description });
  }

  return list;
}

function getPackageCatalog() {
  const packages = Array.isArray(healthPackagesData?.packages)
    ? healthPackagesData.packages
    : [];
  return packages.map((pkg, packageIndex) => ({
    packageIndex,
    name: pkg?.name || "Package",
    description: pkg?.description || "",
    variants: Array.isArray(pkg?.variants) ? pkg.variants : []
  }));
}

function buildPackageMenuPage(packages, page = 1, pageSize = 9) {
  const safePage = Math.max(1, Number(page) || 1);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;
  const slice = packages.slice(start, end);
  return {
    page: safePage,
    hasMore: end < packages.length,
    rows: slice.map((pkg) => ({
      id: `PKG_${pkg.packageIndex}`,
      title: pkg.name,
      description: pkg.description
    }))
  };
}

function buildPackageVariantRows(selectedPackage) {
  const rows = (selectedPackage?.variants || []).map((variant, variantIndex) => ({
    id: `PKGV_${selectedPackage.packageIndex}_${variantIndex}`,
    title: variant?.name || `Variant ${variantIndex + 1}`,
    description:
      `${variant?.parameters || "-"} params • INR ${variant?.price || "-"}`
  }));

  rows.push({
    id: "PKG_BACK_LIST",
    title: "Back to Packages",
    description: "Choose another package"
  });

  return rows.slice(0, 10);
}

function formatPackageVariantMessage(selectedPackage, selectedVariant) {
  if (!selectedPackage || !selectedVariant) {
    return "Package details are unavailable right now. Please try again.";
  }

  const tests = Array.isArray(selectedVariant.tests) ? selectedVariant.tests : [];
  const topTests = tests.slice(0, 8);
  const moreCount = Math.max(0, tests.length - topTests.length);
  const testsText = topTests.length > 0
    ? topTests.map((test) => `- ${test}`).join("\n")
    : "- Test list currently unavailable";

  const extraText = moreCount > 0 ? `\n+ ${moreCount} more tests` : "";

  return [
    `*${selectedPackage.name}*`,
    `${selectedVariant.name}`,
    `Price: INR ${selectedVariant.price || "-"}`,
    `Parameters: ${selectedVariant.parameters || "-"}`,
    "",
    "Includes:",
    `${testsText}${extraText}`,
    "",
    "Reply *BOOK_HOME_VISIT* to book this package."
  ].join("\n");
}

async function fetchVisitTimeSlots() {
  const { data, error } = await supabase
    .from("visit_time_slots")
    .select("id, slot_name, start_time, end_time")
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(`Failed to load time slots: ${error.message}`);
  }

  return (data || []).map((slot) => ({
    id: slot.id,
    title: slot.slot_name || `${slot.start_time || ""} - ${slot.end_time || ""}`.trim(),
    description: slot.start_time && slot.end_time ? `${slot.start_time} - ${slot.end_time}` : ""
  }));
}

async function sendTeamWebhookNotification({ templates, eventType, payload }) {
  const webhookUrl =
    templates?.team_notify?.webhook_url ||
    templates?.bot_flow?.team_notify?.webhook_url ||
    null;

  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        payload,
        source: "labbit_whatsapp_bot",
        timestamp: new Date().toISOString()
      })
    });
  } catch (err) {
    console.error("❌ Team webhook notification failed:", err);
  }
}

// --------------------------------------------------
// 🔹 GET Handler (Webhook Verification Safe)
// --------------------------------------------------
export async function GET() {
  return new Response("WhatsApp Webhook Active", { status: 200 });
}

// --------------------------------------------------
// 🔹 POST Handler
// --------------------------------------------------
export async function POST(req) {
  try {

    const body = await req.json();
    console.log("📩 RAW WEBHOOK:", JSON.stringify(body));

    // --------------------------------------------------
    // 1️⃣ Extract Message Safely
    // --------------------------------------------------

    let message = null;

    if (body?.message) {
      message = {
        id: body.message.id,
        from: body.from,
        text:
          body.message.type === "text"
            ? { body: body.message.text }
            : null,
        interactive:
          body.message.type === "interactive"
            ? body.message.interactive
            : null
      };
    }

    if (!message && body?.messages?.length) {
      message = body.messages[0];
    }

    if (!message && body?.entry?.[0]?.changes?.[0]?.value?.messages?.length) {
      message = body.entry[0].changes[0].value.messages[0];
    }

    if (!message && body?.value?.messages?.length) {
      message = body.value.messages[0];
    }

    if (!message) {
      console.log("⚠️ No message found in webhook.");
      return Response.json({ success: true });
    }

    const messageId = message?.id;
    const rawPhone = message?.from;

    if (!messageId || !rawPhone) {
      console.log("⚠️ Missing messageId or phone.");
      return Response.json({ success: true });
    }

    // --------------------------------------------------
    // 2️⃣ Duplicate Protection
    // --------------------------------------------------

    const { data: existing } = await supabase
      .from("whatsapp_messages")
      .select("id")
      .eq("message_id", messageId)
      .maybeSingle();

    if (existing) {
      console.log("🔁 Duplicate ignored:", messageId);
      return Response.json({ success: true });
    }

    // --------------------------------------------------
    // 3️⃣ Extract User Input
    // --------------------------------------------------

    let userInput = null;

    if (message.text?.body) {
      userInput = message.text.body.trim();
    }

    if (message.interactive?.button_reply?.id) {
      userInput = message.interactive.button_reply.id;
    }

    if (message.interactive?.list_reply?.id) {
      userInput = message.interactive.list_reply.id;
    }

    if (!userInput) {
      console.log("⚠️ No usable user input.");
      return Response.json({ success: true });
    }

    // --------------------------------------------------
    // 4️⃣ Extract Country Code
    // --------------------------------------------------

    const match = rawPhone.match(/^\+(\d{1,3})/);
    const countryCode = match ? match[1] : null;

    const phone = toCanonicalPhone(rawPhone) || rawPhone;

    // --------------------------------------------------
    // 5️⃣ Get/Create Session
    // --------------------------------------------------

    const session = await getOrCreateSession(phone);

    if (!session.country_code) {
      await supabase
        .from("chat_sessions")
        .update({ country_code: countryCode })
        .eq("id", session.id);
    }

    // --------------------------------------------------
    // 6️⃣ Get Lab
    // --------------------------------------------------

    const { data: lab } = await supabase
      .from("labs")
      .select("*")
      .eq("id", session.lab_id)
      .single();

    if (!lab) {
      console.error("❌ Lab not found.");
      return Response.json({ success: true });
    }

    // --------------------------------------------------
    // 7️⃣ Patient Linking / Lead Creation
    // --------------------------------------------------

    let linkedBySession = null;
    if (session.patient_id) {
      const { data: existingLinked } = await supabase
        .from("patients")
        .select("id, name, is_lead")
        .eq("id", session.patient_id)
        .maybeSingle();
      linkedBySession = existingLinked || null;
    }

    const linkedByPhone = await findLocalPatientByPhone(phone);
    let linkedPatient = preferPatient(linkedByPhone, linkedBySession);

    if (!linkedPatient || linkedPatient?.is_lead) {
      const externalPatient = await fetchExternalPatientProfile({
        labId: session.lab_id,
        phone
      });

      if (externalPatient) {
        if (linkedPatient?.id && linkedPatient?.is_lead) {
          const { data: upgradedPatient } = await supabase
            .from("patients")
            .update({
              name: externalPatient.name || linkedPatient.name || body?.profile?.name || "Patient",
              dob: externalPatient.dob,
              gender: externalPatient.gender,
              email: externalPatient.email,
              mrn: externalPatient.mrn,
              is_lead: false
            })
            .eq("id", linkedPatient.id)
            .select("id, name, is_lead")
            .single();
          linkedPatient = upgradedPatient || linkedPatient;
        } else if (!linkedPatient) {
          const { data: createdPatient } = await supabase
            .from("patients")
            .insert({
              name: externalPatient.name || body?.profile?.name || "Patient",
              phone: digitsOnly(phone).slice(-10) || phone,
              dob: externalPatient.dob,
              gender: externalPatient.gender,
              email: externalPatient.email,
              mrn: externalPatient.mrn,
              is_lead: false
            })
            .select("id, name, is_lead")
            .single();
          linkedPatient = createdPatient || null;
        }

        if (linkedPatient?.id && externalPatient.external_key) {
          await supabase
            .from("patient_external_keys")
            .upsert(
              {
                patient_id: linkedPatient.id,
                lab_id: session.lab_id,
                external_key: externalPatient.external_key
              },
              { onConflict: "patient_id,lab_id" }
            );
        }
      }
    }

    if (!linkedPatient) {
      const { data: leadPatient } = await supabase
        .from("patients")
        .insert({
          name: body?.profile?.name || "WhatsApp Lead",
          phone: digitsOnly(phone).slice(-10) || phone,
          is_lead: true
        })
        .select("id, name, is_lead")
        .single();
      linkedPatient = leadPatient || null;
    }

    if (linkedPatient?.id) {
      await supabase
        .from("chat_sessions")
        .update({
          patient_id: linkedPatient.id,
          patient_name: linkedPatient.name || body?.profile?.name || null
        })
        .eq("id", session.id);
    }

    // --------------------------------------------------
    // 8️⃣ Log Inbound (Minimal Storage)
    // --------------------------------------------------

    await supabase.from("whatsapp_messages").insert({
      message_id: messageId,
      lab_id: session.lab_id,
      phone: phone,
      message: userInput,
      direction: "inbound",
      payload: null
    });

    // --------------------------------------------------
    // 9️⃣ Human Handoff Mode
    // --------------------------------------------------

    if (session.status === "handoff") {
      console.log("👤 In human handoff mode.");
      return Response.json({ success: true });
    }

    // --------------------------------------------------
    // 🔟 Process Bot Message
    // --------------------------------------------------

    const { data: waApiConfig } = await supabase
      .from("labs_apis")
      .select("templates")
      .eq("lab_id", session.lab_id)
      .eq("api_name", "whatsapp_outbound")
      .maybeSingle();

    const templates = parseTemplates(waApiConfig?.templates);
    const botFlowConfig = templates?.bot_flow || {};
    const feedbackUrl =
      botFlowConfig?.links?.feedback_url ||
      templates?.feedback_url ||
      null;
    const reportNotifyNumber =
      botFlowConfig?.report_notify_number ||
      templates?.report_notify_number ||
      lab.alternate_whatsapp_number ||
      lab.internal_whatsapp_number;

    const result = await processMessage(session, userInput, phone, { botFlowConfig });

    // --------------------------------------------------
    // 1️⃣1️⃣ Internal Notify
    // --------------------------------------------------

    if (result.replyType === "INTERNAL_NOTIFY") {
      if (reportNotifyNumber) {
        await sendTextMessage({
          labId: session.lab_id,
          phone: reportNotifyNumber,
          text: result.notifyText
        });
      } else {
        console.error("❌ No report notify number configured for lab:", session.lab_id);
      }

      if (result.notifyText?.startsWith("📄 Report Request")) {
        const requestedInput = (userInput || "").trim();

        try {
          const clickupResult = await createReportRequestClickupTask({
            labId: session.lab_id,
            patientPhone: phone,
            requestedInput
          });
          if (!clickupResult.ok && !clickupResult.skipped) {
            console.error("ClickUp report task failed:", clickupResult.error);
          }
        } catch (clickupErr) {
          console.error("Unexpected ClickUp report task error:", clickupErr);
        }

        await sendTeamWebhookNotification({
          templates,
          eventType: "report_request",
          payload: {
            labId: session.lab_id,
            patientPhone: phone,
            notifyText: result.notifyText
          }
        });
      }
    }

    // --------------------------------------------------
    // 1️⃣2️⃣ Update Session
    // --------------------------------------------------

    const nextContext = { ...(result.context || {}) };

    if (result.replyType === "BOOKING_DATE_MENU") {
      nextContext.available_dates = buildNext7Dates().reduce((acc, item) => {
        acc[item.iso] = item.title;
        return acc;
      }, {});
    }

    if (result.replyType === "BOOKING_SLOT_MENU") {
      try {
        const slots = await fetchVisitTimeSlots();
        nextContext.available_slots = slots.reduce((acc, slot) => {
          acc[String(slot.id)] = slot.title;
          return acc;
        }, {});
        if (!nextContext.slot_page || Number(nextContext.slot_page) < 1) {
          nextContext.slot_page = 1;
        }
      } catch (slotError) {
        console.error("❌ Time slot load failed:", slotError);
      }
    }

    await updateSession(session.id, result.newState, nextContext);

    // --------------------------------------------------
    // 1️⃣3️⃣ Send Reply
    // --------------------------------------------------

    switch (result.replyType) {

      case "MAIN_MENU":
        await sendMainMenu({ labId: session.lab_id, phone });
        break;

      case "MORE_SERVICES_MENU":
        await sendMoreServicesMenu({ labId: session.lab_id, phone });
        break;

      case "PACKAGE_MENU": {
        const catalog = getPackageCatalog();
        const menuPage = buildPackageMenuPage(catalog, nextContext.package_page || 1);
        if (menuPage.rows.length === 0) {
          await sendTextMessage({
            labId: session.lab_id,
            phone,
            text:
              botFlowConfig?.texts?.packages_unavailable ||
              "Package details are currently unavailable. Please try again later."
          });
          break;
        }

        await sendPackageMenu({
          labId: session.lab_id,
          phone,
          rows: menuPage.rows,
          page: menuPage.page,
          hasMore: menuPage.hasMore
        });
        break;
      }

      case "PACKAGE_VARIANT_MENU": {
        const catalog = getPackageCatalog();
        const selectedPackage = catalog.find(
          (pkg) => pkg.packageIndex === Number(nextContext.selected_package_index)
        );
        if (!selectedPackage) {
          await sendTextMessage({
            labId: session.lab_id,
            phone,
            text: "Unable to find this package. Please try Explore Packages again."
          });
          break;
        }

        await sendPackageVariantMenu({
          labId: session.lab_id,
          phone,
          packageName: selectedPackage.name,
          rows: buildPackageVariantRows(selectedPackage)
        });
        break;
      }

      case "PACKAGE_DETAILS_TEXT": {
        const catalog = getPackageCatalog();
        const selectedPackage = catalog.find(
          (pkg) => pkg.packageIndex === Number(nextContext.selected_package_index)
        );
        const selectedVariant =
          selectedPackage?.variants?.[Number(nextContext.selected_variant_index)] || null;

        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: formatPackageVariantMessage(selectedPackage, selectedVariant)
        });
        break;
      }

      case "SEND_LOCATION":
        await sendLocationMessage({
          labId: session.lab_id,
          phone,
          latitude: lab.latitude,
          longitude: lab.longitude,
          name: lab.name,
          address: lab.address
        });
        break;

      case "LOCATION_OPTIONS_MENU":
        await sendLocationOptionsMenu({
          labId: session.lab_id,
          phone
        });
        break;

      case "LOCATION_BRANCHES_MENU":
        await sendBranchLocationsMenu({
          labId: session.lab_id,
          phone
        });
        break;

      case "BRANCH_LOCATION_LINK": {
        const branchRows = templates?.whatsapp_menus?.branch_locations?.rows || [];
        const branchItem = branchRows.find((row) => row?.id === result.branchId);

        const messageText = branchItem?.url
          ? `${branchItem.title || "Branch location"}\n${branchItem.url}`
          : (botFlowConfig?.texts?.branch_location_fallback || "Branch location link is currently unavailable.");

        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: messageText
        });
        break;
      }

      case "LAB_ADDRESS_TEXT": {
        const addressText =
          botFlowConfig?.texts?.lab_address_text ||
          templates?.lab_address_text ||
          [lab.name, lab.address].filter(Boolean).join("\n");
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: addressText || "Address details are currently unavailable."
        });
        break;
      }

      case "LAB_TIMINGS_TEXT":
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text:
            botFlowConfig?.texts?.lab_timings_text ||
            templates?.lab_timings_text ||
            "Lab timings are currently unavailable."
        });
        break;

      case "SEND_LOCATION_AND_ADDRESS": {
        await sendLocationMessage({
          labId: session.lab_id,
          phone,
          latitude: lab.latitude,
          longitude: lab.longitude,
          name: lab.name,
          address: lab.address
        });

        const addressText =
          botFlowConfig?.texts?.lab_address_text ||
          templates?.lab_address_text ||
          [lab.name, lab.address].filter(Boolean).join("\n");
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: addressText || "Address details are currently unavailable."
        });
        break;
      }

      case "FEEDBACK_LINK": {
        const feedbackText = feedbackUrl
          ? (botFlowConfig?.texts?.feedback_redirect_text ||
            `We value your feedback ❤️\nPlease share it here: ${feedbackUrl}`)
          : (botFlowConfig?.texts?.feedback_fallback_text ||
            "Please share your feedback with our team. Feedback link is currently unavailable.");

        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: feedbackText
        });
        break;
      }

      case "BOOKING_DATE_MENU": {
        const dateOptions = buildNext7Dates();
        await sendBookingDateMenu({
          labId: session.lab_id,
          phone,
          dates: dateOptions
        });
        break;
      }

      case "BOOKING_SLOT_MENU": {
        let slotOptions = [];
        try {
          slotOptions = await fetchVisitTimeSlots();
        } catch (slotError) {
          console.error("❌ Time slot menu send failed:", slotError);
        }

        if (slotOptions.length === 0) {
          await sendTextMessage({
            labId: session.lab_id,
            phone,
            text:
              botFlowConfig?.texts?.booking_slot_fallback ||
              "Unable to load slot menu right now. Please type your preferred time slot."
          });
          break;
        }

        await sendBookingSlotMenu({
          labId: session.lab_id,
          phone,
          dateLabel: nextContext.selected_date || "selected date",
          timeSlots: slotOptions,
          page: nextContext.slot_page || 1
        });
        break;
      }

      case "CALL_QUICKBOOK":
        {
        const quickbookResponse = await fetch("https://lab.sdrc.in/api/quickbook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientName: body?.profile?.name || "WhatsApp User",
            phone,
            packageName: nextContext.tests,
            area: nextContext.area,
            date: nextContext.selected_date,
            timeslot: nextContext.selected_slot,
            persons: 1,
            whatsapp: true,
            agree: true
          })
        });

        if (quickbookResponse.ok) {
          await sendTextMessage({
            labId: session.lab_id,
            phone,
            text:
              result.replyText ||
              botFlowConfig?.texts?.booking_submitted_ack ||
              "Your booking request has been received. Our team will contact you shortly."
          });
        } else {
          const quickbookErrorText = await quickbookResponse.text();
          console.error("❌ Quickbook failed:", quickbookResponse.status, quickbookErrorText);

          await sendTextMessage({
            labId: session.lab_id,
            phone,
            text:
              botFlowConfig?.texts?.booking_submitted_failed ||
              "We could not submit your booking right now. Our team will contact you shortly."
          });
        }
        break;
        }

      case "HANDOFF":
        await handoffToHuman(session.id);
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: result.replyText
        });
        break;

      case "TEXT":
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: result.replyText
        });
        break;

      default:
        await sendMainMenu({ labId: session.lab_id, phone });
    }

    return Response.json({ success: true });

  } catch (err) {
    console.error("🚨 Webhook Error:", err);
    return Response.json({ success: false }, { status: 500 });
  }
}
