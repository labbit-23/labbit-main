import { spawnSync } from "child_process";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const mediaId = searchParams.get("filedata");

    if (!mediaId) {
      return new Response("Missing media id", { status: 400 });
    }

    const token = process.env.WHATSAPP_MEDIA_TOKEN;

    // STEP 1: resolve media id → filedata
    const resolve = spawnSync("curl", [
    "--fail",
    "--location",
    `https://rcmmedia.instaalerts.zone/services/media/get?media_id=${mediaId}`,
    "--header",
    `Authorization: Bearer ${token}`
    ]);

    const resolveText = resolve.stdout.toString();

    let resolveJson;

    try {
    resolveJson = JSON.parse(resolveText);
    } catch {
    console.error("Media resolve returned non-JSON:", resolveText);
    return new Response("Media resolve failed", { status: 500 });
    }
    if (!resolveJson.filedata) {
      console.error("Media resolve failed:", resolveJson);
      return new Response(JSON.stringify(resolveJson), { status: 500 });
    }

    const filedata = resolveJson.filedata;

    // STEP 2: download actual media
    const download = spawnSync("curl", [
      "--location",
      `https://rcmmedia.instaalerts.zone/services/media/download?filedata=${filedata}`,
      "--header",
      `Authentication: Bearer ${token}`
    ]);

    return new Response(download.stdout, {
      headers: {
        "Content-Type": "image/*",
        "Cache-Control": "public, max-age=86400"
      }
    });

  } catch (err) {
    console.error("Media proxy error:", err);
    return new Response("Media fetch failed", { status: 500 });
  }
}