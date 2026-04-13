import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";

function normalizePhone10(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-10);
}

export async function POST(request) {
  const authResponse = NextResponse.next();
  const authSession = await getIronSession(request, authResponse, ironOptions);
  const user = authSession?.user;

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userType = String(user.userType || "").trim().toLowerCase();
  const execType = String(user.executiveType || user.roleKey || user.userType || "").trim().toLowerCase();
  const isDirector = execType === "director" && (userType === "executive" || userType === "director");
  if (!isDirector) {
    return NextResponse.json({ error: "Only director can use support patient login" }, { status: 403 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const phone = normalizePhone10(body?.phone);
  if (!phone) {
    return NextResponse.json({ error: "Valid phone required" }, { status: 400 });
  }

  // Preserve original director identity and set support mode marker.
  const supportActor = {
    id: user.id || null,
    name: user.name || null,
    phone: user.phone || null,
    role: execType,
    started_at: new Date().toISOString(),
  };

  const response = NextResponse.json({
    ok: true,
    mode: "patient_support",
    support_patient_phone: phone,
  });
  const session = await getIronSession(request, response, ironOptions);
  session.support_actor = supportActor;
  session.support_patient_phone = phone;
  await session.save();
  return response;
}
