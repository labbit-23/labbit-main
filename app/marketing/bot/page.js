"use client";
import { useEffect, useState } from "react";
import { api, useApi } from "@/components/marketing/api";
import { Card, Chip, Field, Note, Spinner, State } from "@/components/marketing/ui";

function Flags() {
  const q = useApi("/bot/flags");
  const [draft, setDraft] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data?.flags) setDraft(q.data.flags); }, [q.data]);

  const flags = q.data?.flags;
  const changed = flags && draft ? Object.fromEntries(Object.entries(draft).filter(([k, v]) => v !== flags[k])) : {};
  const nChanged = Object.keys(changed).length;

  async function save() {
    if (changed.global_enabled === true && !window.confirm("Turn the bot ON globally? Every automation whose switch is on will start replying to patients.")) return;
    setBusy(true); setMsg(null);
    try { await api("/bot/flags", { method: "PUT", body: { flags: changed } }); setMsg({ tone: "ok", text: "Saved." }); q.reload(); }
    catch (e) { setMsg({ tone: "bad", text: e.message }); }
    setBusy(false);
  }
  async function kill() {
    if (!window.confirm("Switch ALL bot automations off now? Individual switches keep their values.")) return;
    setBusy(true); setMsg(null);
    try { await api("/bot/kill-switch", { method: "POST", body: {} }); setMsg({ tone: "ok", text: "Kill switch applied: the bot is off." }); q.reload(); }
    catch (e) { setMsg({ tone: "bad", text: e.message }); }
    setBusy(false);
  }
  return (
    <State q={q} isEmpty={(d) => !d?.flags}>
      {(d) => draft && (
        <>
          <div className={`mk-kill ${d.flags.global_enabled ? "on" : ""}`}>
            <div className="mk-row" style={{ justifyContent: "space-between" }}>
              <div><b style={{ fontSize: 16 }}>Bot is {d.flags.global_enabled ? "ON" : "OFF"}</b>
                <div className="mk-sub" style={{ margin: 0 }}>{d.flags.global_enabled ? "Automations with a switch below are live." : "Nothing runs: no replies, tracking or inbox capture. The old bot behaves exactly as before."}</div></div>
              {d.flags.global_enabled && <button className="mk-btn danger" disabled={busy} onClick={kill}>KILL SWITCH: turn everything off</button>}
            </div>
          </div>
          <Card title="Automations" actions={<button className="mk-btn primary" disabled={!nChanged || busy} onClick={save}>{busy ? <Spinner label="Saving" /> : `Save ${nChanged || ""} change${nChanged === 1 ? "" : "s"}`}</button>}>
            {Object.keys(draft).map((k) => (
              <label className="mk-switch" key={k}>
                <input type="checkbox" checked={Boolean(draft[k])} onChange={(e) => setDraft((x) => ({ ...x, [k]: e.target.checked }))} />
                <span style={{ flex: 1 }}><b>{d.labels?.[k] || k}</b></span>
                {draft[k] !== d.flags[k] && <Chip tone="warn">unsaved</Chip>}
                {!draft[k] && draft[k] === d.flags[k] && <Chip>off</Chip>}
                {draft[k] && draft[k] === d.flags[k] && <Chip tone="ok">on</Chip>}
              </label>
            ))}
            {msg && <Note tone={msg.tone}>{msg.text}</Note>}
          </Card>
        </>
      )}
    </State>
  );
}

function Params() {
  const q = useApi("/bot/params");
  const [draft, setDraft] = useState(null);
  const [tplJson, setTplJson] = useState("[]");
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (q.data?.params) { setDraft(q.data.params); setTplJson(JSON.stringify(q.data.params.window_reopen_templates || [], null, 1)); } }, [q.data]);
  async function save() {
    let tpls;
    try { tpls = JSON.parse(tplJson); } catch { return setMsg({ tone: "bad", text: "Reopen templates must be valid JSON." }); }
    try { await api("/bot/params", { method: "PUT", body: { params: { ...draft, window_reopen_templates: tpls } } }); setMsg({ tone: "ok", text: "Saved." }); q.reload(); }
    catch (e) { setMsg({ tone: "bad", text: (e.payload?.errors || [e.message]).join("; ") }); }
  }
  return (
    <Card title="Limits and thresholds">
      <State q={q} isEmpty={(d) => !d?.params}>
        {(d) => draft && (<>
          <div className="mk-grid2">{Object.keys(d.defaults).filter((k) => k !== "window_reopen_templates").map((k) => (
            <Field key={k} label={k.replace(/_/g, " ")} hint={`default ${d.defaults[k]}`}><input type="number" step={k === "min_confidence" ? "0.05" : "1"} value={draft[k] ?? ""} onChange={(e) => setDraft((x) => ({ ...x, [k]: e.target.value === "" ? "" : Number(e.target.value) }))} /></Field>))}</div>
          <Field label="Templates staff may use to reopen a closed 24h window (JSON)" hint='Only names already approved in Meta. Shape: [{"name":"staff_followup_reopen","language":"en","label":"Follow up","params":["first_name"]}]'><textarea value={tplJson} onChange={(e) => setTplJson(e.target.value)} style={{ fontFamily: "monospace", minHeight: 100 }} /></Field>
          <button className="mk-btn" onClick={save}>Save limits</button>{msg && <Note tone={msg.tone}>{msg.text}</Note>}
        </>)}
      </State>
    </Card>
  );
}

function Texts() {
  const q = useApi("/bot/texts");
  const [lang, setLang] = useState("en");
  const [draft, setDraft] = useState({});
  const [msg, setMsg] = useState(null);
  useEffect(() => { setDraft({}); }, [q.data, lang]);
  const d = q.data;
  async function save() {
    if (!Object.keys(draft).length) return;
    try { await api("/bot/texts", { method: "PUT", body: { texts: { [lang]: draft } } }); setMsg({ tone: "ok", text: "Saved. Empty fields revert to the default." }); q.reload(); }
    catch (e) { setMsg({ tone: "bad", text: (e.payload?.errors || [e.message]).join("; ") }); }
  }
  return (
    <Card title="Reply texts" actions={<select style={{ width: 90 }} value={lang} onChange={(e) => setLang(e.target.value)}>{(d?.languages || ["en", "te", "hi"]).map((l) => <option key={l}>{l}</option>)}</select>}>
      <State q={q} isEmpty={(x) => !x?.defaults}>
        {(x) => (<>
          {lang !== "en" && <Note>Empty {lang.toUpperCase()} texts fall back to English key by key.</Note>}
          {Object.keys(x.defaults.en).map((k) => {
            const cur = x.overrides?.[lang]?.[k];
            const value = draft[k] !== undefined ? draft[k] : cur ?? "";
            const ph = x.placeholders?.[k] || [];
            return (
              <Field key={k} label={k.replace(/_/g, " ")} hint={ph.length ? `Placeholders: ${ph.map((p) => `{${p}}`).join(" ")}` : undefined}>
                <textarea value={value} placeholder={x.defaults[lang]?.[k] || x.defaults.en[k]} maxLength={900} onChange={(e) => setDraft((s) => ({ ...s, [k]: e.target.value }))} />
              </Field>
            );
          })}
          <button className="mk-btn primary" disabled={!Object.keys(draft).length} onClick={save}>Save texts</button>{msg && <Note tone={msg.tone}>{msg.text}</Note>}
        </>)}
      </State>
    </Card>
  );
}

export default function BotPage() {
  return <><Flags /><Params /><Texts /></>;
}
