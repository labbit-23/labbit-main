import { readdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "kiosk-info");
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const slides = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map((name) => ({ name, src: `/kiosk-info/${encodeURIComponent(name)}` }));

    return NextResponse.json({ ok: true, slides });
  } catch (error) {
    return new Response(error?.message || "Failed to load kiosk info slides", { status: 500 });
  }
}
