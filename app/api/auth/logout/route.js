// /app/api/auth/logout/route.js

import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { NextResponse } from "next/server";

export async function POST(req) {
  const res = NextResponse.json({ message: "Logged out" });
  const session = await getIronSession(req, res, ironOptions);
  await session.destroy();    // Will set Set-Cookie header on this response
  return res;                 // RETURN THIS MODIFIED RESPONSE
}
