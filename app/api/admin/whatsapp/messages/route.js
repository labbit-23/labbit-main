import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { phoneVariantsIndia } from "@/lib/phone";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseWhatsappInbox(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

function phoneCandidates(phone) {
  return phoneVariantsIndia(phone);
}

function pickBestPatient({ byPhone = [], byId = null }) {
  const sorted = [...byPhone].sort((a, b) => {
    const at = new Date(a?.created_at || 0).getTime();
    const bt = new Date(b?.created_at || 0).getTime();
    return bt - at;
  });
  const phoneNonLead = sorted.find((p) => !p?.is_lead);
  if (phoneNonLead) return phoneNonLead;
  if (byId && !byId.is_lead) return byId;
  if (sorted[0]) return sorted[0];
  return byId || null;
}

function uniquePatients(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!row?.id || map.has(row.id)) continue;
    map.set(row.id, row);
  }
  return [...map.values()];
}

function uniqueNames(values = []) {
  return Array.from(
    new Set(
      values
        .map((v) => String(v || "").trim())
        .filter(Boolean)
    )
  );
}

function pickLatestProfileName(messageRows = []) {
  return (
    (messageRows || [])
      .map((row) => row?.name || row?.payload?.profile_name)
      .find((value) => typeof value === "string" && value.trim()) || null
  );
}

function shouldSignStoragePath(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^https?:\/\//i.test(text)) return false;
  return text.startsWith("uploads/");
}

function parseMaybeJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
}

function normalizedUnread(row) {
  const status = String(row?.status || "").toLowerCase();
  const isAgentQueue = status === "pending" || status === "handoff";
  return isAgentQueue ? Number(row?.unread_count || 0) : 0;
}

function extractMediaFromPayload(payload = {}) {
  const rawMessage = payload?.raw_message || {};
  const rawBodyMessage =
    payload?.raw_body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ||
    payload?.raw_body?.value?.messages?.[0] ||
    {};

  const image =
    rawMessage?.image ||
    rawBodyMessage?.image ||
    null;
  const document =
    rawMessage?.document ||
    rawBodyMessage?.document ||
    null;

  if (image) {
    return {
      type: "image",
      url: image?.link || image?.url || image?.image_url || null,
      id: image?.id || null,
      filename: null
    };
  }

  if (document) {
    return {
      type: "document",
      url: document?.link || document?.url || document?.document_url || null,
      id: document?.id || null,
      filename: document?.filename || null
    };
  }

  return null;
}

async function resolveMediaUrlById({ mediaId, mediaFetchConfig, authDetails }) {
  if (!mediaId || !mediaFetchConfig?.url) return null;

  const method = String(mediaFetchConfig.method || "GET").toUpperCase();
  const rawHeaders = mediaFetchConfig.headers && typeof mediaFetchConfig.headers === "object"
    ? mediaFetchConfig.headers
    : {};
  const headers = { ...rawHeaders };

  const apiKey = authDetails?.api_key || authDetails?.apikey || null;
  if (apiKey) {
    headers[mediaFetchConfig.api_key_header || "X-API-KEY"] = apiKey;
  }

  const bearerToken = mediaFetchConfig.bearer_token || authDetails?.bearer_token || null;
  if (bearerToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  const url = String(mediaFetchConfig.url)
    .replace("{media_id}", encodeURIComponent(String(mediaId)));

  const response = await fetch(url, {
    method,
    headers
  });
  if (!response.ok) return null;

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    return null;
  }

  return (
    body?.url ||
    body?.link ||
    body?.media_url ||
    body?.download_url ||
    body?.data?.url ||
    body?.data?.link ||
    body?.result?.url ||
    null
  );
}

