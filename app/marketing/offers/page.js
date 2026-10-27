"use client";
import { useState } from "react";
import { api, useApi } from "@/components/marketing/api";
import { Card, Chip, Field, Note, State } from "@/components/marketing/ui";
import { EMPTY_OFFER, offerFormToBody, offerSummary, offerToForm, offerWarnings, todayIst } from "@/lib/marketingUi/helpers";

export default function OffersPage() {
  const q = useApi("/offers");
  const [form, setForm] = useState(EMPTY_OFFER);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const today = todayIst();
  const liveWarnings = offerWarnings(offerFormToBody(form), today);
  const setTier = (i, k, v) => setForm((f) => ({ ...f, tiers: f.tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await api(editing ? `/offers/${editing}` : "/offers", { method: editing ? "PUT" : "POST", body: offerFormToBody(form) });
      setMsg({ tone: "ok", text: editing ? "Offer updated." : "Offer created." });
      setForm(EMPTY_OFFER); setEditing(null); q.reload();
    } catch (e) { setMsg({ tone: "bad", text: e.message }); }
    setBusy(false);
  }
  async function archive(o) {
    if (!window.confirm(`Archive offer "${o.name}"?`)) return;
    try { await api(`/offers/${o.id}`, { method: "DELETE" }); q.reload(); } catch (e) { setMsg({ tone: "bad", text: e.message }); }
  }

  return (
    <div className="mk-split">
      <Card title="Offers">
        <State q={q} isEmpty={(d) => !(d.offers || []).filter((o) => !o.archived_at).length} empty="No offers yet. Create one on the right.">
          {(d) => (d.offers || []).filter((o) => !o.archived_at).map((o) => {
            const w = offerWarnings(o, today);
            return (
              <div className="mk-step" key={o.id}>
                <div className="mk-row" style={{ justifyContent: "space-between" }}><b>{o.name}</b>{o.code && <Chip tone="navy">{o.code}</Chip>}</div>
                <div>{offerSummary(o)}</div>
                <div className="mk-sub" style={{ margin: "2px 0" }}>{o.valid_from || "?"} to {o.valid_to || "open"}{Object.keys(o.tier_map || {}).length ? ` · tiers: ${Object.keys(o.tier_map).join(", ")}` : ""}</div>
                {w.map((x) => <Note key={x} tone="warn">{x}</Note>)}
                <div className="mk-row"><button className="mk-btn small" onClick={() => { setEditing(o.id); setForm(offerToForm(o)); window.scrollTo?.({ top: 0, behavior: "smooth" }); }}>Edit</button><button className="mk-btn small" onClick={() => archive(o)}>Archive</button></div>
              </div>
            );
          })}
        </State>
      </Card>
      <Card title={editing ? "Edit offer" : "New offer"}>
        <Field label="Name"><input type="text" value={form.name} onChange={set("name")} placeholder="Diwali 2026" /></Field>
        <div className="mk-grid2">
          <Field label="Discount type"><select value={form.discount_type} onChange={set("discount_type")}><option value="pct">Percent</option><option value="flat">Flat amount (INR)</option></select></Field>
          <Field label="Value"><input type="number" min="0" value={form.value} onChange={set("value")} /></Field>
          <Field label="Valid from"><input type="date" value={form.valid_from} onChange={set("valid_from")} /></Field>
          <Field label="Valid to"><input type="date" value={form.valid_to} onChange={set("valid_to")} /></Field>
        </div>
        <Field label="Applies to packages (comma separated)"><textarea value={form.packages} onChange={set("packages")} /></Field>
        <Field label="Code"><input type="text" value={form.code} onChange={set("code")} placeholder="DIWALI20" /></Field>
        <Field label="Terms"><textarea value={form.terms} onChange={set("terms")} /></Field>
        <h3>Tier mapping</h3>
        <p className="mk-sub" style={{ margin: "0 0 6px" }}>A recipient&apos;s offer tier picks its own value or text; others get the base offer.</p>
        {form.tiers.map((t, i) => (
          <div className="mk-row" key={i} style={{ marginBottom: 6 }}>
            <input type="text" style={{ width: 100 }} placeholder="tier" value={t.tier} onChange={(e) => setTier(i, "tier", e.target.value)} />
            <input type="number" style={{ width: 90 }} placeholder="value" value={t.value} onChange={(e) => setTier(i, "value", e.target.value)} />
            <input type="text" style={{ flex: 1, minWidth: 140 }} placeholder="or literal text" value={t.text} onChange={(e) => setTier(i, "text", e.target.value)} />
            <button className="mk-btn small" onClick={() => setForm((f) => ({ ...f, tiers: f.tiers.filter((_, j) => j !== i) }))}>Remove</button>
          </div>
        ))}
        <button className="mk-btn small" onClick={() => setForm((f) => ({ ...f, tiers: [...f.tiers, { tier: "", value: "", text: "" }] }))}>Add tier</button>
        {form.name && liveWarnings.map((x) => <Note key={x} tone="warn">{x}</Note>)}
        {msg && <Note tone={msg.tone}>{msg.text}</Note>}
        <div className="mk-row" style={{ marginTop: 10 }}>
          <button className="mk-btn primary" onClick={save} disabled={busy || !form.name.trim()}>{editing ? "Save changes" : "Create offer"}</button>
          {editing && <button className="mk-btn" onClick={() => { setEditing(null); setForm(EMPTY_OFFER); }}>Cancel</button>}
        </div>
      </Card>
    </div>
  );
}
