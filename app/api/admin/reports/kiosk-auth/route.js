import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "").trim();

    const expectedUsername = String(process.env.REPORT_KIOSK_USERNAME || "report_dispatcher").trim();
    const expectedPassword = String(process.env.REPORT_KIOSK_PASSWORD || "report@123").trim();

    const valid = Boolean(username) && Boolean(password) && username === expectedUsername && password === expectedPassword;

    if (valid) {
      return NextResponse.json({ status: "OK" }, { status: 200 });
    }
    return NextResponse.json({ status: "UNVALID" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "UNVALID" }, { status: 200 });
  }
}
