// Creates a staff-visible lead through the existing labit-core website-enquiry bridge (same endpoint/credentials as
// lib/labitCoreEnquiry.js). Returns the enquiry id, or null when the bridge is not configured / refuses.
export async function submitBotEnquiry({ phone, name, item, campaign, mrn }) {
  const base = (process.env.LABIT_CORE_API_URL || "").replace(/\/+$/, "");
  const user = process.env.LABIT_CORE_SERVICE_USERNAME || "";
  const pass = process.env.LABIT_CORE_SERVICE_PASSWORD || "";
  if (!base || !user || !pass) return null;
  const tag = campaign?.campaign_id ? ` [campaign ${campaign.campaign_id}${campaign.offer_id ? ` offer ${campaign.offer_id}` : ""}]` : "";
  const res = await fetch(`${base}/api/website-enquiries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` },
    body: JSON.stringify({
      name: name || "WhatsApp patient",
      phone: String(phone).replace(/\D/g, "").slice(-10),
      message: `Home visit / follow-up requested on WhatsApp${mrn ? ` (MRN ${mrn})` : ""}${tag}`,
      requested_test_or_package: item || null,
      home_visit_requested: true
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) return null;
  const created = await res.json().catch(() => null);
  return created?.id || "created";
}
