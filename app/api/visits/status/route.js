//app/api/visits/status.js
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("visit_statuses")
      .select("code, label, order")
      .order("order", { ascending: true });

    if (error) {
      console.error("Error loading statuses:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (e) {
    console.error("Unexpected error:", e);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
