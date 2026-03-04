const CLICKUP_BASE_URL = "https://api.clickup.com/api/v2";

function getApiToken() {
  return process.env.CLICKUP_API_TOKEN || "";
}

function isEnabled() {
  return Boolean(getApiToken());
}

function safeText(value) {
  return (value ?? "").toString().trim();
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    safeText(value)
  );
}

function formatDateForTitle(dateValue) {
  const text = safeText(dateValue);
  if (!text) return "No Date";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata"
  });
}

async function createClickupTask({ listId, name, description, tags = [] }) {
  if (!isEnabled()) {
    return { ok: false, skipped: true, reason: "ClickUp token missing" };
  }

  if (!listId) {
    return { ok: false, skipped: true, reason: "ClickUp listId missing" };
  }

  const payload = {
    name: safeText(name) || "Untitled Task",
    description: safeText(description),
    tags: Array.isArray(tags) ? tags.filter(Boolean) : []
  };

  const response = await fetch(`${CLICKUP_BASE_URL}/list/${listId}/task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getApiToken()
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  let body;

  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: body?.err || body?.error || raw || `ClickUp error ${response.status}`
    };
  }

  return { ok: true, task: body };
}

export async function createQuickbookClickupTask({ booking, source = "quickbook" }) {
  const listId = process.env.CLICKUP_LIST_ID_QUICKBOOK || process.env.CLICKUP_LIST_ID_DEFAULT || "";

  const rawSlotText = booking?.timeslot_label || booking?.timeslot || "";
  const slotText =
    isUuidLike(rawSlotText) || !safeText(rawSlotText)
      ? "Slot TBD"
      : safeText(rawSlotText);
  const titleDate = formatDateForTitle(booking?.date);
  const areaText = safeText(booking?.area);
  const name = `[QuickBook] ${booking?.patient_name || "Patient"} · ${titleDate} · ${slotText}${areaText ? ` · ${areaText}` : ""}`;

  const descDate = safeText(booking?.date) || "Not provided";
  const descSlot = safeText(rawSlotText) || "Not provided";
  const description = [
    "New quickbook request",
    `Source: ${source}`,
    `Booking ID: ${booking?.id || ""}`,
    `Patient: ${safeText(booking?.patient_name) || "Not provided"}`,
    `Phone: ${safeText(booking?.phone) || "Not provided"}`,
    `Package/Test: ${safeText(booking?.package_name) || "Not provided"}`,
    `Area: ${areaText || "Not provided"}`,
    `Date: ${descDate}`,
    `Time Slot: ${descSlot}`,
    `Persons: ${booking?.persons ?? ""}`,
    `WhatsApp Consent: ${booking?.whatsapp ? "Yes" : "No"}`
  ].join("\n");

  return createClickupTask({
    listId,
    name,
    description,
    tags: ["quickbook", "whatsapp"]
  });
}

export async function createReportRequestClickupTask({ labId, patientPhone, requestedInput }) {
  const listId = process.env.CLICKUP_LIST_ID_REPORTS || process.env.CLICKUP_LIST_ID_DEFAULT || "";

  const name = `[Report Request] ${patientPhone || "Unknown"}`;
  const description = [
    "Patient requested report via WhatsApp bot",
    `Lab ID: ${labId || ""}`,
    `Patient Phone: ${patientPhone || ""}`,
    `Input provided: ${requestedInput || ""}`
  ].join("\n");

  return createClickupTask({
    listId,
    name,
    description,
    tags: ["reports", "whatsapp"]
  });
}

export async function createDoctorsConnectClickupTask({ labId, patientPhone, notes }) {
  const listId = process.env.CLICKUP_LIST_ID_DOCTORS_CONNECT || process.env.CLICKUP_LIST_ID_DEFAULT || "";

  const name = `[Doctors Connect] ${patientPhone || "Unknown"}`;
  const description = [
    "Patient requested doctors connect",
    `Lab ID: ${labId || ""}`,
    `Patient Phone: ${patientPhone || ""}`,
    `Notes: ${notes || ""}`
  ].join("\n");

  return createClickupTask({
    listId,
    name,
    description,
    tags: ["doctors-connect", "whatsapp"]
  });
}

export async function createWhatsappFollowupClickupTask({ labId, patientPhone, notes }) {
  const listId = process.env.CLICKUP_LIST_ID_WHATSAPP || process.env.CLICKUP_LIST_ID_DEFAULT || "";

  const name = `[WhatsApp Follow-up] ${patientPhone || "Unknown"}`;
  const description = [
    "Agent created WhatsApp follow-up task",
    `Lab ID: ${labId || ""}`,
    `Patient Phone: ${patientPhone || ""}`,
    `Notes: ${notes || ""}`
  ].join("\n");

  return createClickupTask({
    listId,
    name,
    description,
    tags: ["whatsapp", "follow-up"]
  });
}
