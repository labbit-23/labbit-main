// Staff actions on an inbox thread. Side effects via `deps` (tests mock them).
import { windowState } from "./window.js";
import { last10 } from "./store.js";

/**
 * Free-form reply only inside the 24 h window. Outside it the staff member must pick one of the pre-approved templates listed in
 * settings.params.window_reopen_templates (we never invent templates); otherwise the call is refused with window_closed.
 */
export async function replyToThread({ thread, text, template, staffUserId }, deps) {
  const settings = await deps.loadSettings();
  const body = String(text || "").trim();
  const win = windowState(thread.last_inbound_at, deps.now ? deps.now() : Date.now());

  if (win.open && body) {
    if (body.length > 1000) return { ok: false, status: 400, error: "reply_too_long" };
    await deps.sendText({ phone: thread.phone10, labId: thread.lab_id, text: body });
    await deps.appendThreadMessage({ threadId: thread.id, direction: "out", sender: "staff", body, staffUserId, kind: "text" });
    await deps.recordEvent({ phone_hash: thread.phone_hash, mrn: thread.mrn, thread_id: thread.id, event_type: "staff_reply", direction: "out", detail: { kind: "text" } });
    await deps.markReplied?.(thread.id);
    return { ok: true, sent: "text", window: win };
  }

  if (!win.open) {
    const allowed = settings.params.window_reopen_templates || [];
    const chosen = template && allowed.find((t) => t.name === template.name);
    if (!chosen) {
      await deps.recordEvent({ phone_hash: thread.phone_hash, mrn: thread.mrn, thread_id: thread.id, event_type: "window_closed_skip", detail: { by: "staff" } });
      return { ok: false, status: 409, error: "window_closed", window: win, allowed_templates: allowed.map((t) => ({ name: t.name, label: t.label, params: t.params })) };
    }
    const params = Array.isArray(template.params) ? template.params.map((p) => String(p).slice(0, 200)) : [];
    await deps.sendTemplate({ phone: thread.phone10, labId: thread.lab_id, templateName: chosen.name, languageCode: chosen.language || "en", templateParams: params });
    await deps.appendThreadMessage({ threadId: thread.id, direction: "out", sender: "staff", body: `[template ${chosen.name}]`, staffUserId, kind: "template" });
    await deps.recordEvent({ phone_hash: thread.phone_hash, mrn: thread.mrn, thread_id: thread.id, event_type: "staff_reply", direction: "out", detail: { kind: "template", template: chosen.name } });
    await deps.markReplied?.(thread.id);
    return { ok: true, sent: "template", window: win };
  }
  return { ok: false, status: 400, error: "text_required" };
}

export function normaliseTags(list) {
  return [...new Set((Array.isArray(list) ? list : []).map((t) => String(t).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 24)).filter(Boolean))].slice(0, 10);
}

export function publicThread(t) {
  return {
    id: t.id, status: t.status, reason: t.reason, phone_masked: t.phone10 ? `******${String(t.phone10).slice(-4)}` : null,
    display_name: t.display_name || null, mrn: t.mrn || null, assigned_to: t.assigned_to || null, tags: t.tags || [],
    campaign_id: t.campaign_id || null, offer_id: t.offer_id || null, unread_count: t.unread_count || 0,
    last_inbound_at: t.last_inbound_at, last_message_at: t.last_message_at, created_at: t.created_at, resolved_at: t.resolved_at || null,
    window: windowState(t.last_inbound_at)
  };
}
export { last10 };
