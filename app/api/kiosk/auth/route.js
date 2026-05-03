import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { kioskIronOptions, getKioskEnvConfig } from "@/lib/kioskSession";
import { cookies } from "next/headers";

function parseKioskLoginBarcode(raw) {
  const text = String(raw || "").trim();
  const [prefixRaw, usernameRaw, passwordRaw] = text.split("|");
  const prefix = String(prefixRaw || "").trim().toUpperCase();
  const username = String(usernameRaw || "").trim();
  const password = String(passwordRaw || "").trim();
  return {
    valid: prefix === "KIOSK_LOGIN" && Boolean(username) && Boolean(password),
    username,
    password,
    text
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "").trim();
    const loginBarcode = String(body?.login_barcode || "").trim();
    const env = getKioskEnvConfig();
    const expectedBarcodeRaw = String(process.env.REPORT_KIOSK_BARCODE || "").trim();
    const expectedBarcode = expectedBarcodeRaw.includes("<REPORT_KIOSK_") ? "" : expectedBarcodeRaw;
    const parsedBarcode = parseKioskLoginBarcode(loginBarcode);

    const cookieStore = await cookies();
    const session = await getIronSession(cookieStore, kioskIronOptions);
    const validByCreds = Boolean(username) && Boolean(password) && username === env.username && password === env.password;
    const validByExactBarcode =
      Boolean(expectedBarcode) &&
      Boolean(loginBarcode) &&
      loginBarcode === expectedBarcode;
    const validByParsedBarcode =
      parsedBarcode.valid &&
      parsedBarcode.username === env.username &&
      parsedBarcode.password === env.password;
    const valid = validByCreds || validByExactBarcode || validByParsedBarcode;

    if (!valid) {
      return NextResponse.json({ status: "UNVALID" }, { status: 200 });
    }

    const resolvedUsername =
      parsedBarcode.valid
        ? parsedBarcode.username
        : username || env.username;

    session.kioskUser = {
      authenticated: true,
      username: resolvedUsername,
      role: "kiosk_dispatcher",
      labId: env.labId
    };
    await session.save();
    return NextResponse.json({ status: "OK" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "UNVALID" }, { status: 200 });
  }
}
