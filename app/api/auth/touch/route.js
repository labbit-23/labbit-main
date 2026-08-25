import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions, prepareSessionForSave, refreshSessionActivity } from "@/lib/session";

export async function POST(request) {
  const response = new NextResponse(null, { status: 204 });
  const session = await getIronSession(request, response, ironOptions);

  if (!session.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (refreshSessionActivity(session)) {
    prepareSessionForSave(session);
    await session.save();
  }

  return response;
}
