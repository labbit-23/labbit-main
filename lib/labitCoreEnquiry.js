// Bridge from labit-app's marketplace booking into labit-core's real
// pricing/requisition/QR-payment path.
//
// Director decision, 2026-09-28: commit to the multi-lab marketplace
// architecture (see labit-app/docs/MARKETPLACE_SCOPING.md) rather than let
// labit-app's booking dead-end in a labit-main-only `visits` row that staff
// then have to manually re-key into labit-core. Reuses the EXISTING intake
// queue labit-core already built for exactly this shape of problem
// (schema/258_website_enquiry.sql) instead of inventing a new one:
//
//   POST {LABIT_CORE_API_URL}/api/website-enquiries
//   Auth: HTTP Basic, service account `svc_labit_app` (role `website_intake`,
//   permission `website_enquiry.submit` ONLY -- write-only, no read access
//   to the queue or to anything else). Provisioned 2026-09-28, same pattern
//   as labit-website's own `svc_website_sdrc` account -- one app_user per
//   calling site sharing the `website_intake` role, so `source_site` (set
//   from the caller's OWN app_user.username, never from the request body)
//   correctly shows staff which channel a lead came from.
//
// This is purely additive to the `visits` row app-booking/visits/route.js
// already creates (that stays the source of truth for phlebo scheduling).
// A failure here must NEVER surface to the app booking that already
// succeeded -- same best-effort contract labit-core's own
// _create_website_enquiry_for_booking uses for labit-patient's booking
// requests (wrapped in try/except there too, for the same reason).
import { supabase } from "@/lib/supabaseServer";

const CORE_BASE = (process.env.LABIT_CORE_API_URL || "").replace(/\/+$/, "");
const USERNAME = process.env.LABIT_CORE_SERVICE_USERNAME || "";
const PASSWORD = process.env.LABIT_CORE_SERVICE_PASSWORD || "";

/**
 * @param {{ patientId: string, addressId: string, notes: string | null }} args
 */
export async function submitWebsiteEnquiry({ patientId, addressId, notes }) {
  if (!CORE_BASE || !USERNAME || !PASSWORD) {
    console.error("[labitCoreEnquiry] not configured (LABIT_CORE_API_URL/SERVICE_USERNAME/SERVICE_PASSWORD) -- skipping");
    return;
  }

  const [{ data: patient, error: patientErr }, { data: address, error: addressErr }] = await Promise.all([
    supabase.from("patients").select("name, phone").eq("id", patientId).maybeSingle(),
    supabase.from("patient_addresses").select("address_line, area, lat, lng").eq("id", addressId).maybeSingle(),
  ]);
  if (patientErr) throw patientErr;
  if (addressErr) throw addressErr;
  // website_enquiry.name/phone are NOT NULL -- a patient row missing either
  // (shouldn't happen; app signup requires phone) means there's nothing
  // sane to submit, same guard labit-core's own booking-request bridge uses.
  if (!patient?.name || !patient?.phone) return;

  const locationText = [address?.address_line, address?.area].filter(Boolean).join(", ") || null;

  const body = {
    name: patient.name,
    phone: patient.phone,
    message: "Booked via the Labit App (marketplace)",
    requested_test_or_package: notes || null,
    home_visit_requested: true,
    location_text: locationText,
    location_lat: address?.lat ?? null,
    location_lng: address?.lng ?? null,
  };

  const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64");
  const res = await fetch(`${CORE_BASE}/api/website-enquiries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`website-enquiries POST failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
}
