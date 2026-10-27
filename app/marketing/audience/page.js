"use client";
import { useState } from "react";
import { api, useApi } from "@/components/marketing/api";
import { Card, Chip, Field, Note, Spinner, State } from "@/components/marketing/ui";
import AudienceResult from "@/components/marketing/AudienceResult";
import { EMPTY_FILTER_FORM, FOCUS_AREA_OPTIONS, OFFER_TIER_OPTIONS, buildFilter, describeFilter, filterToForm } from "@/lib/marketingUi/helpers";

export default function AudiencePage() {
  const [form, setForm] = useState(EMPTY_FILTER_FORM);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [summary, setSummary] = useState(null);
  const segs = useApi("/segments");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));

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
          <p className="mk-sub">Every field is optional; an empty field means no restriction. Fields combine with AND; several values in one list combine with OR.</p>
          <div className="mk-grid2">
            <Field label="Who"><select value={form.segment} onChange={set("segment")}><option value="">Everyone in the archive</option><option value="package">Package buyers</option></select></Field>
            <Field label="Package kind"><select value={form.genpackage} onChange={set("genpackage")}><option value="">Any</option><option value="true">General health-check only</option><option value="false">Condition-specific only</option></select></Field>
          </div>
          <Field label="Package name contains (comma or one per line)"><textarea value={form.package_names} onChange={set("package_names")} placeholder="Executive Health Checkup" /></Field>
          <div className="mk-grid2">
            <Field label="Package ids (exact)"><input type="text" value={form.package_ids} onChange={set("package_ids")} placeholder="comma separated" /></Field>
            <Field label="Never bought package ids"><input type="text" value={form.exclude_package_ids} onChange={set("exclude_package_ids")} placeholder="comma separated" /></Field>
            <Field label="Package last bought before"><input type="date" value={form.package_last_before} onChange={set("package_last_before")} /></Field>
            <Field label="Package last bought on/after"><input type="date" value={form.package_last_after} onChange={set("package_last_after")} /></Field>
            <Field label="Last visit before"><input type="date" value={form.last_visit_before} onChange={set("last_visit_before")} /></Field>
            <Field label="Last visit on/after"><input type="date" value={form.last_visit_after} onChange={set("last_visit_after")} /></Field>
            <Field label="Last visit at least N months ago"><input type="number" min="0" max="600" value={form.months_since_last_visit_min} onChange={set("months_since_last_visit_min")} /></Field>
            <Field label="Last visit at most M months ago"><input type="number" min="0" max="600" value={form.months_since_last_visit_max} onChange={set("months_since_last_visit_max")} /></Field>
            <Field label="Visit count: at least"><input type="number" min="1" max="500" value={form.min_visits} onChange={set("min_visits")} /></Field>
            <Field label="Visit count: at most"><input type="number" min="1" max="500" value={form.max_visits} onChange={set("max_visits")} /></Field>
            <Field label="Sex"><select value={form.sex} onChange={set("sex")}><option value="">Any</option><option value="F">Women</option><option value="M">Men</option></select></Field>
            <Field label="Pincode starts with"><input type="text" value={form.pincode_prefixes} onChange={set("pincode_prefixes")} placeholder="500, 5000" /></Field>
            <Field label="Age: at least"><input type="number" min="0" max="120" value={form.age_min} onChange={set("age_min")} /></Field>
            <Field label="Age: at most"><input type="number" min="0" max="120" value={form.age_max} onChange={set("age_max")} /></Field>
            <Field label="Only referral sources (id or name)"><input type="text" value={form.include_sources} onChange={set("include_sources")} placeholder="comma separated" /></Field>
            <Field label="Exclude referral sources (id or name)"><input type="text" value={form.exclude_sources} onChange={set("exclude_sources")} placeholder="comma separated" /></Field>
            <Field label="Referral source counts"><select value={form.source_scope} onChange={set("source_scope")}><option value="">Any visit ever</option><option value="last">Last visit only</option></select></Field>
          </div>
          <Field label="Focus areas (any of)" hint="Derived from the latest results; needs pathologist sign-off before patient-facing use. Heavy: narrow the audience first.">
            <div className="mk-row">{FOCUS_AREA_OPTIONS.map(([k, l]) => <label key={k} className="mk-check"><input type="checkbox" checked={form.focus_areas_any.includes(k)} onChange={() => toggle("focus_areas_any", k)} /> {l}</label>)}</div></Field>
          <Field label="Offer tier (any of)"><div className="mk-row">{OFFER_TIER_OPTIONS.map(([k, l]) => <label key={k} className="mk-check"><input type="checkbox" checked={form.offer_tier_in.includes(k)} onChange={() => toggle("offer_tier_in", k)} /> {l}</label>)}</div></Field>
          <div className="mk-grid2">
            <Field label="Cap the audience at" hint="Empty = everyone who matches."><input type="number" min="1" max="200000" value={form.max_audience} onChange={set("max_audience")} /></Field>
            <Field label="Random sample seed" hint="With a cap: a repeatable random sample. Without a seed the newest visitors are kept."><input type="text" value={form.sample_seed} onChange={set("sample_seed")} /></Field>
          </div>
          <details><summary>Advanced filter fields (JSON)</summary>
            <Field label="Extra keys merged into the filter" hint='Only labit-core filter names are accepted, for example {"activity_since": "2026-09-19", "cooldown_days": 45}'><textarea value={form.advanced} onChange={set("advanced")} /></Field></details>
          <p className="mk-sub">Always excluded by the engine: opted-out numbers, recently messaged (cooldown), confidential sources, invalid mobiles.</p>
          <div className="mk-row"><button className="mk-btn primary" onClick={preview} disabled={busy}>{busy ? <Spinner label="Working" /> : "Preview audience"}</button></div>
          <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "14px 0" }} />
          <div className="mk-row"><input type="text" style={{ flex: 1, minWidth: 180 }} placeholder="Segment name" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="mk-btn" onClick={save} disabled={busy}>{editing ? "Update segment" : "Save as segment"}</button>
            {editing && <button className="mk-btn" onClick={() => { setEditing(null); setName(""); setForm(EMPTY_FILTER_FORM); }}>Cancel edit</button>}</div>
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
        </Card>
        <Card title="Audience preview">
          {summary ? <><AudienceResult summary={summary} /><p className="mk-sub">The pilot size is chosen when you create a campaign from a saved segment; a pilot always goes first.</p></> : <div className="mk-empty">Choose filters and press Preview audience. No messages are sent by previewing.</div>}
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
