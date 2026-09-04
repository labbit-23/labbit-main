import { NextResponse } from "next/server";
import { getDeliveryStatusForReqno } from "@/lib/deliveryStatus";

// GET /api/internal/delivery-status/{reqno}?testid=...
//
// Service-to-service read for labit-core (or any other internal caller): whether/how
// a report reached the patient (WhatsApp auto-dispatch + delivery/read receipts, a
// heuristic bot-pickup signal) and staff manual actions from the Report Dispatch UI.
// Called live, not cached -- intended use is a synchronous check at the moment a
// doctor attempts to unapprove a released report ("we can't unapprove, it's already
// been read"), so `summary.locked_from_unapprove` must reflect current truth, not a
// snapshot. See lib/deliveryStatus.js for the aggregation logic.
function getAuthToken(request) {
  return (
    request.headers.get("x-internal-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
}

export async function GET(request, { params }) {
  const expectedToken = process.env.LABIT_CORE_INTERNAL_TOKEN || "";
  if (!expectedToken) {
    return NextResponse.json({ error: "LABIT_CORE_INTERNAL_TOKEN not configured" }, { status: 503 });
  }
  const providedToken = getAuthToken(request);
  if (!providedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reqno } = params;
  const url = new URL(request.url);
  const testid = url.searchParams.get("testid") || undefined;

  try {
    const result = await getDeliveryStatusForReqno(reqno, { testid });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Failed to load delivery status" }, { status: 500 });
  }
}
