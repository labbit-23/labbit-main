import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { kioskIronOptions } from "@/lib/kioskSession";
import { confirmCorePrintReceipt } from "@/lib/labitCoreDelivery";

export async function POST(request) {
  try {
    const session = await getIronSession(await cookies(), kioskIronOptions);
    if (!session?.kioskUser?.authenticated) return new Response("Kiosk login required", { status: 403 });

    const body = await request.json();
    const reqno = String(body?.reqno || "").trim();
    const testids = [...new Set((Array.isArray(body?.testids) ? body.testids : []).map(String).map((v) => v.trim()).filter(Boolean))];
    const externalEventId = String(body?.external_event_id || "").trim();
    if (!reqno || !testids.length || !externalEventId) {
      return new Response("reqno, testids and external_event_id are required", { status: 400 });
    }

    const result = await confirmCorePrintReceipt({
      reqno,
      scope: "all",
      channel_code: "print",
      testids,
      sent_at: String(body?.sent_at || new Date().toISOString()),
      external_event_id: externalEventId
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Unable to confirm print receipt" },
      { status: error?.status || 502 }
    );
  }
}
