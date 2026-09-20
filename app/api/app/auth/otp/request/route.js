import { json, preflight } from "@/lib/appAuth/http";
import { requestOtp } from "@/lib/appAuth/service";

export const OPTIONS = preflight;

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  try {
    const result = await requestOtp(body?.phone);
    if (result.error) return json(request, { error: result.error }, result.status);
    return json(request, { ok: true });
  } catch (err) {
    console.error("[app-auth] otp request failed:", err);
    return json(request, { error: "Could not send code. Try again." }, 500);
  }
}
