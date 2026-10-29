import { NextResponse } from "next/server";
import { proxyPanel } from "@/lib/panelProxy";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { id } = await params;
  if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid node id" }, { status: 400 });
  }
  return proxyPanel(request, `/monitor/nodes/${id}/uptime`);
}
