// WhatsApp/Meta delivery error codes -> staff-readable messages, replacing the
// raw "WA_DELIVERY_FAILED: <code> <title>" string report_auto_dispatch_jobs.last_error
// carries verbatim (set by app/api/whatsapp/webhook/route.js's delivery-status
// callback handler). User, 2026-09-09, on seeing "131026 Message undeliverable"
// surfaced as-is: "surface that message that their number isnt on whatsapp
// instead of the code... do that overall for any code coming through."
const WA_DELIVERY_ERROR_MESSAGES = {
  131026: "Patient's number doesn't have WhatsApp",
  131047: "Patient hasn't messaged us in 24h -- re-engagement required before we can send",
  131049: "Blocked by WhatsApp's engagement limit for this number (protects users from unwanted business messages)",
  131050: "Patient has stopped receiving messages from us on WhatsApp (blocked or opted out)",
  131053: "We couldn't attach the report PDF -- retry should recover once it's generated",
};

export function humanizeDeliveryError(lastError) {
  const raw = String(lastError || "").trim();
  if (!raw) return "";
  const waMatch = raw.match(/^WA_DELIVERY_FAILED:\s*(\d+)\s*(.*)$/i);
  if (waMatch) {
    const code = Number(waMatch[1]);
    const mapped = WA_DELIVERY_ERROR_MESSAGES[code];
    if (mapped) return mapped;
    const title = waMatch[2].trim();
    return title ? `WhatsApp delivery failed: ${title} (code ${code})` : `WhatsApp delivery failed (code ${code})`;
  }
  if (raw.toUpperCase() === "INVALID_PHONE") return "Phone number isn't a valid format";
  if (/report pdf was not found/i.test(raw)) return "Report PDF wasn't available yet";
  return raw;
}
