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

  const name = `[QuickBook] ${booking?.patient_name || "Patient"} · ${booking?.date || "No Date"} · ${booking?.timeslot || "No Slot"}`;
  const description = [
    "New quickbook request",
    `Source: ${source}`,
    `Booking ID: ${booking?.id || ""}`,
    `Patient: ${booking?.patient_name || ""}`,
    `Phone: ${booking?.phone || ""}`,
    `Package/Test: ${booking?.package_name || ""}`,
    `Area: ${booking?.area || ""}`,
    `Date: ${booking?.date || ""}`,
    `Time Slot: ${booking?.timeslot || ""}`,
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
