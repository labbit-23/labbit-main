import { supabase } from "@/lib/supabaseServer";
import {
  getOrCreateSession,
  updateSession,
  handoffToHuman
} from "@/lib/whatsapp/sessions";
import { detectIntent, processMessage } from "@/lib/whatsapp/engine";
import { getReportStatus } from "@/lib/neosoft/client";
import {
  createReportRequestClickupTask,
  createWhatsappFollowupClickupTask
} from "@/lib/clickup";
import {
  sendTextMessage,
  sendDocumentMessage,
  sendMainMenu,
  sendMoreServicesMenu,
  sendReportInputPrompt,
  sendReportPostDownloadMenu,
  sendReportSelectionMenu,
  sendLocationMessage,
  sendLocationOptionsMenu,
  sendBranchLocationsMenu,
  sendBookingDateMenu,
  sendBookingSlotMenu,
  sendBookingLocationMenu,
  sendPackageMenu,
  sendPackageVariantMenu
} from "@/lib/whatsapp/sender";
import healthPackagesData from "@/lib/data/health-packages.json";
import { digitsOnly, phoneVariantsIndia, toCanonicalIndiaPhone } from "@/lib/phone";

const BOT_START_KEYWORDS = new Set([
  "HI",
  "HAI",
  "HELLO",
  "HEY",
  "HII",
  "HLO",
  "MAIN_MENU",
  "MAIN MENU",
  "MENU",
  "REQUEST_REPORTS",
  "BOOK_HOME_VISIT",
  "MORE_SERVICES"
]);

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

function getIncomingProfileName(body) {
  const candidates = [
    body?.profile?.name,
    body?.contacts?.[0]?.profile?.name,
    body?.value?.contacts?.[0]?.profile?.name,
    body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name
  ];
  return candidates.find((name) => typeof name === "string" && name.trim())?.trim() || null;
}

function normalizePhoneVariants(rawPhone) {
  return phoneVariantsIndia(rawPhone);
}

function getInboundMedia(message) {
  const image = message?.image || null;
  if (image) {
    const url = image.link || image.url || image.image_url || null;
    const urlSource = image.link
      ? "link"
      : image.url
        ? "url"
        : image.image_url
          ? "image_url"
          : null;
    return {
      type: "image",
      url,
      urlSource,
      mimeType: image.mime_type || "image/jpeg",
      id: image.id || null,
      filename: null
    };
  }

  const document = message?.document || null;
  if (document) {
    const url = document.link || document.url || document.document_url || null;
    const urlSource = document.link
      ? "link"
      : document.url
        ? "url"
        : document.document_url
          ? "document_url"
          : null;
    return {
      type: "document",
      url,
      urlSource,
      mimeType: document.mime_type || "application/octet-stream",
      id: document.id || null,
      filename: document.filename || "prescription"
    };
  }

  return null;
}

function fileExtFromMime(mime = "", fallback = "bin") {
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf"
  };
  return map[String(mime).toLowerCase()] || fallback;
}

