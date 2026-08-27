import { requireCto, proxyDeliverJson } from "../_proxy";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = await requireCto(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  return proxyDeliverJson("/test/dispatch", { method: "POST", body });
}

