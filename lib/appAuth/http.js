import { NextResponse } from "next/server";

// The Labit App runs from capacitor://localhost (iOS), https://localhost
// (Android) or its own web origin -- all cross-origin to the hub, so
// /api/app/* answers CORS itself. Bearer auth, no cookies: credentials
// are never allowed cross-origin here.
const DEFAULT_ORIGINS = [
  "capacitor://localhost",
  "https://localhost",
  "http://localhost:3000",
];

function allowedOrigins() {
  const extra = String(process.env.APP_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const headers = { Vary: "Origin" };
  if (allowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

export function json(request, body, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders(request) });
}

export function preflight(request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
