import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { kioskIronOptions, getKioskEnvConfig } from "@/lib/kioskSession";
import { supabase } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const kioskSession = await getIronSession(cookieStore, kioskIronOptions);
    const kioskUser = kioskSession?.kioskUser;
    if (!kioskUser?.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const env = getKioskEnvConfig();
    const labId = String(kioskUser?.labId || env.labId || process.env.DEFAULT_LAB_ID || "").trim();
    if (!labId) {
      return NextResponse.json(
        {
          id: null,
          name: process.env.NEXT_PUBLIC_APP_NAME || "Labit",
          logo_url: process.env.NEXT_PUBLIC_LABBIT_LOGO || "/logo.png"
        },
        { status: 200 }
      );
    }

    const { data, error } = await supabase
      .from("labs")
      .select("id, name, logo_url")
      .eq("id", labId)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json(
      {
        id: data?.id || labId,
        name: data?.name || process.env.NEXT_PUBLIC_APP_NAME || "Labit",
        logo_url: data?.logo_url || process.env.NEXT_PUBLIC_LABBIT_LOGO || "/logo.png"
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        id: null,
        name: process.env.NEXT_PUBLIC_APP_NAME || "Labit",
        logo_url: process.env.NEXT_PUBLIC_LABBIT_LOGO || "/logo.png",
        error: error?.message || "Failed to load lab meta"
      },
      { status: 200 }
    );
  }
}
