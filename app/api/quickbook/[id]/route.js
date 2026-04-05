// app/api/quickbook/[id]/route.js

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";

// Next.js 15+: always await context.params!
export async function PUT(request, context) {
  const sessionResponse = NextResponse.next();
  const session = await getIronSession(request, sessionResponse, ironOptions);
  const actorId = String(session?.user?.id || "").trim() || null;
  const { id } = await context.params;
  const payload = await request.json();
  const {
    status,
    visit_id,
    rejection_code,
    rejection_reason,
    location_source,
    location_text,
    location_name,
    location_address,
    location_lat,
    location_lng,
    rejected_at,
    rejected_by,
    rejection_channel
  } = payload;

  if (
    typeof status === "undefined" &&
    typeof visit_id === "undefined" &&
    typeof rejection_code === "undefined" &&
    typeof rejection_reason === "undefined" &&
    typeof location_source === "undefined" &&
    typeof location_text === "undefined" &&
    typeof location_name === "undefined" &&
    typeof location_address === "undefined" &&
    typeof location_lat === "undefined" &&
    typeof location_lng === "undefined" &&
    typeof rejected_at === "undefined" &&
    typeof rejected_by === "undefined" &&
    typeof rejection_channel === "undefined"
  ) {
    return NextResponse.json({ error: "No update payload given" }, { status: 400 });
  }

  const normalizedStatus = String(status || "").trim().toLowerCase();
  const normalizedRejectionCode = String(rejection_code || "").trim().toLowerCase();
  const trimmedRejectionReason = String(rejection_reason || "").trim();

  if (normalizedStatus === "rejected") {
    if (!normalizedRejectionCode) {
      return NextResponse.json({ error: "rejection_code is required when status is rejected" }, { status: 400 });
    }
    if (normalizedRejectionCode === "other" && !trimmedRejectionReason) {
      return NextResponse.json({ error: "rejection_reason is required when rejection_code is other" }, { status: 400 });
    }
  }

  const updateData = {};
  if (typeof status !== "undefined") updateData.status = status;
  if (typeof visit_id !== "undefined") updateData.visit_id = visit_id;
  if (typeof rejection_code !== "undefined") updateData.rejection_code = rejection_code;
  if (typeof rejection_reason !== "undefined") updateData.rejection_reason = rejection_reason;
  if (typeof rejected_at !== "undefined") updateData.rejected_at = rejected_at;
  if (typeof rejected_by !== "undefined") updateData.rejected_by = rejected_by;
  if (typeof rejection_channel !== "undefined") updateData.rejection_channel = rejection_channel;
  if (normalizedStatus === "rejected") updateData.rejected_at = updateData.rejected_at || new Date().toISOString();
  if (normalizedStatus === "rejected") updateData.rejected_by = updateData.rejected_by || actorId;
  if (normalizedStatus === "rejected") updateData.rejection_channel = updateData.rejection_channel || "admin_dashboard";
  if (typeof location_source !== "undefined") updateData.location_source = location_source;
  if (typeof location_text !== "undefined") updateData.location_text = location_text;
  if (typeof location_name !== "undefined") updateData.location_name = location_name;
  if (typeof location_address !== "undefined") updateData.location_address = location_address;
  if (typeof location_lat !== "undefined") updateData.location_lat = location_lat;
  if (typeof location_lng !== "undefined") updateData.location_lng = location_lng;

  let { error } = await supabase
    .from("quickbookings")
    .update(updateData)
    .eq("id", id);

  const isMissingColumnError = (err) => {
    const message = String(err?.message || "");
    return (
      /column .* does not exist/i.test(message) ||
      /could not find the '.*' column .* schema cache/i.test(message)
    );
  };

  // Backward compatibility for DBs without optional columns.
  if (
    error &&
    isMissingColumnError(error)
  ) {
    const fallbackData = {
      ...(typeof status !== "undefined" ? { status } : {}),
      ...(typeof visit_id !== "undefined" ? { visit_id } : {}),
      ...(typeof location_source !== "undefined" ? { location_source } : {}),
      ...(typeof location_text !== "undefined" ? { location_text } : {}),
      ...(typeof location_name !== "undefined" ? { location_name } : {}),
      ...(typeof location_address !== "undefined" ? { location_address } : {}),
      ...(typeof location_lat !== "undefined" ? { location_lat } : {}),
      ...(typeof location_lng !== "undefined" ? { location_lng } : {})
    };

    ({ error } = await supabase
      .from("quickbookings")
      .update(fallbackData)
      .eq("id", id));
  }

  // Final fallback: only core fields that always exist in legacy schemas.
  if (
    error &&
    isMissingColumnError(error)
  ) {
    const finalFallbackData = {
      ...(typeof status !== "undefined" ? { status } : {}),
      ...(typeof visit_id !== "undefined" ? { visit_id } : {})
    };
    ({ error } = await supabase
      .from("quickbookings")
      .update(finalFallbackData)
      .eq("id", id));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
