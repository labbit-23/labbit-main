///app/api/admin/reply/route.js

import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { supabase } from "@/lib/supabaseServer";
import { ironOptions } from "@/lib/session";
import { sendTextMessage } from "@/lib/whatsapp/sender";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseWhatsappInbox(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function phoneCandidates(value) {
  const digits = digitsOnly(value);
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  const canonical = last10?.length === 10 ? `91${last10}` : digits;
  return Array.from(new Set([value, digits, last10, canonical].filter(Boolean)));
}

export async function POST(req) {
  const response = NextResponse.next();

  try {
    const sessionData = await getIronSession(req, response, ironOptions);
    const user = sessionData?.user;

    if (!user || !canUseWhatsappInbox(user)) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = await req.json();
    const { phone, message } = body;

    if (!phone || !message) {
      return new Response("Missing phone or message", { status: 400 });
    }

    // Get latest session
    const labIds = Array.isArray(user.labIds) ? user.labIds.filter(Boolean) : [];

    let sessionQuery = supabase
      .from("chat_sessions")
      .select("*")
      .in("phone", phoneCandidates(phone))
      .order("created_at", { ascending: false })
      .limit(1);

    if (labIds.length > 0) {
      sessionQuery = sessionQuery.in("lab_id", labIds);
    }

    const { data: sessions } = await sessionQuery;
    const session = sessions?.[0];

    if (!session) {
      return new Response("Session not found", { status: 404 });
    }

    if (!session.last_user_message_at) {
      return new Response("Reply window expired", { status: 400 });
    }

    const within24Hours = Date.now() - new Date(session.last_user_message_at).getTime() < 24 * 60 * 60 * 1000;
    if (!within24Hours) {
      return new Response("Reply window expired", { status: 400 });
    }

    // Send WhatsApp message
    await sendTextMessage({
      labId: session.lab_id,
      phone: session.phone,
      text: message,
      sender: {
        id: user.id || null,
        name: user.name || null,
        role: getRoleKey(user) || null,
        userType: user.userType || null
      }
    });

    // Update timestamps
    await supabase
      .from("chat_sessions")
      .update({
        last_message_at: new Date(),
        updated_at: new Date()
      })
      .eq("id", session.id);

    return Response.json({ success: true });

  } catch (err) {
    console.error("Admin reply error:", err);
    return new Response("Internal server error", { status: 500 });
  }
}
