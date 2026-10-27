"use client";
import { useState } from "react";
import { api, useApi } from "@/components/marketing/api";
import { Card, Chip, Field, Note, Spinner, State } from "@/components/marketing/ui";
import AudienceResult from "@/components/marketing/AudienceResult";
import { EMPTY_FILTER_FORM, buildFilter, describeFilter, filterToForm } from "@/lib/marketingUi/helpers";

export default function AudiencePage() {
  const [form, setForm] = useState(EMPTY_FILTER_FORM);
  const [pilot, setPilot] = useState("50");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [summary, setSummary] = useState(null);
  const segs = useApi("/segments");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function preview() {
    const { filter, error } = buildFilter(form);
    if (error) return setMsg({ tone: "bad", text: error });
    setBusy(true); setMsg(null);
    try { const r = await api("/audience/preview", { method: "POST", body: { filter } }); setSummary(r.summary || {}); }
    catch (e) { setSummary(null); setMsg({ tone: "bad", text: e.message }); }
    setBusy(false);
  }
  async function save() {
    const { filter, error } = buildFilter(form);
    if (error) return setMsg({ tone: "bad", text: error });
    if (!name.trim()) return setMsg({ tone: "bad", text: "Give the segment a name first." });
    setBusy(true); setMsg(null);
    try {
      await api(editing ? `/segments/${editing}` : "/segments", { method: editing ? "PUT" : "POST", body: { name: name.trim(), filter } });
      setMsg({ tone: "ok", text: editing ? "Segment updated. Existing campaigns keep their own copy of the filter." : "Segment saved." });
      setEditing(null); setName(""); segs.reload();
    } catch (e) { setMsg({ tone: "bad", text: e.message }); }
    setBusy(false);
  }
  async function archive(s) {
    if (!window.confirm(`Archive segment "${s.name}"? Existing campaigns are not affected.`)) return;
    try { await api(`/segments/${s.id}`, { method: "DELETE" }); segs.reload(); } catch (e) { setMsg({ tone: "bad", text: e.message }); }
  }
  const edit = (s) => { setEditing(s.id); setName(s.name); setForm(filterToForm(s.filter)); setSummary(null); window.scrollTo?.({ top: 0, behavior: "smooth" }); };

  return (
    <div className="mk-split">
      <div>
        <Card title={editing ? "Edit segment" : "Build an audience"}>
          <Field label="Packages (comma or one per line; empty = any)"><textarea value={form.packages} onChange={set("packages")} placeholder="Executive Health Checkup" /></Field>
          <div className="mk-grid2">
            <Field label="Last visit before"><input type="date" value={form.last_visit_before} onChange={set("last_visit_before")} /></Field>
            <Field label="Last visit after"><input type="date" value={form.last_visit_after} onChange={set("last_visit_after")} /></Field>
            <Field label="Visit count: at least"><input type="number" min="1" value={form.min_visits} onChange={set("min_visits")} /></Field>
            <Field label="Visit count: at most"><input type="number" min="1" value={form.max_visits} onChange={set("max_visits")} /></Field>
          </div>
          <Field label="Exclude packages"><input type="text" value={form.exclude_packages} onChange={set("exclude_packages")} placeholder="comma separated" /></Field>
          <Field label="Pilot sample size" hint="Used for the cost line below and as the starting pilot in the campaign wizard (max 500)."><input type="number" min="1" max="500" value={pilot} onChange={(e) => setPilot(e.target.value)} /></Field>
          <details><summary>Advanced filter fields (JSON)</summary>
            <Field label="Extra keys merged into the filter" hint='Example: {"inactive_months": 12, "focus_area": "liver"}'><textarea value={form.advanced} onChange={set("advanced")} /></Field></details>
          <p className="mk-sub">Always excluded by the engine: opted-out numbers, recently messaged (cooldown), confidential sources, invalid mobiles.</p>
          <div className="mk-row"><button className="mk-btn primary" onClick={preview} disabled={busy}>{busy ? <Spinner label="Working" /> : "Preview audience"}</button></div>
          <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "14px 0" }} />
          <div className="mk-row"><input type="text" style={{ flex: 1, minWidth: 180 }} placeholder="Segment name" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="mk-btn" onClick={save} disabled={busy}>{editing ? "Update segment" : "Save as segment"}</button>
            {editing && <button className="mk-btn" onClick={() => { setEditing(null); setName(""); setForm(EMPTY_FILTER_FORM); }}>Cancel edit</button>}</div>
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
        </Card>
        <Card title="Audience preview">
          {summary ? <><AudienceResult summary={summary} /><p className="mk-sub">Pilot of {Math.min(500, Number(pilot) || 50)} would go first, then the rest after you approve.</p></> : <div className="mk-empty">Choose filters and press Preview audience. No messages are sent by previewing.</div>}
        </Card>
      </div>
      <Card title="Saved segments">
        <State q={segs} isEmpty={(d) => !(d.segments || []).length} empty="No saved segments yet.">
          {(d) => (d.segments || []).filter((s) => !s.archived_at).map((s) => (
            <div key={s.id} className="mk-step">
              <div className="mk-row" style={{ justifyContent: "space-between" }}><b>{s.name}</b><Chip>{new Date(s.created_at).toLocaleDateString("en-IN")}</Chip></div>
              <div className="mk-sub" style={{ margin: "4px 0" }}>{describeFilter(s.filter)}</div>
              <div className="mk-row"><button className="mk-btn small" onClick={() => edit(s)}>Edit</button><button className="mk-btn small" onClick={() => archive(s)}>Archive</button></div>
            </div>
          ))}
        </State>
      </Card>
    </div>
  );
}