export async function GET(request) {
  const response = NextResponse.next();

  try {
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;

    if (!user || !canUseWhatsappInbox(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const phone = request.nextUrl.searchParams.get("phone");
    const before = request.nextUrl.searchParams.get("before");
    const limitParam = Number(request.nextUrl.searchParams.get("limit") || 80);
    const pageLimit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 20), 200) : 80;
    if (!phone) {
      return NextResponse.json({ error: "Missing phone" }, { status: 400 });
    }

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

    const { data: chatSessions, error: sessionError } = await sessionQuery;

    if (sessionError) {
      console.error("[whatsapp/messages] session fetch error", sessionError);
      return NextResponse.json({ error: "Failed to validate chat access" }, { status: 500 });
    }

    const chatSession = chatSessions?.[0];
    if (!chatSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    let allSessionNamesQuery = supabase
      .from("chat_sessions")
      .select("patient_name,last_message_at,created_at")
      .in("phone", phoneCandidates(phone))
      .order("last_message_at", { ascending: false })
      .limit(100);

    if (labIds.length > 0) {
      allSessionNamesQuery = allSessionNamesQuery.in("lab_id", labIds);
    } else if (chatSession.lab_id) {
      allSessionNamesQuery = allSessionNamesQuery.eq("lab_id", chatSession.lab_id);
    }

    const { data: allSessionNames } = await allSessionNamesQuery;

    let messagesQuery = supabase
      .from("whatsapp_messages")
      .select("*")
      .in("phone", phoneCandidates(phone));

    if (labIds.length > 0) {
      messagesQuery = messagesQuery.in("lab_id", labIds);
    } else if (chatSession.lab_id) {
      messagesQuery = messagesQuery.eq("lab_id", chatSession.lab_id);
    }

    if (before) {
      messagesQuery = messagesQuery
        .lt("created_at", before)
        .order("created_at", { ascending: false })
        .limit(pageLimit);
    } else {
      const cutoffDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      messagesQuery = messagesQuery
        .gte("created_at", cutoffDate)
        .order("created_at", { ascending: true });
    }

    const { data: messages, error: messagesError } = await messagesQuery;

    if (messagesError) {
      console.error("[whatsapp/messages] message fetch error", messagesError);
      return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
    }

    let lab = null;
    let mediaResolverConfig = null;
    let mediaResolverAuth = {};
    const defaultBotLabelMap = {
      "Main Menu Sent": "Shared main menu options",
      "More Services Menu Sent": "Shared more services menu",
      "Location Sent": "Shared lab location"
    };
    let botLabelMap = { ...defaultBotLabelMap };

    if (chatSession.lab_id) {
      const { data: labData } = await supabase
        .from("labs")
        .select("id, name, logo_url")
        .eq("id", chatSession.lab_id)
        .maybeSingle();
      lab = labData || null;

      const { data: waApiData } = await supabase
        .from("labs_apis")
        .select("templates, auth_details")
        .eq("lab_id", chatSession.lab_id)
        .eq("api_name", "whatsapp_outbound")
        .maybeSingle();

      const templates = parseMaybeJson(waApiData?.templates);
      mediaResolverConfig = templates?.media_fetch || templates?.media_resolver || null;
      mediaResolverAuth = waApiData?.auth_details || {};

      const customLabels =
        templates?.chat_history_labels ||
        templates?.bot_history_labels ||
        templates?.whatsapp_chat_labels ||
        {};

      if (customLabels && typeof customLabels === "object" && !Array.isArray(customLabels)) {
        botLabelMap = { ...defaultBotLabelMap, ...customLabels };
      }
    }

    let linkedById = null;
    if (chatSession.patient_id) {
      const { data: byId } = await supabase
        .from("patients")
        .select("id, name, is_lead, phone, created_at")
        .eq("id", chatSession.patient_id)
        .maybeSingle();
      linkedById = byId || null;
    }

    const { data: byPhoneRows } = await supabase
      .from("patients")
      .select("id, name, is_lead, phone, created_at")
      .in("phone", phoneCandidates(chatSession.phone))
      .limit(10);

    const linkedPatient = pickBestPatient({
      byPhone: byPhoneRows || [],
      byId: linkedById
    });
    const matchedPatients = uniquePatients(byPhoneRows || []).sort(
      (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
    );
    const matchedPatientCount = matchedPatients.length;
    let latestProfileNameQuery = supabase
      .from("whatsapp_messages")
      .select("name,payload,created_at")
      .in("phone", phoneCandidates(phone))
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(50);

    if (labIds.length > 0) {
      latestProfileNameQuery = latestProfileNameQuery.in("lab_id", labIds);
    } else if (chatSession.lab_id) {
      latestProfileNameQuery = latestProfileNameQuery.eq("lab_id", chatSession.lab_id);
    }

    const { data: latestInboundRows } = await latestProfileNameQuery;
    const latestInboundProfileName = pickLatestProfileName(latestInboundRows);
    const latestChatName = latestInboundProfileName || null;
    const patientNameCandidates = uniqueNames(
      [...(byPhoneRows || [])]
        .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
        .map((row) => row?.name)
    );
    const displayName = latestChatName || chatSession.phone || "Unknown";
    const hasNonLead = matchedPatients.some((p) => !p?.is_lead);

    const enrichedSession = {
      ...chatSession,
      unread_count: normalizedUnread(chatSession),
      patient_name: displayName,
      contact_type: hasNonLead ? "patient" : "lead",
      chat_name: latestChatName,
      resolved_patient_name: linkedPatient?.name || null,
      name_candidates: patientNameCandidates,
      has_multiple_names: patientNameCandidates.length > 1,
      matched_patient_count: matchedPatientCount,
      matched_patients: matchedPatients.map((p) => ({
        id: p.id,
        name: p.name || "Unknown",
        is_lead: Boolean(p.is_lead)
      }))
    };

    let normalizedMessages = before ? [...(messages || [])].reverse() : (messages || []);
    normalizedMessages = await Promise.all(
      normalizedMessages.map(async (row) => {
        const extractedMedia = extractMediaFromPayload(row?.payload || {});
        const mergedMedia = {
          ...(extractedMedia || {}),
          ...(row?.payload?.media || {})
        };
        const mediaId = mergedMedia?.id || null;
        let mediaUrl = mergedMedia?.url;

        if (!mediaUrl && mediaId && mediaResolverConfig) {
          const resolvedUrl = await resolveMediaUrlById({
            mediaId,
            mediaFetchConfig: mediaResolverConfig,
            authDetails: mediaResolverAuth
          });
          if (resolvedUrl) {
            mediaUrl = resolvedUrl;
          }
        }

        if (!shouldSignStoragePath(mediaUrl)) {
          if (!row?.payload?.media && extractedMedia) {
            return {
              ...row,
              payload: {
                ...(row.payload || {}),
                media: mergedMedia
              }
            };
          }
          if (mediaUrl && mediaUrl !== mergedMedia?.url) {
            return {
              ...row,
              payload: {
                ...(row.payload || {}),
                media: {
                  ...(mergedMedia || {}),
                  url: mediaUrl
                }
              }
            };
          }
          return row;
        }

        const filePath = String(mediaUrl).replace(/^uploads\//, "");
        const { data: signed } = await supabase.storage
          .from("uploads")
          .createSignedUrl(filePath, 60 * 60);

        if (!signed?.signedUrl) {
          if (!row?.payload?.media && extractedMedia) {
            return {
              ...row,
              payload: {
                ...(row.payload || {}),
                media: mergedMedia
              }
            };
          }
          return row;
        }
        return {
          ...row,
          payload: {
            ...(row.payload || {}),
            media: {
              ...(mergedMedia || {}),
              url: signed.signedUrl
            }
          }
        };
      })
    );
    const oldestLoadedAt = normalizedMessages[0]?.created_at || null;

    let hasOlder = false;
    let nextBeforeCursor = oldestLoadedAt;
    if (oldestLoadedAt) {
      let olderQuery = supabase
        .from("whatsapp_messages")
        .select("id")
        .in("phone", phoneCandidates(phone))
        .lt("created_at", oldestLoadedAt)
        .limit(1);

      if (labIds.length > 0) {
        olderQuery = olderQuery.in("lab_id", labIds);
      } else if (chatSession.lab_id) {
        olderQuery = olderQuery.eq("lab_id", chatSession.lab_id);
      }

      const { data: olderRows } = await olderQuery;
      hasOlder = Boolean(olderRows?.length);
    } else if (!before) {
      let anyHistoryQuery = supabase
        .from("whatsapp_messages")
        .select("id")
        .in("phone", phoneCandidates(phone))
        .limit(1);

      if (labIds.length > 0) {
        anyHistoryQuery = anyHistoryQuery.in("lab_id", labIds);
      } else if (chatSession.lab_id) {
        anyHistoryQuery = anyHistoryQuery.eq("lab_id", chatSession.lab_id);
      }

      const { data: anyRows } = await anyHistoryQuery;
      hasOlder = Boolean(anyRows?.length);
      if (hasOlder) {
        nextBeforeCursor = new Date().toISOString();
      }
    }

    return NextResponse.json(
      {
        messages: normalizedMessages,
        session: enrichedSession,
        lab,
        botLabelMap,
        pagination: {
          has_older: hasOlder,
          next_before: nextBeforeCursor,
          page_size: before ? pageLimit : normalizedMessages.length,
          initial_window_days: 2
        }
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[whatsapp/messages] unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
