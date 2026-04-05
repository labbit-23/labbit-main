// File: app/api/executives/[id]/updateStatus/route.js

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request, context) {
  // Await params as per Next.js requirements
  const { params } = context;
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing executive ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { status } = body;

    // Validate status values
    if (!status || (status !== "active" && status !== "inactive")) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    const nextActive = status === "active";

    // Update status + active in the database (keep them consistent)
    const { error } = await supabase
      .from("executives")
      .update({ status, active: nextActive })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { message: `Status updated to ${status}`, status, active: nextActive },
      { status: 200 }
    );

  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
