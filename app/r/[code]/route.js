import crypto from "crypto";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";

function firstHeaderValue(value) {
  return String(value || "")
    .split(",")[0]
    .trim();
}

function hashIp(ip) {
  const raw = String(ip || "").trim();
  if (!raw) return null;
  const salt = String(process.env.SHORT_LINK_IP_HASH_SALT || "").trim();
  return crypto.createHash("sha256").update(`${salt}:${raw}`).digest("hex");
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms)) return false;
  return ms <= Date.now();
}

function isValidRedirectUrl(urlText) {
  try {
    const parsed = new URL(String(urlText || ""));
    if (parsed.protocol !== "https:") return false;
    return true;
  } catch {
    return false;
  }
}

export async function GET(request, { params }) {
  const code = String(params?.code || "").trim();
  if (!code) {
    return NextResponse.json({ error: "Invalid short link" }, { status: 400 });
  }

  const { data: link, error } = await supabase
    .from("campaign_short_links")
    .select("id, long_url, is_active, expires_at, max_clicks, click_count")
    .eq("code", code)
    .single();

  if (error || !link) {
    return NextResponse.json({ error: "Short link not found" }, { status: 404 });
  }

  const clickCount = Number(link.click_count || 0);
  const maxClicks = link.max_clicks == null ? null : Number(link.max_clicks);
  const blockedByClicks = maxClicks != null && clickCount >= maxClicks;

  if (!link.is_active || isExpired(link.expires_at) || blockedByClicks) {
    return NextResponse.json({ error: "Short link expired" }, { status: 410 });
  }

  if (!isValidRedirectUrl(link.long_url)) {
    return NextResponse.json({ error: "Invalid redirect target" }, { status: 400 });
  }

  const ipHash = hashIp(firstHeaderValue(request.headers.get("x-forwarded-for")));
  const userAgent = String(request.headers.get("user-agent") || "").trim() || null;
  const referer = String(request.headers.get("referer") || "").trim() || null;

  const nowIso = new Date().toISOString();
  const nextCount = clickCount + 1;

  const logTasks = [];
  logTasks.push(
    supabase
      .from("campaign_short_links")
      .update({ click_count: nextCount, last_clicked_at: nowIso, updated_at: nowIso })
      .eq("id", link.id)
  );
  logTasks.push(
    supabase
      .from("campaign_short_link_clicks")
      .insert({
        short_link_id: link.id,
        user_agent: userAgent,
        referer,
        ip_hash: ipHash
      })
  );

  Promise.allSettled(logTasks).catch(() => {});

  return NextResponse.redirect(link.long_url, { status: 302 });
}
