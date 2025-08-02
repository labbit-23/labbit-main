//app/api/executives/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client, update import/path if needed
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  const data = await request.json();
  if (!data.name || !data.phone) 
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const { data: inserted, error } = await supabase
    .from("executives")
    .insert({
      name: data.name,
      phone: data.phone,
      type: data.type ?? "Unknown",
      active: data.active ?? true,
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(inserted, { status: 201 });
}

export async function PUT(request) {
  const data = await request.json();
  if (!data.id)
    return NextResponse.json({ error: "Missing ID" }, { status: 400 });

  const { data: updated, error } = await supabase
    .from("executives")
    .update({
      name: data.name,
      phone: data.phone,
      type: data.type,
      active: data.active,
    })
    .eq("id", data.id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(updated, { status: 200 });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const activeParam = url.searchParams.get("active");
    const typeParam = url.searchParams.get("type");

    let query = supabase
      .from("executives")
      .select("id, name, phone, type, status, active")
      .order("created_at", { ascending: false });

    // Apply filters if query params are present

    if (activeParam !== null) {
      // Convert string to boolean
      const activeBoolean = activeParam.toLowerCase() === "true";
      query = query.eq("active", activeBoolean);
    }

    if (typeParam) {
      // Case-insensitive match like
      // You can adjust this if you want exact matches instead
      query = query.ilike("type", typeParam);
      // or for partial inclusion:
      // query = query.ilike("type", `%${typeParam}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
