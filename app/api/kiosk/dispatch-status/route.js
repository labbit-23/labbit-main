import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { kioskIronOptions } from "@/lib/kioskSession";
import { getReportStatusByReqid } from "@/lib/neosoft/client";

function rowValue(row, ...keys) {
  if (!row || typeof row !== "object") return null;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const lowered = String(key).toLowerCase();
    const matched = Object.keys(row).find((candidate) => String(candidate).toLowerCase() === lowered);
    if (matched && row[matched] !== undefined && row[matched] !== null) return row[matched];
  }
  return null;
}

function extractReqPassword(reportStatus) {
  const topLevel = String(
    rowValue(
      reportStatus,
      "REQ_PASSWORD",
      "req_password",
      "REQPASSWORD",
      "reqpassword",
      "PWD",
      "pwd",
      "PASSWORD",
      "password"
    ) || ""
  ).trim();
  if (topLevel) return topLevel;

  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  for (const row of tests) {
    const candidate = String(
      rowValue(
        row,
        "REQ_PASSWORD",
        "req_password",
        "REQPASSWORD",
        "reqpassword",
        "PWD",
        "pwd",
        "PASSWORD",
        "password"
      ) || ""
    ).trim();
    if (candidate) return candidate;
  }
  return "";
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const kioskSession = await getIronSession(cookieStore, kioskIronOptions);
    const kioskUser = kioskSession?.kioskUser;
    if (!kioskUser?.authenticated) {
      return new Response("Kiosk login required", { status: 403 });
    }

    const url = new URL(request.url);
    const reqid = String(url.searchParams.get("reqid") || "").trim();
    const password = String(url.searchParams.get("password") || "").trim();
    if (!reqid) return new Response("Missing reqid", { status: 400 });
    if (!password) return new Response("Missing password", { status: 400 });

    const upstream = await getReportStatusByReqid(reqid);
    const upstreamPassword = extractReqPassword(upstream);
    if (!upstreamPassword) {
      return new Response("Upstream req-password missing", { status: 502 });
    }
    if (upstreamPassword !== password) {
      return new Response("Invalid requisition password", { status: 403 });
    }

    const proxyUrl = new URL("/api/admin/reports/dispatch-status", request.url);
    proxyUrl.searchParams.set("reqid", reqid);
    proxyUrl.searchParams.set("source", "kiosk");

    const proxied = await fetch(proxyUrl.toString(), {
      method: "GET",
      headers: {
        cookie: request.headers.get("cookie") || "",
        "x-report-source": "kiosk",
      },
      cache: "no-store",
    });

    const body = await proxied.text();
    return new Response(body, {
      status: proxied.status,
      headers: {
        "content-type": proxied.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed kiosk dispatch status validation" },
      { status: 500 }
    );
  }
}
