// File: app/api/internal/app-booking/pre-requisitions/[id]/convert/route.js
//
// POST { amount, reference } -> converts a pre-requisition into a real
// requisition + invoice + receipt, with the payment already declared.
//
// ★ ONLY call this after Cashfree's WEBHOOK confirms the charge (see
// labit-app/api/app/payments.py's cashfree_webhook) -- `reference` must be
// Cashfree's own confirmed payment/order id, never a client-supplied value
// and never called off the client-side "payment succeeded" redirect alone.
// labit-core enforces payments must sum to exactly the net amount; this
// route does not (and must not) try to soften that -- a rejection here
// means the amount genuinely doesn't match, which needs a human to look at,
// not a retry with a guessed number.
import { NextResponse } from "next/server";
import { appHubAuthorized } from "@/lib/appHubAuth";
import { convertPreRequisition } from "@/lib/labitCoreBooking";

export async function POST(request, { params }) {
  if (!appHubAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const amount = Number(body?.amount);
  const reference = String(body?.reference || "").trim();
  if (!id || !amount || amount <= 0 || !reference) {
    return NextResponse.json({ error: "amount and reference are required" }, { status: 400 });
  }
  try {
    const result = await convertPreRequisition({ preRequisitionId: id, amount, reference });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[app-booking/pre-requisitions/convert] error", err);
    // 502, not the labit-core status verbatim -- a payment mismatch here is
    // a real incident (money taken, requisition not created), not a normal
    // 4xx the patient can self-correct; surfaced generically, logged loudly.
    return NextResponse.json({ error: "Could not finalize the booking -- support has been notified" }, { status: 502 });
  }
}
