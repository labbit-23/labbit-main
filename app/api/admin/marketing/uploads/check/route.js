import { marketingRoute, readJson } from "@/lib/marketingCampaigns/adminAuth";
import { isCheckableImageUrl } from "@/lib/marketingUi/helpers";

// POST { url } -> { ok, reachable, status, content_type, reason? }. Server-side GET (Meta fetches the header the same way), https and
// public hostnames only, no redirects followed, 8 s timeout, body never read. Used to block test/pilot when the header is not fetchable.
export const POST = marketingRoute(async (request) => {
  const { url } = await readJson(request);
  if (!isCheckableImageUrl(url)) return { ok: true, reachable: false, reason: "The header URL must be a public https address." };
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8000), headers: { Range: "bytes=0-0", Accept: "image/*" } });
    const type = String(res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    try { await res.body?.cancel(); } catch {}
    const okStatus = res.status === 200 || res.status === 206;
    const isImage = /^image\/(jpeg|png)$/.test(type);
    return { ok: true, reachable: okStatus && isImage, status: res.status, content_type: type || null, reason: !okStatus ? `The address returned HTTP ${res.status}.` : !isImage ? `The address returned ${type || "no content type"}, not a JPEG/PNG image.` : null };
  } catch (e) {
    return { ok: true, reachable: false, reason: `Could not fetch the address (${e?.name === "TimeoutError" ? "timed out" : "network error"}).` };
  }
});
