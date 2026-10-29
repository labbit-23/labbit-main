import { proxyPanel } from "@/lib/panelProxy";

export const dynamic = "force-dynamic";

export async function GET(request) {
  return proxyPanel(request, "/menu");
}
