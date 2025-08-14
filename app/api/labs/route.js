//api/labs/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers"; // needed for getIronSession in route handlers
import { ironOptions as sessionOptions } from "@/lib/session"; // your existing session config

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const myLabsParam = url.searchParams.get("my_labs") === "true";

    let labFilterIds = null;

    if (myLabsParam) {
      // get logged-in user from iron-session
      const session = await getIronSession(cookies(), sessionOptions);
      const user = session.user;

      if (!user || !user.id) {
        return NextResponse.json({ error: "Not authorized" }, { status: 401 });
      }

      // fetch the labs linked to this user from your mapping table
      const { data: userLabs, error: userLabsError } = await supabase
        .from("user_labs") // or whatever mapping table you have
        .select("lab_id")
        .eq("user_id", user.id);

      if (userLabsError) {
        return NextResponse.json({ error: userLabsError.message }, { status: 500 });
      }

      labFilterIds = userLabs.map(row => row.lab_id);
      if (!labFilterIds.length) {
        return NextResponse.json([], { status: 200 });
      }
    }

    let query = supabase
      .from("labs")
      .select("id, name")
      .order("name", { ascending: true });

    if (myLabsParam && labFilterIds) {
      query = query.in("id", labFilterIds);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
    
  } catch (e) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
