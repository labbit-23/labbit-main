import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { kioskIronOptions } from "@/lib/kioskSession";
import { getCoreDeliveryHistory, getCorePrintPending } from "@/lib/labitCoreDelivery";

function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export async function GET(request) {
  try {
    const session = await getIronSession(await cookies(), kioskIronOptions);
    if (!session?.kioskUser?.authenticated) return new Response("Kiosk login required", { status: 403 });

    const url = new URL(request.url);
    const reqno = String(url.searchParams.get("reqno") || "").trim();
    if (!reqno) return new Response("Missing reqno", { status: 400 });

    const [result, history] = await Promise.all([
      getCorePrintPending(todayInIndia()),
      getCoreDeliveryHistory(reqno)
    ]);
    const printHistoryByTest = new Map();
    for (const event of Array.isArray(history?.events) ? history.events : []) {
      if (String(event?.channel_code || "").toLowerCase() !== "print") continue;
      const testId = String(event?.test_id || "").trim();
      if (!testId) continue;
      const current = printHistoryByTest.get(testId) || { eventIds: new Set(), lastPrintAt: null };
      if (event?.id) current.eventIds.add(String(event.id));
      const deliveredAt = String(event?.delivered_at || "");
      if (deliveredAt && (!current.lastPrintAt || deliveredAt > current.lastPrintAt)) current.lastPrintAt = deliveredAt;
      printHistoryByTest.set(testId, current);
    }
    const items = (Array.isArray(result?.items) ? result.items : []).filter(
      (item) => String(item?.reqno || "").trim().toUpperCase() === reqno.toUpperCase()
    ).map((item) => {
      const printHistory = printHistoryByTest.get(String(item?.test_id || "").trim());
      return {
        ...item,
        physical_print_count: printHistory?.eventIds.size || 0,
        last_print_at: printHistory?.lastPrintAt || null
      };
    });
    return NextResponse.json({ date: result?.date || todayInIndia(), count: items.length, items });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Unable to load print-pending reports" },
      { status: error?.status || 502 }
    );
  }
}
