import { json, preflight } from "@/lib/appAuth/http";
import { authenticate, logout } from "@/lib/appAuth/service";

export const OPTIONS = preflight;

export async function POST(request) {
  const auth = await authenticate(request);
  if (!auth) return json(request, { error: "Not authenticated" }, 401);
  await logout(auth.sessionId);
  return json(request, { ok: true });
}
