import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { kioskIronOptions } from "@/lib/kioskSession";
import { fetchCoreDispatchPdf } from "@/lib/labitCoreDelivery";

export async function POST(request) {
  try {
    const session = await getIronSession(await cookies(), kioskIronOptions);
    if (!session?.kioskUser?.authenticated) return new Response("Kiosk login required", { status: 403 });

    const body = await request.json();
    const reqno = String(body?.reqno || "").trim();
    const testids = [...new Set((Array.isArray(body?.testids) ? body.testids : []).map(String).map((value) => value.trim()).filter(Boolean))];
    if (!reqno || !testids.length) return new Response("reqno and testids are required", { status: 400 });

    const pdf = await fetchCoreDispatchPdf({ reqno, testids });
    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(reqno)}_print_pending.pdf"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return new Response(error?.message || "Failed to render pending reports", { status: error?.status || 502 });
  }
}
