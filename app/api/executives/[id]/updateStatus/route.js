// File: app/api/executives/[id]/updateStatus/route.js

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { checkPermission, deny, getSessionUser } from "@/lib/uac/authz";
import { writeAuditLog } from "@/lib/audit/logger";

export async function POST(request, context) {
  const user = await getSessionUser(request);
  if (!user) return deny("Not authenticated", 401);

  const permissionCheck = await checkPermission(user, "executives.status.update");
  const roleKey = permissionCheck.roleKey;
  if (!permissionCheck.ok) {
    await writeAuditLog({
      request,
      user,
      roleKey,
      action: "executives.status.update",
      entityType: "executives",
      entityId: null,
      status: "denied",
      metadata: { reason: "missing executives.status.update" },
    });
    return deny("You do not have permission to update executive status.", 403, {
      permission: "executives.status.update",
    });
  }

  const { params } = context;
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing executive ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { status } = body;

    if (!status || (status !== "active" && status !== "inactive")) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    const { data: beforeRow } = await supabase
      .from("executives")
      .select("id, name, status, active")
      .eq("id", id)
      .maybeSingle();

    const nextActive = status === "active";

    const { error } = await supabase
      .from("executives")
      .update({ status, active: nextActive })
      .eq("id", id);

    if (error) {
      await writeAuditLog({
        request,
        user,
        roleKey,
        action: "executives.status.update",
        entityType: "executives",
        entityId: id,
        status: "failed",
        before: beforeRow,
        after: null,
        metadata: { error: error.message, requested_status: status },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: afterRow } = await supabase
      .from("executives")
      .select("id, name, status, active")
      .eq("id", id)
      .maybeSingle();

    await writeAuditLog({
      request,
      user,
      roleKey,
      action: "executives.status.update",
      entityType: "executives",
      entityId: id,
      status: "success",
      before: beforeRow,
      after: afterRow,
      metadata: { requested_status: status },
    });

    return NextResponse.json(
      { message: `Status updated to ${status}`, status, active: nextActive },
      { status: 200 }
    );
  } catch (_err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
