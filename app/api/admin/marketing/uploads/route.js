import { randomBytes } from "node:crypto";
import { supabase } from "@/lib/supabaseServer";
import { marketingRoute } from "@/lib/marketingCampaigns/adminAuth";
import { writeMarketingAudit } from "@/lib/marketingCampaigns/store";
import { readImageSize, validateHeaderImage, HEADER_IMAGE } from "@/lib/marketingUi/helpers";

// POST multipart/form-data { file } -> { ok, url, width, height, warnings[] }
// JPEG/PNG only, max 5 MB (hard errors); a non-1.91:1 ratio or width < 800px only warns. Stored in the existing public "uploads" bucket
// (same bucket + getPublicUrl approach as app/api/visits/upload-prescription) under marketing/headers/<random>.<ext>, so no new bucket
// is needed. The random 32-hex name is unguessable. Audit row carries size/type/ratio only, no patient data.
const EXT = { "image/jpeg": "jpg", "image/png": "png" };

export const POST = marketingRoute(async (request, { actor }) => {
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string" || !file.size) return { ok: false, error: "No file uploaded" };
  if (file.size > HEADER_IMAGE.maxBytes) return { ok: false, error: "The image is larger than 5 MB." };
  const buf = Buffer.from(await file.arrayBuffer());
  // Trust the bytes, not the browser-declared type or the file name.
  const info = readImageSize(buf);
  const check = validateHeaderImage({ type: info?.type, size: buf.length, width: info?.width, height: info?.height });
  if (!info || !check.ok) return { ok: false, error: check.errors[0] || "Only JPEG or PNG images are accepted." };

  const path = `marketing/headers/${randomBytes(16).toString("hex")}.${EXT[info.type]}`;
  const { error } = await supabase.storage.from("uploads").upload(path, buf, { contentType: info.type, cacheControl: "31536000", upsert: false });
  if (error) return { ok: false, error: `Upload failed: ${error.message}` };
  const { data } = supabase.storage.from("uploads").getPublicUrl(path);
  await writeMarketingAudit({ actor, action: "campaign.header_upload", details: { bytes: buf.length, type: info.type, width: info.width, height: info.height, warnings: check.warnings.length } });
  return { ok: true, url: data.publicUrl, width: info.width, height: info.height, warnings: check.warnings };
});
