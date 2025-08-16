// app/api/quickbook/[id]/route.js

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

// Next.js 15+: always await context.params!
export async function PUT(request, context) {
  const { id } = await context.params;
  const { status, visit_id } = await request.json();

  if (!status) {
    return NextResponse.json({ error: "No status given" }, { status: 400 });
  }

  const { error } = await supabase
    .from("quickbookings")
    .update({ status, visit_id })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
