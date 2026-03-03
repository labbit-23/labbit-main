// app/api/quickbook/[id]/route.js

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

// Next.js 15+: always await context.params!
export async function PUT(request, context) {
  const { id } = await context.params;
  const {
    status,
    visit_id,
    location_source,
    location_text,
    location_name,
    location_address,
    location_lat,
    location_lng
  } = await request.json();

  if (
    typeof status === "undefined" &&
    typeof visit_id === "undefined" &&
    typeof location_source === "undefined" &&
    typeof location_text === "undefined" &&
    typeof location_name === "undefined" &&
    typeof location_address === "undefined" &&
    typeof location_lat === "undefined" &&
    typeof location_lng === "undefined"
  ) {
    return NextResponse.json({ error: "No update payload given" }, { status: 400 });
  }

  const updateData = {};
  if (typeof status !== "undefined") updateData.status = status;
  if (typeof visit_id !== "undefined") updateData.visit_id = visit_id;
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

  // Backward compatibility for DBs without location columns.
  if (
    error &&
    /column .* does not exist/i.test(error.message || "")
  ) {
    const fallbackData = {};
    if (typeof status !== "undefined") fallbackData.status = status;
    if (typeof visit_id !== "undefined") fallbackData.visit_id = visit_id;
    ({ error } = await supabase
      .from("quickbookings")
      .update(fallbackData)
      .eq("id", id));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
