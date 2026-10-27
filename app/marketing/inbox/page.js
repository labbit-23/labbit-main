"use client";
import { useEffect, useState } from "react";
import { api, useApi } from "@/components/marketing/api";
import { Card, Chip, Field, Note, Spinner, State } from "@/components/marketing/ui";
import { fmtDateTime, fmtRemaining } from "@/lib/marketingUi/helpers";

const WindowChip = ({ w }) => w?.open ? <Chip tone="ok">24h window open &middot; {fmtRemaining(w.remaining_ms)}</Chip> : <Chip tone="bad">24h window closed</Chip>;
const label = (s) => String(s || "").replace(/_/g, " ");

function Thread({ id, onChanged }) {
  const q = useApi(`/inbox/${id}`);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [tplName, setTplName] = useState("");
  const [tplVals, setTplVals] = useState({});
  const [allowed, setAllowed] = useState(null);
  useEffect(() => { setAllowed(null); setMsg(null); setText(""); }, [id]);

  async function call(path, body, okText) {
    setBusy(true); setMsg(null);
    try { const r = await api(`/inbox/${id}${path}`, { method: "POST", body }); if (okText) setMsg({ tone: "ok", text: okText }); q.reload(); onChanged(); return r; }
    catch (e) {
      if (e.status === 409 && e.payload?.error === "window_closed") { setAllowed(e.payload.allowed_templates || []); setMsg({ tone: "warn", text: (e.payload.allowed_templates || []).length ? "The 24h window is closed. Pick an approved template to reopen it." : "The 24h window is closed and no reopen template is configured (Bot settings)." }); }
      else setMsg({ tone: "bad", text: e.message });
    } finally { setBusy(false); }
  }
  const sendText = async () => { const r = await call("/reply", { text }); if (r) setText(""); };
  const tpl = (allowed || []).find((t) => t.name === tplName);
  const sendTpl = () => call("/reply", { template: { name: tplName, params: (tpl?.params || []).map((p) => tplVals[p] || "") } }, "Template sent.");

  return (
    <State q={q} isEmpty={(d) => !d?.thread}>
      {(d) => {
        const t = d.thread;
        return (
          <>
            <div className="mk-row" style={{ justifyContent: "space-between" }}>
              <div><b>{t.display_name || "Unknown"}</b> <small>{t.phone_masked}{t.mrn ? ` · ${t.mrn}` : ""}</small>
                <div className="mk-row" style={{ marginTop: 4 }}><Chip tone={t.status === "resolved" ? "ok" : t.status === "assigned" ? "navy" : "warn"}>{t.status}</Chip>{t.reason && <Chip>{label(t.reason)}</Chip>}<WindowChip w={t.window} />{t.campaign_id && <Chip>from campaign</Chip>}</div></div>
              <div className="mk-row">
                <button className="mk-btn small" disabled={busy} onClick={() => call("/assign", { assignee: t.assigned_to ? null : "me" })}>{t.assigned_to ? "Unassign" : "Assign to me"}</button>
                {t.status === "resolved" ? <button className="mk-btn small" disabled={busy} onClick={() => call("/resolve", { reopen: true })}>Reopen</button> : <button className="mk-btn small primary" disabled={busy} onClick={() => call("/resolve", {})}>Resolve</button>}
              </div>
            </div>
            <div className="mk-row" style={{ margin: "8px 0" }}>{(t.tags || []).map((x) => <Chip key={x}>{x} <a role="button" style={{ cursor: "pointer" }} onClick={() => call("/tags", { remove: [x] })}>&times;</a></Chip>)}
              <input type="text" style={{ width: 130 }} placeholder="add tag" value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && tag.trim()) { call("/tags", { add: [tag.trim()] }); setTag(""); } }} /></div>
            <div className="mk-chat">{(d.messages || []).length === 0 ? <div className="mk-empty">No messages captured.</div> : d.messages.map((m) => <div key={m.id} className={`mk-msg ${m.direction === "out" ? "out" : ""}`}>{m.body}<div><small style={{ color: "var(--text-3)" }}>{m.sender} &middot; {fmtDateTime(m.created_at)}</small></div></div>)}</div>
            <div style={{ marginTop: 8 }}>
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t.window?.open ? "Reply to the patient" : "Window closed: free-text replies are refused by WhatsApp"} maxLength={1000} />
              <div className="mk-row" style={{ marginTop: 6 }}><button className="mk-btn primary" disabled={busy || !text.trim()} onClick={sendText}>{busy ? <Spinner label="Sending" /> : "Send reply"}</button><small>{text.length}/1000</small></div>
              {allowed && allowed.length > 0 && <div className="mk-step" style={{ marginTop: 8 }}>
                <Field label="Reopen with approved template"><select value={tplName} onChange={(e) => { setTplName(e.target.value); setTplVals({}); }}><option value="">Choose</option>{allowed.map((a) => <option key={a.name} value={a.name}>{a.label || a.name}</option>)}</select></Field>
                {(tpl?.params || []).map((p) => <Field key={p} label={p}><input type="text" value={tplVals[p] || ""} onChange={(e) => setTplVals((v) => ({ ...v, [p]: e.target.value }))} /></Field>)}
                <button className="mk-btn" disabled={!tplName || busy} onClick={sendTpl}>Send template</button></div>}
              {msg && <Note tone={msg.tone}>{msg.text}</Note>}
            </div>
            <h3>Internal notes (never sent)</h3>
            {(d.notes || []).map((n) => <div key={n.id} className="mk-note"><small>{n.author_name || "staff"} &middot; {fmtDateTime(n.created_at)}</small><div>{n.body}</div></div>)}
            <div className="mk-row"><input type="text" placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} /><button className="mk-btn small" disabled={!note.trim() || busy} onClick={async () => { await call("/notes", { body: note }); setNote(""); }}>Add</button></div>
            <h3>Patient timeline</h3>
            <div className="mk-timeline">{(d.timeline?.events || []).slice(0, 15).map((e) => <div className="ev" key={e.id}><b>{label(e.event_type)}</b> <small>{fmtDateTime(e.created_at)}</small></div>)}</div>
          </>
        );
      }}
    </State>
  );
}

