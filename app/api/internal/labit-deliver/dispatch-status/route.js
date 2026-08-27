import { requireCto, proxyDeliverJson } from "../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireCto(request);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  return proxyDeliverJson("/dispatch-status", { searchParams: url.searchParams });
}

