import { supabase } from "@/lib/supabaseServer";

function extractClientIp(request) {
  return (
    request?.headers?.get("x-forwarded-for")?.split(",")?.[0]?.trim() ||
    request?.headers?.get("x-real-ip") ||
    null
  );
}

export async function writeAuditLog({
  request,
  user,
  roleKey,
  action,
  entityType,
  entityId,
  labId = null,
  before = null,
  after = null,
  metadata = null,
  status = "success"
}) {
  try {
    const row = {
      actor_user_id: user?.id || null,
      actor_name: user?.name || null,
      actor_role: roleKey || null,
      action: String(action || "").trim() || null,
      entity_type: String(entityType || "").trim() || null,
      entity_id: entityId == null ? null : String(entityId),
      lab_id: labId || null,
      status: String(status || "success").trim().toLowerCase(),
      before_json: before,
      after_json: after,
      metadata_json: metadata,
      ip: extractClientIp(request),
      user_agent: request?.headers?.get("user-agent") || null
    };

    const { error } = await supabase.from("audit_logs").insert(row);
    if (error) {
      const msg = String(error?.message || "").toLowerCase();
      if (msg.includes("relation") && msg.includes("audit_logs")) return;
      console.error("[audit] insert error", error);
    }
  } catch (err) {
    console.error("[audit] unexpected error", err);
  }
}
