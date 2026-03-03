import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { phoneVariantsIndia, toCanonicalIndiaPhone } from "@/lib/phone";

function normalizeDirection(value) {
  const v = String(value || "").toLowerCase();
  if (v === "inbound" || v === "outbound" || v === "status") return v;
  return "outbound";
}

async function upsertSession({ labId, phone, name }) {
  const canonicalPhone = toCanonicalIndiaPhone(phone) || phone;
  const candidates = phoneVariantsIndia(canonicalPhone);

  const { data: existingRows } = await supabase
    .from("chat_sessions")
    .select("*")
    .in("phone", candidates)
    .eq("lab_id", labId)
    .order("last_message_at", { ascending: false })
    .limit(1);

  const existing = existingRows?.[0];
  if (existing) {
    const { data: updated } = await supabase
      .from("chat_sessions")
      .update({
        phone: canonicalPhone,
        patient_name: name || existing.patient_name || null,
        last_message_at: new Date(),
        updated_at: new Date()
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    return updated || existing;
  }

  const { data: created } = await supabase
    .from("chat_sessions")
    .insert({
      phone: canonicalPhone,
      lab_id: labId,
      patient_name: name || null,
      current_state: "HUMAN_HANDOVER",
      status: "active",
      last_message_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    })
    .select("*")
    .single();

  return created;
}

async function ingestOne({ labId, item }) {
  const phone = toCanonicalIndiaPhone(item?.phone) || item?.phone;
  if (!phone) {
    return { ok: false, reason: "missing phone" };
  }

  const direction = normalizeDirection(item?.direction);
  const externalMessageId = item?.message_id || item?.external_message_id || null;
  const createdAt = item?.created_at ? new Date(item.created_at) : new Date();
  const safeCreatedAt = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;

  if (externalMessageId) {
    const { data: dup } = await supabase
      .from("whatsapp_messages")
      .select("id")
      .eq("message_id", externalMessageId)
      .maybeSingle();
    if (dup) {
      return { ok: true, skipped: true, reason: "duplicate" };
    }
  }

  const session = await upsertSession({
    labId,
    phone,
    name: item?.name || null
  });

  const payload = (item?.payload && typeof item.payload === "object")
    ? item.payload
    : {};

  const { error: insertError } = await supabase.from("whatsapp_messages").insert({
    message_id: externalMessageId,
    lab_id: labId,
    phone,
    name: item?.name || null,
    message: item?.message || item?.text || "",
    direction,
    created_at: safeCreatedAt.toISOString(),
    payload: {
      source: "mirth_external_history",
      ...payload
    }
  });

  if (insertError) {
    return { ok: false, reason: insertError.message };
  }

  const shouldIncrementUnread = direction === "inbound" && session?.status === "handoff";
  await supabase
    .from("chat_sessions")
    .update({
      last_message_at: safeCreatedAt.toISOString(),
      last_user_message_at: direction === "inbound" ? safeCreatedAt.toISOString() : session?.last_user_message_at,
      unread_count: shouldIncrementUnread ? (session?.unread_count || 0) + 1 : (session?.unread_count || 0),
      patient_name: item?.name || session?.patient_name || null,
      updated_at: new Date()
    })
    .eq("id", session.id);

  return { ok: true, skipped: false };
}

export async function POST(req) {
  try {
    const token = req.headers.get("x-ingest-token") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const expectedToken = process.env.WHATSAPP_EXTERNAL_INGEST_TOKEN;
    if (!expectedToken || token !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const labId = body?.lab_id || process.env.DEFAULT_LAB_ID;
    if (!labId) {
      return NextResponse.json({ error: "Missing lab_id" }, { status: 400 });
    }

    const items = Array.isArray(body?.messages) ? body.messages : [body];
    const results = [];

    for (const item of items) {
      results.push(await ingestOne({ labId, item }));
    }

    const ingested = results.filter((r) => r.ok && !r.skipped).length;
    const skipped = results.filter((r) => r.ok && r.skipped).length;
    const failed = results.filter((r) => !r.ok).length;

    return NextResponse.json({
      success: failed === 0,
      ingested,
      skipped,
      failed,
      results
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
