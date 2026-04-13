import { supabase } from "@/lib/supabaseServer";
import { normalizePhone10 } from "@/lib/passkeys/config";

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export async function listPasskeysByPhone(phone, tableName) {
  const normalizedPhone = normalizePhone10(phone);
  if (!normalizedPhone) return [];

  const { data, error } = await supabase
    .from(tableName)
    .select("id, phone, credential_id, public_key, counter, transports, device_name, active, created_at, last_used_at")
    .eq("phone", normalizedPhone)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return safeArray(data);
}

export async function getPasskeyByCredentialId(credentialId, tableName) {
  const cleanId = String(credentialId || "").trim();
  if (!cleanId) return null;

  const { data, error } = await supabase
    .from(tableName)
    .select("id, phone, credential_id, public_key, counter, transports, device_name, active, created_at, last_used_at")
    .eq("credential_id", cleanId)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function upsertPasskey({
  tableName,
  phone,
  credentialId,
  publicKey,
  counter = 0,
  transports = [],
  deviceName = null,
}) {
  const normalizedPhone = normalizePhone10(phone);
  if (!normalizedPhone) throw new Error("Invalid phone");

  const payload = {
    phone: normalizedPhone,
    credential_id: String(credentialId || "").trim(),
    public_key: String(publicKey || "").trim(),
    counter: Number.isFinite(Number(counter)) ? Number(counter) : 0,
    transports: safeArray(transports).map((t) => String(t || "").trim()).filter(Boolean),
    device_name: String(deviceName || "").trim() || null,
    active: true,
    last_used_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(tableName)
    .upsert(payload, { onConflict: "credential_id" })
    .select("id, phone, credential_id, public_key, counter, transports, device_name, active, created_at, last_used_at")
    .single();

  if (error) throw error;
  return data;
}

export async function touchPasskeyUsage({ tableName, credentialId, nextCounter }) {
  const { error } = await supabase
    .from(tableName)
    .update({
      counter: Number.isFinite(Number(nextCounter)) ? Number(nextCounter) : 0,
      last_used_at: new Date().toISOString(),
    })
    .eq("credential_id", String(credentialId || "").trim());

  if (error) throw error;
}

export async function disablePasskey({ tableName, credentialId, phone }) {
  const normalizedPhone = normalizePhone10(phone);
  const cleanCredentialId = String(credentialId || "").trim();
  if (!normalizedPhone || !cleanCredentialId) throw new Error("Missing phone or credential id");

  const { error } = await supabase
    .from(tableName)
    .update({ active: false })
    .eq("phone", normalizedPhone)
    .eq("credential_id", cleanCredentialId);

  if (error) throw error;
}