async function persistPrescriptionMedia({ inboundMedia, labId, phone }) {
  if (!inboundMedia?.url) return null;

  try {
    const response = await fetch(inboundMedia.url);
    if (!response.ok) return inboundMedia.url;

    const fileBuffer = await response.arrayBuffer();
    const ext =
      (inboundMedia.filename && String(inboundMedia.filename).split(".").pop()) ||
      fileExtFromMime(inboundMedia.mimeType, "bin");
    const safePhone = digitsOnly(phone).slice(-10) || "unknown";
    const filePath = `prescriptions/whatsapp/${labId}/${safePhone}_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("uploads")
      .upload(filePath, fileBuffer, {
        contentType: inboundMedia.mimeType || "application/octet-stream",
        upsert: false
      });

    if (uploadError) return inboundMedia.url;
    return `uploads/${filePath}`;
  } catch {
    return inboundMedia.url;
  }
}

function shouldPersistInboundMedia() {
  return String(process.env.WHATSAPP_PERSIST_INBOUND_MEDIA || "").toLowerCase() === "true";
}

async function resolveMediaUrlById({ mediaId, mediaFetchConfig, authDetails }) {
  if (!mediaId || !mediaFetchConfig?.url) return null;

  const method = String(mediaFetchConfig.method || "GET").toUpperCase();
  const rawHeaders = mediaFetchConfig.headers && typeof mediaFetchConfig.headers === "object"
    ? mediaFetchConfig.headers
    : {};
  const headers = { ...rawHeaders };

  const apiKey = authDetails?.api_key || authDetails?.apikey || null;
  if (apiKey) {
    headers[mediaFetchConfig.api_key_header || "X-API-KEY"] = apiKey;
  }

  const bearerToken = mediaFetchConfig.bearer_token || authDetails?.bearer_token || null;
  if (bearerToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  const url = String(mediaFetchConfig.url)
    .replace("{media_id}", encodeURIComponent(String(mediaId)));

  const response = await fetch(url, { method, headers });
  if (!response.ok) return null;

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    return null;
  }

  return (
    body?.url ||
    body?.link ||
    body?.media_url ||
    body?.download_url ||
    body?.data?.url ||
    body?.data?.link ||
    body?.result?.url ||
    null
  );
}

function shouldActivateBotFromStart({ session, message, userInput, inboundMedia }) {
  const state = session?.current_state || "START";
  if (state !== "START") return true;

  // Interactive replies are deliberate bot interactions and should always continue.
  if (message?.interactive?.button_reply?.id || message?.interactive?.list_reply?.id) {
    return true;
  }

  // Location pin flow should always continue.
  if (message?.location?.latitude && message?.location?.longitude) {
    return true;
  }

  // Media-first user messages should also enter bot flow.
  if (inboundMedia) {
    return true;
  }

  const normalized = String(userInput || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

  if (BOT_START_KEYWORDS.has(normalized)) {
    return true;
  }

  return Boolean(detectIntent(userInput));
}

function shouldResumeBotFromHandoff({ message, userInput }) {
  if (message?.interactive?.button_reply?.id || message?.interactive?.list_reply?.id) {
    return true;
  }

  const normalized = String(userInput || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

  if (["HI", "HII", "HAI", "HELLO", "HEY", "MENU", "MAIN MENU", "MAIN_MENU"].includes(normalized)) {
    return true;
  }

  return /^(hi|hii|hai|hello|hey|menu)\b/i.test(String(userInput || "").trim());
}

async function isReachablePdfDocument(url) {
  if (!url) return false;

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      console.warn("[pdf-preflight] non-ok response", {
        url,
        status: response.status,
        statusText: response.statusText
      });
      return false;
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/pdf")) {
      console.log("[pdf-preflight] accepted by content-type", {
        url,
        contentType,
        contentLength: response.headers.get("content-length"),
        contentDisposition: response.headers.get("content-disposition")
      });
      return true;
    }

    const contentDisposition = String(response.headers.get("content-disposition") || "").toLowerCase();
    if (contentDisposition.includes(".pdf")) {
      console.log("[pdf-preflight] accepted by content-disposition", {
        url,
        contentType,
        contentLength: response.headers.get("content-length"),
        contentDisposition
      });
      return true;
    }

    const bodyBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(bodyBuffer);
    const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
    const startsLikePdf = pdfSignature.every((byte, index) => bytes[index] === byte);
    if (startsLikePdf) {
      console.log("[pdf-preflight] accepted by file signature", {
        url,
        contentType,
        contentLength: response.headers.get("content-length"),
        firstBytes: Array.from(bytes.slice(0, 8))
      });
      return true;
    }

    console.warn("[pdf-preflight] rejected response", {
      url,
      contentType,
      contentLength: response.headers.get("content-length"),
      contentDisposition,
      firstBytes: Array.from(bytes.slice(0, 16))
    });
    return false;
  } catch (error) {
    console.error("[pdf-preflight] fetch failed", {
      url,
      error: error?.message || String(error)
    });
    return false;
  }
}

function getStatusRowValue(row, ...keys) {
  if (!row || typeof row !== "object") return null;

  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const lowerKey = String(key).toLowerCase();
    const match = Object.keys(row).find((candidate) => String(candidate).toLowerCase() === lowerKey);
    if (match && row[match] !== undefined && row[match] !== null) {
      return row[match];
    }
  }

  return null;
}

function getPendingLabTestNames(reportStatus) {
  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];

  return tests
    .filter((row) => {
      const groupId = String(getStatusRowValue(row, "GROUPID", "groupid") || "").trim();
      const approvalFlag = String(getStatusRowValue(row, "APPROVEDFLG", "approvedflg") || "").trim();
      const status = String(getStatusRowValue(row, "REPORT_STATUS", "report_status") || "").trim();
      return groupId === "GDEP0001" && approvalFlag !== "1" && status !== "LAB_READY";
    })
    .map((row) => String(getStatusRowValue(row, "TESTNM", "testnm", "test_name", "TEST_NAME") || "").trim())
    .filter(Boolean);
}

function buildReportStatusMessage(reportStatus) {
  if (!reportStatus || typeof reportStatus !== "object") return null;

  const overallStatus = String(reportStatus.overall_status || "").trim();
  const labTotal = Number(reportStatus.lab_total || 0);
  const radiologyTotal = Number(reportStatus.radiology_total || 0);
  const radiologyReady = Number(reportStatus.radiology_ready || 0);
  const pendingLabTests = getPendingLabTestNames(reportStatus);
  const lines = [];

  switch (overallStatus) {
    case "FULL_REPORT":
      lines.push("Lab report status: All lab reports are ready.");
      break;
    case "PARTIAL_REPORT":
      lines.push("Lab report status: Partial lab reports are ready.");
      if (pendingLabTests.length > 0) {
        lines.push("");
        lines.push("Pending lab tests:");
        for (const testName of pendingLabTests) {
          lines.push(`- ${testName}`);
        }
      }
      lines.push("");
      lines.push("This PDF includes only the lab reports that are ready now. Please download again later for the full lab PDF once all pending lab reports are ready.");
      break;
    case "NO_REPORT":
      lines.push("Lab report status: Lab reports are not ready yet.");
      break;
    case "NO_LAB_TESTS":
      if (radiologyTotal > 0) {
        lines.push("Lab report status: No lab reports are available for this requisition.");
      } else if (labTotal === 0) {
        return null;
      }
      break;
    default:
      return null;
  }

  if (radiologyTotal > 0) {
    lines.push("");
    if (radiologyReady >= radiologyTotal) {
      lines.push("Radiology status: Radiology reports are ready.");
    } else if (radiologyReady > 0) {
      lines.push(`Radiology status: ${radiologyReady} of ${radiologyTotal} radiology reports are ready.`);
    } else {
      lines.push("Radiology status: Radiology reports are not ready yet.");
    }
    lines.push("This bot sends lab reports only. Radiology reports are usually shared by the lab separately on request.");
  }

  return lines.join("\n").trim() || null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    .select("id, name, phone, email, dob, gender, mrn, is_lead, created_at")
    .in("phone", variants)
    .limit(10);

  const patients = [...(rows || [])].sort(
    (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
  );
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
    minPrice: (() => {
      const variantPrices = (Array.isArray(pkg?.variants) ? pkg.variants : [])
        .map((v) => Number(v?.price))
        .filter((v) => Number.isFinite(v) && v > 0);
      if (variantPrices.length === 0) return null;
      return Math.min(...variantPrices);
    })(),
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
      description: pkg.minPrice
        ? `Starts INR ${pkg.minPrice}`
        : (pkg.description || "View package details")
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

async function ensureChatSessionForPhone({ labId, phone }) {
  const canonical = toCanonicalIndiaPhone(phone) || phone;
  const variants = phoneVariantsIndia(canonical);

  const { data: existingRows } = await supabase
    .from("chat_sessions")
    .select("id")
    .in("phone", variants)
    .eq("lab_id", labId)
    .order("created_at", { ascending: false })
    .limit(1);

  const existing = existingRows?.[0];
  if (existing?.id) {
    await supabase
      .from("chat_sessions")
      .update({
        phone: canonical,
        last_message_at: new Date(),
        updated_at: new Date()
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: created } = await supabase
    .from("chat_sessions")
    .insert({
      phone: canonical,
      lab_id: labId,
      current_state: "HUMAN_HANDOVER",
      status: "active",
      last_message_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    })
    .select("id")
    .single();

  return created?.id || null;
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
    "Reply *BOOK_HOME_VISIT* to book this package.",
    "See all packages: https://sdrc.in/packages.php"
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
    description: slot.start_time && slot.end_time ? `${slot.start_time} - ${slot.end_time}` : "",
    start_time: slot.start_time || null   // ← add this
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
    const profileName = getIncomingProfileName(body);
    console.log("📩 RAW WEBHOOK:", JSON.stringify(body));

    // --------------------------------------------------
    // 1️⃣ Extract Message Safely
    // --------------------------------------------------

    let message = null;

    if (body?.message) {
      // Preserve full message object so media/location payloads are not dropped.
      message = {
        ...body.message,
        id: body.message.id || body.message.message_id || null,
        from: body.from || body.message.from || null,
        text:
          body.message.type === "text"
            ? { body: body.message.text || body.message?.text?.body || "" }
            : body.message.text || null,
        interactive:
          body.message.type === "interactive"
            ? body.message.interactive
            : body.message.interactive || null
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
    const messageTimestamp =
      message?.timestamp && Number.isFinite(Number(message.timestamp))
        ? Number(message.timestamp)
        : null;

    if (!messageId || !rawPhone) {
      console.log("⚠️ Missing messageId or phone.");
      return Response.json({ success: true });
    }

    // --------------------------------------------------
    // 2️⃣ Duplicate Protection
    // --------------------------------------------------

    const { data: existing } = await supabase
      .from("whatsapp_messages")
      .select("id, created_at, lab_id, phone")
      .eq("message_id", messageId)
      .maybeSingle();

    if (existing) {
      const inboundCreatedAt = existing?.created_at ? new Date(existing.created_at) : null;
      const duplicateAgeMs =
        inboundCreatedAt && !Number.isNaN(inboundCreatedAt.getTime())
          ? Date.now() - inboundCreatedAt.getTime()
          : Number.POSITIVE_INFINITY;

      let hasOutboundAfterInbound = false;
      if (existing?.lab_id && existing?.phone && inboundCreatedAt) {
        const { data: outboundAfter } = await supabase
          .from("whatsapp_messages")
          .select("id")
          .eq("lab_id", existing.lab_id)
          .eq("phone", existing.phone)
          .eq("direction", "outbound")
          .gte("created_at", inboundCreatedAt.toISOString())
          .limit(1);
        hasOutboundAfterInbound = Boolean(outboundAfter?.length);
      }

      if (hasOutboundAfterInbound) {
        console.log("🔁 Duplicate ignored (already responded):", messageId);
        return Response.json({ success: true });
      }

      // If duplicate arrived immediately, first request is likely still processing.
      if (duplicateAgeMs < 20_000) {
        console.log("🔁 Duplicate ignored (in-flight):", messageId);
        return Response.json({ success: true });
      }

      // Replay stalled inbound processing if earlier run logged inbound but never responded.
      console.log("♻️ Replaying stalled inbound:", messageId);
    }

    // --------------------------------------------------
    // 3️⃣ Extract User Input
    // --------------------------------------------------

    let userInput = null;
    let inboundLocation = null;
    let inboundMedia = getInboundMedia(message);

    if (message.text?.body) {
      userInput = message.text.body.trim();
    }

    if (message.interactive?.button_reply?.id) {
      userInput = message.interactive.button_reply.id;
    }

    if (message.interactive?.list_reply?.id) {
      userInput = message.interactive.list_reply.id;
    }

    if (message.location?.latitude && message.location?.longitude) {
      userInput = "__LOCATION_PIN__";
      inboundLocation = {
        latitude: message.location.latitude,
        longitude: message.location.longitude,
        name: message.location.name || null,
        address: message.location.address || null
      };
    }

    if (!userInput && inboundMedia) {
      userInput = "__MEDIA__";
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

    const phone = toCanonicalIndiaPhone(rawPhone) || rawPhone;

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

    const { data: waApiConfig } = await supabase
      .from("labs_apis")
      .select("templates, auth_details")
      .eq("lab_id", session.lab_id)
      .eq("api_name", "whatsapp_outbound")
      .maybeSingle();

    const templates = parseTemplates(waApiConfig?.templates);
    const mediaResolverConfig = templates?.media_fetch || templates?.media_resolver || null;
    const mediaResolverAuth = waApiConfig?.auth_details || {};

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
              name: externalPatient.name || linkedPatient.name || profileName || "Patient",
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
              name: externalPatient.name || profileName || "Patient",
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
          name: profileName || "WhatsApp Lead",
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
          // Keep UI display aligned with latest WhatsApp identity when available.
          patient_name: profileName || session.patient_name || null
        })
        .eq("id", session.id);
    }

    if (inboundMedia?.id && !inboundMedia?.url && mediaResolverConfig) {
      try {
        const resolvedUrl = await resolveMediaUrlById({
          mediaId: inboundMedia.id,
          mediaFetchConfig: mediaResolverConfig,
          authDetails: mediaResolverAuth
        });
        if (resolvedUrl) {
          inboundMedia = {
            ...inboundMedia,
            url: resolvedUrl,
            urlSource: "resolved_by_id"
          };
          console.log(
            "📎 MTALKZ_MEDIA resolved_by_id:",
            JSON.stringify({
              messageId,
              mediaId: inboundMedia.id,
              resolvedUrl
            })
          );
        } else {
          console.log(
            "📎 MTALKZ_MEDIA resolve_by_id_failed:",
            JSON.stringify({
              messageId,
              mediaId: inboundMedia.id,
              reason: "empty_resolver_response"
            })
          );
        }
      } catch (resolveErr) {
        console.log(
          "📎 MTALKZ_MEDIA resolve_by_id_error:",
          JSON.stringify({
            messageId,
            mediaId: inboundMedia.id,
            error: resolveErr?.message || "resolver_error"
          })
        );
      }
    }

    if (inboundMedia) {
      console.log(
        "📎 MTALKZ_MEDIA extracted:",
        JSON.stringify({
          messageId,
          type: inboundMedia.type || null,
          id: inboundMedia.id || null,
          url: inboundMedia.url || null,
          urlSource: inboundMedia.urlSource || null
        })
      );
    }

    // Preserve upstream media links (especially Mtalkz `link`) to avoid replacing with uploaded paths.
    const canPersistToStorage =
      inboundMedia?.url &&
      shouldPersistInboundMedia() &&
      inboundMedia.urlSource !== "link";

    if (canPersistToStorage) {
      const persistedUrl = await persistPrescriptionMedia({
        inboundMedia,
        labId: session.lab_id,
        phone
      });
      inboundMedia = { ...inboundMedia, url: persistedUrl || inboundMedia.url || null };
      console.log(
        "📎 MTALKZ_MEDIA storage-persist:",
        JSON.stringify({
          messageId,
          persistedUrl: inboundMedia.url || null
        })
      );
    } else if (inboundMedia?.url) {
      console.log(
        "📎 MTALKZ_MEDIA link-persist:",
        JSON.stringify({
          messageId,
          keptUrl: inboundMedia.url,
          reason:
            inboundMedia.urlSource === "link"
              ? "upstream_link"
              : "storage_persist_disabled"
        })
      );
    }

    // --------------------------------------------------
    // 8️⃣ Log Inbound (Minimal Storage)
    // --------------------------------------------------

    if (!existing) {
      await supabase.from("whatsapp_messages").insert({
        message_id: messageId,
        lab_id: session.lab_id,
        phone: phone,
        name: profileName || null,
        message: userInput,
        direction: "inbound",
        payload: {
          raw_message: message,
          raw_body: body,
          ...(profileName ? { profile_name: profileName } : {}),
          ...(inboundMedia
            ? {
                media: {
                  type: inboundMedia.type,
                  id: inboundMedia.id || null,
                  url: inboundMedia.url || null,
                  url_source: inboundMedia.urlSource || null,
                  filename: inboundMedia.filename || null
                }
              }
            : {})
        }
      });
    }

    if (inboundMedia) {
      console.log(
        "📎 MTALKZ_MEDIA logged:",
        JSON.stringify({
          messageId,
          savedUrl: inboundMedia.url || null,
          savedType: inboundMedia.type || null
        })
      );
    }

    let normalizedSessionStatus = String(session.status || "").toLowerCase();

    if (["handoff", "pending"].includes(normalizedSessionStatus) &&
      shouldResumeBotFromHandoff({ message, userInput })) {
      session.status = "active";
      session.current_state = "START";
      session.context = {};
      normalizedSessionStatus = "active";
      console.log("🤖 Resuming bot from human handoff mode.");
    }

    const botShouldHandleStart = shouldActivateBotFromStart({
      session,
      message,
      userInput,
      inboundMedia
    });
    const isAgentQueueStatus = ["handoff", "pending"].includes(normalizedSessionStatus);
    const shouldIncrementUnread =
      normalizedSessionStatus !== "closed" &&
      (isAgentQueueStatus || !botShouldHandleStart);
    if (shouldIncrementUnread) {
      const touchedAt = new Date();
      await supabase
        .from("chat_sessions")
        .update({
          last_message_at: touchedAt.toISOString(),
          last_user_message_at: touchedAt.toISOString(),
          unread_count: (session.unread_count || 0) + 1,
          updated_at: touchedAt.toISOString()
        })
        .eq("id", session.id);
    }

    // --------------------------------------------------
    // 9️⃣ Human Handoff Mode
    // --------------------------------------------------

    if (["handoff", "pending"].includes(normalizedSessionStatus)) {
      {
      console.log("👤 In human handoff mode.");
      return Response.json({ success: true });
      }
    }

    // --------------------------------------------------
    // 🔟 Process Bot Message
    // --------------------------------------------------

    const botFlowConfig = templates?.bot_flow || {};
    const packageCatalog = getPackageCatalog();
    const feedbackUrl =
      botFlowConfig?.links?.feedback_url ||
      templates?.feedback_url ||
      null;
    const reportNotifyNumber =
      botFlowConfig?.report_notify_number ||
      templates?.report_notify_number ||
      lab.alternate_whatsapp_number ||
      lab.internal_whatsapp_number;

    if (!botShouldHandleStart) {
      // Route non-menu free-form messages to executive attention queue.
      // Avoid sending the same wait message repeatedly once a chat is already in manual handling statuses.
      const statusNow = normalizedSessionStatus;
      const isAlreadyManualMode = ["handoff", "pending", "resolved", "closed"].includes(statusNow);
      if (!isAlreadyManualMode) {
        await handoffToHuman(session.id);
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text:
            botFlowConfig?.texts?.wait_for_executive_text ||
            "Thanks for your message. Please wait, our executive will reach out to help you shortly."
        });
      }
      return Response.json({ success: true });
    }

    let result = await processMessage(session, userInput, phone, {
      botFlowConfig,
      inboundLocation,
      inboundMedia,
      selectedReportTitle: message?.interactive?.list_reply?.title || null,
      packageCatalog
    });

    if (result.replyType === "SEND_DOCUMENT") {
      const isPdfAvailable = await isReachablePdfDocument(result.documentUrl);

      if (!isPdfAvailable) {
        result = {
          replyType: "INTERNAL_NOTIFY",
          notifyText: [
            "📄 Report Request",
            `Phone: ${phone}`,
            `Input: ${result.fallbackRequestedInput || "Requested PDF not available"}`
          ].join("\n"),
          replyText:
            botFlowConfig?.texts?.report_request_ack ||
            "Thank you. Our team will verify and send your report shortly.",
          newState: "START",
          context: {}
        };
      }
    }

    // --------------------------------------------------
    // 1️⃣1️⃣ Internal Notify
    // --------------------------------------------------

    if (result.replyType === "INTERNAL_NOTIFY") {
      if (reportNotifyNumber) {
        await ensureChatSessionForPhone({
          labId: session.lab_id,
          phone: reportNotifyNumber
        });
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

      if (result.notifyText?.startsWith("📞 Callback Request")) {
        try {
          const clickupResult = await createWhatsappFollowupClickupTask({
            labId: session.lab_id,
            patientPhone: phone,
            notes: result.notifyText
          });
          if (!clickupResult.ok && !clickupResult.skipped) {
            console.error("ClickUp callback task failed:", clickupResult.error);
          }
        } catch (clickupErr) {
          console.error("Unexpected ClickUp callback task error:", clickupErr);
        }

        await sendTeamWebhookNotification({
          templates,
          eventType: "callback_request",
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
        if (result.context?.slot_page) {
          nextContext.slot_page = Number(result.context.slot_page);
        } else if (!nextContext.slot_page || Number(nextContext.slot_page) < 1) {
          nextContext.slot_page = 1;
        }
      } catch (slotError) {
        console.error("❌ Time slot load failed:", slotError);
      }
    }

    if (result.replyType === "PACKAGE_DETAILS_TEXT") {
      const catalog = getPackageCatalog();
      const selectedPackage = catalog.find(
        (pkg) => pkg.packageIndex === Number(nextContext.selected_package_index)
      );
      const selectedVariant =
        selectedPackage?.variants?.[Number(nextContext.selected_variant_index)] || null;

      if (selectedPackage && selectedVariant) {
        nextContext.last_explored_package_name = `${selectedPackage.name} - ${selectedVariant.name}`;
        nextContext.tests = nextContext.last_explored_package_name;
      }
    }

    await updateSession(session.id, result.newState, nextContext, messageTimestamp);

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

      case "REPORT_INPUT_PROMPT":
        await sendReportInputPrompt({ labId: session.lab_id, phone });
        break;

      case "REPORT_SELECTION_MENU":
        nextContext.reports = result.reports;
        await sendReportSelectionMenu({
          labId: session.lab_id,
          phone,
          reports: result.reports
        });
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

        // Hide past slots if booking for today (+30 min buffer)
        const selectedDateIso = nextContext.selected_date_iso;
        const todayIso = new Date().toISOString().slice(0,10);

        if (selectedDateIso === todayIso) {

          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes() + 30;

          slotOptions = slotOptions.filter(slot => {

            const [h,m] = slot.start_time.split(":");
            const slotMinutes = Number(h) * 60 + Number(m);

            return slotMinutes > currentMinutes;

          });

        }

        if (slotOptions.length === 0) {
          await sendTextMessage({
            labId: session.lab_id,
            phone,
            text: "No slots are available today. Please select another date."
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

      case "BOOKING_LOCATION_MENU":
        await sendBookingLocationMenu({
          labId: session.lab_id,
          phone
        });
        break;

      case "CALL_QUICKBOOK":
        {
        const inferredPackageName =
          nextContext.tests ||
          nextContext.last_explored_package_name ||
          null;
        const inferredArea =
          nextContext.area ||
          nextContext.location_text ||
          nextContext.location_address ||
          "Not provided";

        const quickbookResponse = await fetch("https://lab.sdrc.in/api/quickbook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientName: profileName || "WhatsApp User",
            phone,
            packageName: inferredPackageName,
            area: inferredArea,
            date: nextContext.selected_date_iso || nextContext.selected_date,
            timeslot: nextContext.selected_slot_id || nextContext.selected_slot,
            persons: 1,
            whatsapp: true,
            agree: true,
            location_source: nextContext.location_source || null,
            location_text: nextContext.location_text || null,
            location_name: nextContext.location_name || null,
            location_address: nextContext.location_address || null,
            location_lat: nextContext.location_lat || null,
            location_lng: nextContext.location_lng || null,
            prescription: nextContext.prescription || null
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

      case "SEND_DOCUMENT":
        await sendDocumentMessage({
          labId: session.lab_id,
          phone,
          documentUrl: result.documentUrl,
          filename: result.filename
        });
        if (result.reportStatusReqno) {
          try {
            const reportStatus = await getReportStatus(result.reportStatusReqno);
            const statusMessage = buildReportStatusMessage(reportStatus);
            if (statusMessage) {
              await sendTextMessage({
                labId: session.lab_id,
                phone,
                text: statusMessage
              });
            }
          } catch (error) {
            console.error("[report-status] follow-up send failed", {
              reqno: result.reportStatusReqno,
              error: error?.message || String(error)
            });
          }
        }
        if (result.sendReportActionsMenu) {
          await wait(4000);
          await sendReportPostDownloadMenu({
            labId: session.lab_id,
            phone
          });
        }
        break;

      case "TEXT":
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: result.replyText
        });
        break;

      case "INTERNAL_NOTIFY":
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text:
            result.replyText ||
            botFlowConfig?.texts?.report_request_ack ||
            "Thank you. Our team will verify and send your report shortly."
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
