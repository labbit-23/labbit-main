// ==============================
// File: lib/sendWhatsAppMessage.js
// ==============================
import { supabase } from "@/lib/supabaseClient";

export default async function sendWhatsAppMessage(
  labId,
  { destination, userName, templateParams }
) {
  const { data: cfgRows, error } = await supabase
    .from("labs_apis")
    .select("*")
    .match({ lab_id: labId, api_name: "whatsapp_outbound" })
    .limit(1);

  if (error) throw new Error(error.message);
  const cfg = cfgRows?.[0];
  if (!cfg) throw new Error("No outbound WhatsApp config for lab");

  const { api_key } = cfg.auth_details || {};
  const { default_campaign, default_source } = cfg.templates || {};

  const payload = {
    apiKey: api_key,
    campaignName: default_campaign,
    destination,
    userName,
    source: default_source,
    templateParams: templateParams || []
  };

  console.log("[WhatsApp Outbound Payload]", payload);

  const res = await fetch(cfg.base_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp API Error: ${errText}`);
  }

  const result = await res.json();

  // 📝 Log outbound message
  await supabase.from("whatsapp_messages").insert({
    lab_id: labId,
    phone: destination,
    name: userName,
    message: (templateParams || []).join(" "),
    direction: "outbound",
    payload
  });

  return result;
}
