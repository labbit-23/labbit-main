//api/labs/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getIronSession } from "iron-session";
import { ironOptions as sessionOptions } from "@/lib/session"; // your existing session config

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function canAccessCto(user) {
  return user?.userType === "executive" && (user?.executiveType || "").toLowerCase() === "director";
}

export async function GET(request) {
  try {
    const response = NextResponse.next();
    const url = new URL(request.url);
    const myLabsParam = url.searchParams.get("my_labs") === "true";
    const ctoParam = url.searchParams.get("cto") === "true";

    let labFilterIds = null;
    let user = null;
    let isProductCto = false;

    if (myLabsParam || ctoParam) {
      const session = await getIronSession(request, response, sessionOptions);
      user = session?.user || null;
      if (!user || !user.id) {
        return NextResponse.json({ error: "Not authorized" }, { status: 401 });
      }
    }

    if (ctoParam) {
      if (!canAccessCto(user)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const assignedLabIds = Array.isArray(user?.labIds) ? user.labIds.filter(Boolean) : [];
      if (assignedLabIds.length > 0) {
        labFilterIds = assignedLabIds;
      } else {
        isProductCto = true;
      }
    }

    if (myLabsParam && !ctoParam) {
      // fetch the labs linked to this user from your mapping table
      const { data: userLabs, error: userLabsError } = await supabase
        .from("executives_labs")
        .select("lab_id")
        .eq("executive_id", user.id);

      if (userLabsError) {
        return NextResponse.json({ error: userLabsError.message }, { status: 500 });
      }

      labFilterIds = (userLabs || []).map((row) => row.lab_id).filter(Boolean);
      if (!labFilterIds.length) {
        return NextResponse.json(ctoParam ? { labs: [], is_product_cto: isProductCto, allowed_lab_ids: [] } : [], { status: 200 });
      }
    }

    let query = supabase
      .from("labs")
      .select("id, name")
      .order("name", { ascending: true });

    if ((myLabsParam || ctoParam) && labFilterIds) {
      query = query.in("id", labFilterIds);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (ctoParam) {
      return NextResponse.json(
        {
          labs: data || [],
          is_product_cto: isProductCto,
          allowed_lab_ids: labFilterIds || null
        },
        { status: 200 }
      );
    }

    return NextResponse.json(data, { status: 200 });
    
  } catch (e) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
