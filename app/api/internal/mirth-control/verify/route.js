import { NextResponse } from "next/server";

// POST /api/internal/mirth-control/verify
//
// Passcode gate for the CTO Dashboard's Mirth control card. The passcode lives
// server-side only (MIRTH_CONTROL_PASSCODE) -- never NEXT_PUBLIC_*, which would
// ship it in the client bundle. This route only answers "was that right,"
// nothing else; it has no Mirth actions wired up yet (no Mirth API integration
// exists as of 2026-09-05 -- see the mirth-cto-dashboard-integration memory
// note), so unlocking currently reveals a placeholder, not live control.
export async function POST(request) {
  const expected = process.env.MIRTH_CONTROL_PASSCODE || "";
  if (!expected) {
    return NextResponse.json({ ok: false, error: "MIRTH_CONTROL_PASSCODE not configured" }, { status: 503 });
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }
  const provided = String(body?.passcode || "");
  if (!provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: "Incorrect passcode" }, { status: 401 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
