import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions as sessionOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

const ADMIN_ROLES = new Set(["admin", "manager", "director"]);
const LOGISTICS_LAB_WIDE_ROLES = new Set(["logistics"]);

function getRoleKey(user) {
  return (
    user?.roleKey ||
    user?.executiveType ||
    (user?.userType === "executive" ? "executive" : user?.userType) ||
    ""
  )
    .toString()
    .toLowerCase();
}

async function getLabIds(executiveId) {
  const { data, error } = await supabase
    .from("executives_labs")
    .select("lab_id")
    .eq("executive_id", executiveId);
  if (error) throw error;
  return (data || []).map((row) => row.lab_id);
}

async function getCentreIdsByLabs(labIds) {
  if (!Array.isArray(labIds) || labIds.length === 0) return [];

  const firstTry = await supabase
    .from("collection_centre")
    .select("id")
    .in("lab_id", labIds);
  if (!firstTry.error) return (firstTry.data || []).map((row) => row.id);

  const secondTry = await supabase
    .from("collection_centres")
    .select("id")
    .in("lab_id", labIds);
  if (!secondTry.error) return (secondTry.data || []).map((row) => row.id);

  console.warn("[notifications/summary] Could not resolve collection centres", {
    first: firstTry.error?.message || null,
    second: secondTry.error?.message || null
  });
  return [];
}

async function getAssignedCentreIds(executiveId) {
  const { data, error } = await supabase
    .from("executives_collection_centres")
    .select("collection_centre_id")
    .eq("executive_id", executiveId)
    .in("role", ["requester", "logistics", "admin"]);
  if (error) throw error;
  return (data || []).map((row) => row.collection_centre_id);
}

function normalizedWhatsappUnread(session) {
  const status = String(session?.status || "").toLowerCase();
  return status === "pending" || status === "handoff"
    ? Number(session?.unread_count || 0)
    : 0;
}

function parseNotifyTargets(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").toLowerCase()).filter(Boolean);
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || "").toLowerCase()).filter(Boolean);
      }
    } catch {
      // Non-JSON text fallback handled below.
    }

    return raw
      .replace(/^\{|\}$/g, "")
      .split(/[,\s]+/)
      .map((item) => item.replace(/^"+|"+$/g, "").trim().toLowerCase())
      .filter(Boolean);
  }

  return [];
}

