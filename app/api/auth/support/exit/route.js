import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";

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
    return NextResponse.json({ error: "Only director can exit support mode" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, mode: "director" }, { status: 200 });
  const session = await getIronSession(request, response, ironOptions);
  delete session.support_actor;
  delete session.support_patient_phone;
  await session.save();
  return response;
}
