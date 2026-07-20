import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { ironOptions } from "@/lib/session";

const execFileAsync = promisify(execFile);
const ALLOWED_APPS = new Set(["report-enqueue-watch", "report-sender"]);

function canAccessCto(user) {
  return user?.userType === "executive" && (user?.executiveType || "").toLowerCase() === "director";
}

function normalizeAppName(input = "") {
  return String(input || "").trim().replace(/[^a-zA-Z0-9._-]/g, "");
}

async function listPm2Apps() {
  const { stdout } = await execFileAsync("pm2", ["jlist"], {
    timeout: 8000,
    maxBuffer: 1024 * 1024 * 4,
  });
  const rows = JSON.parse(stdout || "[]");
  return rows.map((row) => String(row?.name || "").trim()).filter(Boolean);
}

export async function POST(request) {
  const response = NextResponse.next();
  try {
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;
    if (!canAccessCto(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    const app = normalizeAppName(body?.app);

    if (action !== "restart") {
      return NextResponse.json({ error: "Unsupported PM2 action" }, { status: 400 });
    }
    if (!ALLOWED_APPS.has(app)) {
      return NextResponse.json({ error: "PM2 app is not restart-enabled from CTO" }, { status: 400 });
    }

    const apps = await listPm2Apps();
    if (!apps.includes(app)) {
      return NextResponse.json({ error: "PM2 app is not running on this node" }, { status: 404 });
    }

    const { stdout, stderr } = await execFileAsync("pm2", ["restart", app, "--update-env"], {
      timeout: 20000,
      maxBuffer: 1024 * 1024 * 4,
    });

    console.info("[cto/pm2-actions] restart", {
      app,
      actor: user?.id || user?.name || "director",
    });

    return NextResponse.json({
      ok: true,
      action,
      app,
      message: `${app} restart requested`,
      output: [stdout || "", stderr || ""].filter(Boolean).join("\n").slice(-12000),
    });
  } catch (error) {
    console.error("[cto/pm2-actions] unexpected error", error);
    return NextResponse.json({ error: "Failed to run PM2 action" }, { status: 500 });
  }
}
