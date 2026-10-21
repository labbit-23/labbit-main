import { NextResponse } from "next/server";
import { appHubAuthorized } from "@/lib/appHubAuth";
import { issueQrSession } from "@/lib/appAuth/service";

// POST /api/internal/app-auth/qr-session
// Body: { phone, login_method: "qr:<provider>:<patientId>:<requisitionId>", device_label? }
//
// Service-to-service (labit-app API), called ONLY after the lab itself has
// accepted the printed-bill QR. Issues a limited, short-lived app session for
// the patient's account (see lib/appAuth/service.js issueQrSession). The caller
// -- not the browser -- supplies the phone, taken from the lab's own record.
export async function POST(request) {
  if (!appHubAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const r = await issueQrSession(body?.phone, body?.login_method, body?.device_label);
    if (r.error) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r.session, { status: 201 });
  } catch (err) {
    console.error("[app-auth/qr-session] failed", err);
    return NextResponse.json({ error: "Could not start the session" }, { status: 500 });
  }
}
