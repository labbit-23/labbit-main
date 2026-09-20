import { json, preflight } from "@/lib/appAuth/http";
import { verifyOtp } from "@/lib/appAuth/service";

export const OPTIONS = preflight;

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  try {
    const result = await verifyOtp(body?.phone, body?.otp, body?.device_label);
    if (result.error) return json(request, { error: result.error }, result.status);
    return json(request, result.session);
  } catch (err) {
    console.error("[app-auth] otp verify failed:", err);
    return json(request, { error: "Could not verify code. Try again." }, 500);
  }
}