export async function GET(request) {
  const response = NextResponse.next();
  try {
    const sessionData = await getIronSession(request, response, sessionOptions);
    const user = sessionData?.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const roleKey = getRoleKey(user);
    const counts = {
      quickbook_pending: 0,
      whatsapp_unread: 0,
      pickups_samples_ready: 0,
      pickups_samples_ready_urgent: 0,
      admin_visit_attention: 0,
      phlebo_assigned_active: 0,
      phlebo_unassigned_available: 0,
    };

    if (ADMIN_ROLES.has(roleKey)) {
      const [{ count: qbCount, error: qbError }, { data: sessions, error: chatError }] =
        await Promise.all([
          supabase
            .from("quickbookings")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending", "PENDING"]),
          supabase
            .from("chat_sessions")
            .select("unread_count, status"),
        ]);

      if (qbError) throw qbError;
      if (chatError) throw chatError;

      counts.quickbook_pending = qbCount || 0;
      counts.whatsapp_unread = (sessions || [])
        .reduce((sum, s) => sum + normalizedWhatsappUnread(s), 0);

      // Robust path: handle mixed notify_to formats without JSONB operator errors.
      let adminStatusCodes = [];
      const { data: statusRows, error: statusRowsError } = await supabase
        .from("visit_statuses")
        .select("code, notify_to");
      if (statusRowsError) {
        console.warn("[notifications/summary] visit_statuses lookup failed", statusRowsError.message);
      } else {
        adminStatusCodes = (statusRows || [])
          .filter((row) => parseNotifyTargets(row?.notify_to).includes("admin"))
          .map((row) => row?.code)
          .filter(Boolean);
      }
      if (adminStatusCodes.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const { count: adminVisitCount, error: adminVisitError } = await supabase
          .from("visits")
          .select("id", { count: "exact", head: true })
          .in("status", adminStatusCodes)
          .gte("visit_date", today);
        if (adminVisitError) {
          console.warn("[notifications/summary] visits admin attention lookup failed", adminVisitError.message);
        } else {
          counts.admin_visit_attention = adminVisitCount || 0;
        }
      }

      const adminLabIds = await getLabIds(user.id);
      const adminCentreIds = await getCentreIdsByLabs(adminLabIds);
      if (adminCentreIds.length > 0) {
        const [
          { count, error },
          { count: urgentCount, error: urgentError }
        ] = await Promise.all([
          supabase
            .from("sample_pickups")
            .select("id", { count: "exact", head: true })
            .eq("status", "samples_ready")
            .in("collection_centre_id", adminCentreIds),
          supabase
            .from("sample_pickups")
            .select("id", { count: "exact", head: true })
            .eq("status", "samples_ready")
            .in("collection_centre_id", adminCentreIds)
            .ilike("notes", "%Urgent: Yes%")
        ]);
        if (error) throw error;
        if (urgentError) throw urgentError;
        counts.pickups_samples_ready = count || 0;
        counts.pickups_samples_ready_urgent = urgentCount || 0;
      }
    }

    if (roleKey === "b2b" || roleKey === "logistics") {
      let centreIds = [];
      if (LOGISTICS_LAB_WIDE_ROLES.has(roleKey)) {
        const labIds = await getLabIds(user.id);
        centreIds = await getCentreIdsByLabs(labIds);
      } else {
        centreIds = await getAssignedCentreIds(user.id);
      }

      if (centreIds.length > 0) {
        const [
          { count, error },
          { count: urgentCount, error: urgentError }
        ] = await Promise.all([
          supabase
            .from("sample_pickups")
            .select("id", { count: "exact", head: true })
            .eq("status", "samples_ready")
            .in("collection_centre_id", centreIds),
          supabase
            .from("sample_pickups")
            .select("id", { count: "exact", head: true })
            .eq("status", "samples_ready")
            .in("collection_centre_id", centreIds)
            .ilike("notes", "%Urgent: Yes%")
        ]);
        if (error) throw error;
        if (urgentError) throw urgentError;
        counts.pickups_samples_ready = count || 0;
        counts.pickups_samples_ready_urgent = urgentCount || 0;
      }
    }

    if (roleKey === "phlebo") {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data, error }, { count: unassignedCount, error: unassignedError }] = await Promise.all([
        supabase
        .from("visits")
        .select("id, status")
        .eq("executive_id", user.id)
        .gte("visit_date", today),
        supabase
          .from("visits")
          .select("id", { count: "exact", head: true })
          .is("executive_id", null)
          .gte("visit_date", today)
          .not("status", "in", "(disabled,cancelled,canceled,completed)")
      ]);
      if (error) throw error;
      if (unassignedError) throw unassignedError;

      const inactiveStatuses = new Set(["completed", "cancelled", "canceled", "disabled"]);
      counts.phlebo_assigned_active = (data || []).filter(
        (row) => !inactiveStatuses.has((row.status || "").toString().toLowerCase())
      ).length;
      counts.phlebo_unassigned_available = unassignedCount || 0;
    }

    return NextResponse.json(
      {
        roleKey,
        counts,
        generated_at: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    const emptyCounts = {
      quickbook_pending: 0,
      whatsapp_unread: 0,
      pickups_samples_ready: 0,
      pickups_samples_ready_urgent: 0,
      admin_visit_attention: 0,
      phlebo_assigned_active: 0,
      phlebo_unassigned_available: 0,
    };
    console.error("[notifications/summary] failed", err);
    return NextResponse.json(
      {
        roleKey: "",
        counts: emptyCounts,
        generated_at: new Date().toISOString(),
        error: err.message || "Internal server error"
      },
      { status: 200 }
    );
  }
}
