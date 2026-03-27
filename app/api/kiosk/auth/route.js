import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { kioskIronOptions, getKioskEnvConfig } from "@/lib/kioskSession";
import { cookies } from "next/headers";

export async function POST(request) {
  try {
    const body = await request.json();
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "").trim();
    const env = getKioskEnvConfig();

    const cookieStore = await cookies();
    const session = await getIronSession(cookieStore, kioskIronOptions);
    const valid = Boolean(username) && Boolean(password) && username === env.username && password === env.password;

    if (!valid) {
      session.kioskUser = null;
      await session.save();
      return NextResponse.json({ status: "UNVALID" }, { status: 200 });
    }

    session.kioskUser = {
      authenticated: true,
      username,
      role: "kiosk_dispatcher",
      labId: env.labId
    };
    await session.save();
    return NextResponse.json({ status: "OK" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "UNVALID" }, { status: 200 });
  }
}