export default function InboxPage() {
  const [status, setStatus] = useState("");
  const [assigned, setAssigned] = useState("");
  const [qtext, setQtext] = useState("");
  const [sel, setSel] = useState(null);
  const path = `/inbox?limit=50${status ? `&status=${status}` : ""}${assigned ? `&assigned=${assigned}` : ""}${qtext.trim() ? `&q=${encodeURIComponent(qtext.trim())}` : ""}`;
  const list = useApi(path);
  return (
    <div className="mk-split" style={{ gridTemplateColumns: "minmax(260px, 2fr) minmax(0, 3fr)" }}>
      <Card title="Staff inbox" actions={<button className="mk-btn small" onClick={list.reload}>Refresh</button>}>
        <div className="mk-row" style={{ marginBottom: 8 }}>
          <select style={{ width: 120 }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Unresolved</option><option value="open">Open</option><option value="assigned">Assigned</option><option value="resolved">Resolved</option></select>
          <select style={{ width: 120 }} value={assigned} onChange={(e) => setAssigned(e.target.value)}><option value="">Anyone</option><option value="me">Mine</option><option value="none">Unassigned</option></select>
          <input type="search" style={{ flex: 1, minWidth: 120 }} placeholder="Mobile or MRN" value={qtext} onChange={(e) => setQtext(e.target.value)} />
        </div>
        <State q={list} isEmpty={(d) => !(d.threads || []).length} empty="No conversations here. Handed-off chats appear once the inbox is switched on in Bot settings.">
          {(d) => d.threads.map((t) => (
            <div key={t.id} className="mk-step" style={{ cursor: "pointer", borderColor: sel === t.id ? "#141e28" : undefined }} onClick={() => setSel(t.id)}>
              <div className="mk-row" style={{ justifyContent: "space-between" }}><b>{t.display_name || t.phone_masked}</b>{t.unread_count > 0 && <Chip tone="bad">{t.unread_count} new</Chip>}</div>
              <div className="mk-row"><Chip tone={t.status === "assigned" ? "navy" : t.status === "resolved" ? "ok" : "warn"}>{t.status}</Chip>{t.reason && <Chip>{label(t.reason)}</Chip>}<WindowChip w={t.window} /></div>
              <small style={{ color: "var(--text-3)" }}>{fmtDateTime(t.last_message_at)}</small>
            </div>
          ))}
        </State>
      </Card>
      <Card title="Conversation">{sel ? <Thread id={sel} onChanged={list.reload} /> : <div className="mk-empty">Select a conversation.</div>}</Card>
    </div>
  );
}
