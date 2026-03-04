import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { phoneVariantsIndia } from "@/lib/phone";
import { sendDocumentMessage } from "@/lib/whatsapp/sender";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseWhatsappInbox(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

export async function POST(req) {
  const response = NextResponse.next();
  try {
    const sessionData = await getIronSession(req, response, ironOptions);
    const user = sessionData?.user;
    if (!user || !canUseWhatsappInbox(user)) {
      return new Response("Forbidden", { status: 403 });
    }

    const form = await req.formData();
    const phone = String(form.get("phone") || "");
    const caption = String(form.get("caption") || "");
    const file = form.get("file");

    if (!phone || !file || typeof file === "string") {
      return new Response("Missing phone or file", { status: 400 });
    }

    const labIds = Array.isArray(user.labIds) ? user.labIds.filter(Boolean) : [];
    let sessionQuery = supabase
      .from("chat_sessions")
      .select("*")
      .in("phone", phoneVariantsIndia(phone))
      .order("created_at", { ascending: false })
      .limit(1);
    if (labIds.length > 0) {
      sessionQuery = sessionQuery.in("lab_id", labIds);
    }
    const { data: sessions } = await sessionQuery;
    const chatSession = sessions?.[0];
    if (!chatSession) return new Response("Session not found", { status: 404 });

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const safeName = `${Date.now()}-${file.name || "attachment"}`.replace(/\s+/g, "_");
    const path = `whatsapp-admin/${chatSession.lab_id}/${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("uploads")
      .upload(path, fileBuffer, {
        upsert: false,
        contentType: file.type || "application/octet-stream"
      });
    if (uploadError) {
      return new Response(uploadError.message || "Failed to upload file", { status: 500 });
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from("uploads")
      .createSignedUrl(path, 60 * 60);
    if (signedError || !signedData?.signedUrl) {
      return new Response("Failed to create file URL", { status: 500 });
    }

    await sendDocumentMessage({
      labId: chatSession.lab_id,
      phone: chatSession.phone,
      documentUrl: signedData.signedUrl,
      filename: file.name || "attachment",
      caption,
      sender: {
        id: user.id || null,
        name: user.name || null,
        role: getRoleKey(user) || null,
        userType: user.userType || null
      }
    });

    await supabase
      .from("chat_sessions")
      .update({ unread_count: 0, last_message_at: new Date(), updated_at: new Date() })
      .eq("id", chatSession.id);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return new Response(err?.message || "Internal server error", { status: 500 });
  }
}
