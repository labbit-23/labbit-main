import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseWhatsappInbox(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

function sanitizeFilename(name) {
  const cleaned = String(name || "")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .trim();
  return cleaned || "";
}

function extFromMime(mimeType) {
  const mime = String(mimeType || "").toLowerCase().split(";")[0].trim();
  if (!mime) return "";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("msword")) return "doc";
  if (mime.includes("officedocument.wordprocessingml")) return "docx";
  if (mime.includes("ms-excel")) return "xls";
  if (mime.includes("officedocument.spreadsheetml")) return "xlsx";
  if (mime.includes("plain")) return "txt";
  return "";
}

function mimeFromExt(filename) {
  const name = String(filename || "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".txt")) return "text/plain";
  return "";
}

function pickMediaMeta(payload) {
  const rawMsg =
    payload?.raw_message ||
    payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ||
    null;

  const docFilename =
    payload?.media?.filename ||
    rawMsg?.document?.filename ||
    payload?.request?.document?.filename ||
    "";

  const mimeType =
    payload?.media?.mime_type ||
    rawMsg?.document?.mime_type ||
    rawMsg?.image?.mime_type ||
    "";

  return {
    filename: sanitizeFilename(docFilename),
    mimeType: String(mimeType || "").trim()
  };
}

export async function GET(request) {
  const response = NextResponse.next();

  try {
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;

    if (!user || !canUseWhatsappInbox(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    const mediaId =
      searchParams.get("media_id") ||
      searchParams.get("filedata");
    const mediaKind = String(searchParams.get("kind") || "").toLowerCase();
    const queryFilename = sanitizeFilename(searchParams.get("filename") || "");

    if (!mediaId) {
      return new NextResponse("Missing media_id or phone", { status: 400 });
    }

    const labIds = Array.isArray(user.labIds) ? user.labIds.filter(Boolean) : [];

    // Locate the message that contains this media
    let messageQuery = supabase
    .from("whatsapp_messages")
    .select("lab_id,payload")
    .or(
        `payload->media->>id.eq.${mediaId},payload->raw_message->image->>id.eq.${mediaId},payload->raw_message->document->>id.eq.${mediaId}`
    )
    .limit(1);

    if (labIds.length > 0) {
      messageQuery = messageQuery.in("lab_id", labIds);
    }

    const { data: messageRow, error: messageError } = await messageQuery.maybeSingle();

    if (messageError || !messageRow) {
      console.error("Media message lookup failed", messageError);
      return new NextResponse("Media not found", { status: 404 });
    }

    const labId = messageRow.lab_id;
    const mediaMeta = pickMediaMeta(messageRow.payload || {});

    // Load WhatsApp API config
    const { data: apiRow, error: apiError } = await supabase
      .from("labs_apis")
      .select("base_url, auth_details")
      .eq("lab_id", labId)
      .eq("api_name", "whatsapp_outbound")
      .maybeSingle();

    if (apiError || !apiRow) {
      console.error("labs_apis lookup failed", apiError);
      return new NextResponse("API config missing", { status: 500 });
    }

    const baseUrl = apiRow.base_url;
    const apiKey =
      apiRow.auth_details?.api_key ||
      apiRow.auth_details?.apikey;

    if (!baseUrl || !apiKey) {
      return new NextResponse("MessagingHub credentials missing", { status: 500 });
    }

    // Remove /messages
    const baseWithoutMessages = baseUrl.replace(/\/messages$/, "");

    // Extract account id
    const accountId = baseWithoutMessages.split("/meta/")[1];

    if (!accountId) {
      return new NextResponse("Invalid MessagingHub base_url", { status: 500 });
    }

    const downloadUrl =
      `https://messaginghub.solutions/relaybridge/api/v1/meta/${accountId}/${mediaId}/media/download`;

    const mediaResponse = await fetch(downloadUrl, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      }
    });

    if (!mediaResponse.ok) {
      const text = await mediaResponse.text();
      console.error("Media download failed:", text);
      return new NextResponse("Media download failed", { status: 500 });
    }

    const buffer = await mediaResponse.arrayBuffer();

    let contentType =
      mediaResponse.headers.get("content-type") ||
      mediaMeta.mimeType ||
      "";

    let filename = mediaMeta.filename || queryFilename || `media_${mediaId}`;
    if (!contentType || String(contentType).includes("application/octet-stream")) {
      const fromName = mimeFromExt(filename);
      if (fromName) {
        contentType = fromName;
      } else if (mediaKind === "image") {
        contentType = "image/jpeg";
      } else {
        contentType = "application/octet-stream";
      }
    }

    const ext = extFromMime(contentType) || extFromMime(mediaMeta.mimeType);
    if (ext && !filename.toLowerCase().endsWith(`.${ext}`)) {
      filename = `${filename}.${ext}`;
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${sanitizeFilename(filename) || `media_${mediaId}`}"`,
        "Cache-Control": "public, max-age=86400"
      }
    });

  } catch (err) {
    console.error("Media proxy error:", err);
    return new NextResponse("Media fetch failed", { status: 500 });
  }
}
