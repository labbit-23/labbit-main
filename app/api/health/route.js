import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "labbit",
    checked_at: new Date().toISOString(),
  });
}
