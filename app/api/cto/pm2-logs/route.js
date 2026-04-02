import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { ironOptions } from "@/lib/session";

const execFileAsync = promisify(execFile);

function canAccessCto(user) {
  return user?.userType === "executive" && (user?.executiveType || "").toLowerCase() === "director";
}

function normalizeAppName(input = "") {
  const value = String(input || "").trim();
  if (!value) return "";
  return value.replace(/[^a-zA-Z0-9._-]/g, "");
}

async function listPm2Apps() {
  const { stdout } = await execFileAsync("pm2", ["jlist"], {
    timeout: 8000,
    maxBuffer: 1024 * 1024 * 4,
  });
  const rows = JSON.parse(stdout || "[]");
  return rows
    .map((row) => String(row?.name || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

async function tailPm2Logs(app, lines) {
  const args = ["logs", app, "--lines", String(lines), "--nostream"];
  const { stdout, stderr } = await execFileAsync("pm2", args, {
    timeout: 12000,
    maxBuffer: 1024 * 1024 * 8,
  });
  const merged = [stdout || "", stderr || ""].filter(Boolean).join("\n");
  return merged.slice(-200000);
}

export async function GET(request) {
  const response = NextResponse.next();
  try {
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;
    if (!canAccessCto(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const mode = String(url.searchParams.get("mode") || "list").trim().toLowerCase();

    if (mode === "list") {
      const apps = await listPm2Apps();
      return NextResponse.json({ apps });
    }

    if (mode === "tail") {
      const app = normalizeAppName(url.searchParams.get("app"));
      const linesRaw = Number(url.searchParams.get("lines") || 120);
      const lines = Number.isFinite(linesRaw) ? Math.min(Math.max(linesRaw, 20), 500) : 120;
      if (!app) return NextResponse.json({ error: "Missing app" }, { status: 400 });

      const apps = await listPm2Apps();
      if (!apps.includes(app)) {
        return NextResponse.json({ error: "Unknown PM2 app" }, { status: 400 });
      }

      const output = await tailPm2Logs(app, lines);
      return NextResponse.json({ app, lines, output });
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  } catch (error) {
    console.error("[cto/pm2-logs] unexpected error", error);
    return NextResponse.json({ error: "Failed to load PM2 logs" }, { status: 500 });
  }
}

