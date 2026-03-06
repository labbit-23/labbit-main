//app/api/admin/whatsapp/media/route.js

import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const filedata = searchParams.get("filedata");

    if (!filedata) {
      return NextResponse.json(
        { error: "Missing filedata parameter" },
        { status: 400 }
      );
    }

    const providerUrl =`${process.env.WHATSAPP_MEDIA_URL}` +
      encodeURIComponent(filedata);

    const response = await fetch(providerUrl, {
      method: "GET",
      headers: {
        Authentication: `Bearer ${process.env.WHATSAPP_MEDIA_TOKEN}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Media fetch failed:", text);
      return NextResponse.json(
        { error: "Failed to fetch media" },
        { status: 500 }
      );
    }

    const contentType =
      response.headers.get("content-type") || "application/octet-stream";

    const buffer = await response.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400"
      }
    });
  } catch (err) {
    console.error("Media proxy error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}