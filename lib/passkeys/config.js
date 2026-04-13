function asText(value) {
  return String(value || "").trim();
}

export function normalizePhone10(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-10);
}

function inferRpIdFromRequest(request) {
  const host =
    asText(request?.headers?.get("x-forwarded-host")) ||
    asText(request?.headers?.get("host"));
  if (!host) return "";
  return host.split(":")[0].toLowerCase();
}

function inferOriginFromRequest(request) {
  const origin = asText(request?.headers?.get("origin"));
  if (origin) return origin;

  const host =
    asText(request?.headers?.get("x-forwarded-host")) ||
    asText(request?.headers?.get("host"));
  if (!host) return "";

  const proto = asText(request?.headers?.get("x-forwarded-proto")) || "https";
  return `${proto}://${host}`;
}

export function getPasskeyConfig(request) {
  const explicitRpId = asText(process.env.PASSKEY_RP_ID);
  const rpID = explicitRpId || inferRpIdFromRequest(request) || "localhost";
  const rpName = asText(process.env.PASSKEY_RP_NAME) || "Labit";

  const originFromRequest = inferOriginFromRequest(request);
  const configuredOrigins = asText(process.env.PASSKEY_ORIGINS)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const allowedOrigins = Array.from(
    new Set(
      [
        ...configuredOrigins,
        originFromRequest,
        rpID === "localhost" ? "http://localhost:3000" : `https://${rpID}`,
      ].filter(Boolean)
    )
  );

  const tableName = asText(process.env.PASSKEY_TABLE_NAME) || "patient_passkeys";
  const enabled = asText(process.env.PASSKEY_ENABLED || "true").toLowerCase() !== "false";

  return {
    enabled,
    rpID,
    rpName,
    allowedOrigins,
    tableName,
  };
}
