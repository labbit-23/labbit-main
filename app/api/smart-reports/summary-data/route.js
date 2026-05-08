import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      message: "Deprecated route. Use /api/report-summary.",
      backup: "app/api/smart-reports/summary-data/Codex_letdown.js"
    },
    { status: 410 }
  );
}
