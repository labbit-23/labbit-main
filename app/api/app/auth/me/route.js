import { json, preflight } from "@/lib/appAuth/http";
import { authenticate } from "@/lib/appAuth/service";

export const OPTIONS = preflight;

export async function GET(request) {
  const auth = await authenticate(request);
  if (!auth) return json(request, { error: "Not authenticated" }, 401);
  return json(request, { patient: auth.patient });
}
