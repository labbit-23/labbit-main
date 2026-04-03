import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["open", "acknowledged", "resolved"]);

function canAccessCto(user) {
  return user?.userType === "executive" && (user?.executiveType || "").toLowerCase() === "director";
}

function normalizeText(value) {
  return String(value || "").trim();
}

export async function PATCH(request, { params }) {
  const response = NextResponse.next();

  try {
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;
    if (!canAccessCto(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!supabase) {
      return NextResponse.json({ error: "Supabase server client unavailable" }, { status: 500 });
    }

    const eventId = normalizeText(params?.eventId);
    if (!eventId) {
      return NextResponse.json({ error: "Missing event id" }, { status: 400 });
    }

    const body = await request.json();
    const nextStatus = normalizeText(body?.status).toLowerCase();
    if (!ALLOWED_STATUSES.has(nextStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("cto_events")
      .select("id, lab_id, status, payload")
      .eq("id", eventId)
      .maybeSingle();

    if (existingError) {
      console.error("[cto/events/:id] lookup error", existingError);
      return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const assignedLabIds = Array.isArray(user?.labIds) ? user.labIds.filter(Boolean).map(String) : [];
    const isProductCto = assignedLabIds.length === 0;
    if (!isProductCto && !assignedLabIds.includes(String(existing.lab_id))) {
      return NextResponse.json({ error: "Forbidden for requested lab" }, { status: 403 });
    }

    const actor = normalizeText(user?.name || user?.id || "director");
    const nowIso = new Date().toISOString();
    const note = normalizeText(body?.note);
    const previousPayload =
      existing?.payload && typeof existing.payload === "object" && !Array.isArray(existing.payload)
        ? existing.payload
        : {};
    const nextPayload = {
      ...previousPayload,
      status_updated_at: nowIso,
      status_updated_by: actor,
      ...(nextStatus === "resolved" && note ? { resolution_note: note.slice(0, 800) } : {})
    };

    const updatePayload = {
      status: nextStatus,
      payload: nextPayload
    };

    const { data, error } = await supabase
      .from("cto_events")
      .update(updatePayload)
      .eq("id", eventId)
      .select("*")
      .single();

    if (error) {
      console.error("[cto/events/:id] update error", error);
      return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
    }

    return NextResponse.json({ row: data });
  } catch (error) {
    console.error("[cto/events/:id] unexpected error", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
