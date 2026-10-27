"use client";
import { useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/components/marketing/api";
import { Bars, Card, Chip, Note, Stat, State } from "@/components/marketing/ui";
import { fmtDateTime, fmtInt, withBarPct } from "@/lib/marketingUi/helpers";

const label = (s) => String(s || "").replace(/_/g, " ");
const pairs = (o) => withBarPct(Object.entries(o || {}).map(([label, count]) => ({ label: label.replace(/_/g, " "), count })), 12);

function Timeline({ data }) {
  const events = data.events || [];
  return (
    <>
      {(data.campaigns || []).length > 0 && <><h3>Campaign messages</h3>
        <div className="mk-scroll"><table className="mk-table"><tbody>{data.campaigns.map((c, i) => <tr key={i}><td><Link href={`/marketing/campaigns/${c.campaign_id}`}>{String(c.campaign_id).slice(0, 8)}</Link></td><td><Chip tone={c.delivery_status === "read" ? "ok" : ""}>{c.delivery_status || c.status}</Chip></td><td>{fmtDateTime(c.sent_at)}</td></tr>)}</tbody></table></div></>}
      <h3>Interactions</h3>
      {events.length === 0 ? <div className="mk-empty">No interactions recorded.</div> : (
        <div className="mk-timeline">{events.map((e) => <div className="ev" key={e.id ?? e.created_at + e.event_type}><b>{label(e.event_type)}</b>{e.intent ? <> &middot; {label(e.intent)}</> : null} <small style={{ color: "var(--text-3)" }}>{fmtDateTime(e.created_at)}</small>
          {e.ref_id && <div><small>ref {e.ref_id}</small></div>}</div>)}</div>
      )}
    </>
  );
}

export default function TrackerPage() {
  const [days, setDays] = useState("7");
  const sum = useApi(`/tracker/summary?days=${days}`);
  const pts = useApi("/tracker/patients?days=14&limit=50");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(null);
  const [tl, setTl] = useState({ loading: false, data: null, error: null });

  async function open(param) {
    setSel(param); setTl({ loading: true, data: null, error: null });
    try { setTl({ loading: false, data: await api(`/tracker/patient?${param}`), error: null }); } catch (error) { setTl({ loading: false, data: null, error }); }
  }
  function search() {
    const v = query.trim(); if (!v) return;
    open(/^\d{10}$/.test(v.replace(/\D/g, "")) && !/[a-z]/i.test(v) ? `phone=${v.replace(/\D/g, "")}` : `mrn=${encodeURIComponent(v)}`);
  }

  return (
    <>
      <Card title="Interactions" actions={<select style={{ width: 120 }} value={days} onChange={(e) => setDays(e.target.value)}>{["1", "7", "14", "30", "90"].map((d) => <option key={d} value={d}>{d} day{d === "1" ? "" : "s"}</option>)}</select>}>
        <State q={sum} isEmpty={(d) => !d?.by_type}>
          {(d) => (
            <>
              <div className="mk-stats">
                <Stat label="Patients" value={fmtInt(d.distinct_patients)} />
                <Stat label="Inbound messages" value={fmtInt(d.by_type?.inbound_message)} />
                <Stat label="Bookings" value={fmtInt(d.by_type?.booking_created)} />
                <Stat label="Handoffs" value={fmtInt(d.by_type?.handoff_created)} />
                <Stat label="Open threads" value={fmtInt((d.open_threads?.open || 0) + (d.open_threads?.assigned || 0))} />
              </div>
              {d.truncated && <Note tone="warn">Only the latest 20,000 events are counted for this window.</Note>}
              {Object.keys(d.by_type || {}).length === 0 && <Note>No events yet. The tracker records nothing until it is switched on in Bot settings.</Note>}
              <div className="mk-grid2"><div><h3>By event</h3><Bars rows={pairs(d.by_type)} /></div><div><h3>By intent</h3><Bars rows={pairs(d.by_intent)} tone="aqua" /></div>
                <div><h3>Handoff reasons</h3><Bars rows={pairs(d.handoff_reasons)} /></div>
                <div><h3>By campaign</h3>{Object.keys(d.by_campaign || {}).length === 0 ? <div className="mk-empty">No campaign replies.</div> :
                  <div className="mk-scroll"><table className="mk-table"><thead><tr><th>Campaign</th><th>Replies</th><th>Taps</th><th>Bookings</th><th>Handoffs</th></tr></thead><tbody>{Object.entries(d.by_campaign).map(([cid, c]) => <tr key={cid}><td><Link href={`/marketing/campaigns/${cid}`}>{cid.slice(0, 8)}</Link></td><td>{c.inbound}</td><td>{c.button_taps}</td><td>{c.bookings}</td><td>{c.handoffs}</td></tr>)}</tbody></table></div>}</div></div>
            </>
          )}
        </State>
      </Card>
      <div className="mk-grid2">
        <Card title="Recent patients (last 14 days)">
          <div className="mk-row" style={{ marginBottom: 8 }}><input type="search" placeholder="10-digit mobile or MRN" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} /><button className="mk-btn" onClick={search}>Find</button></div>
          <State q={pts} isEmpty={(d) => !(d.patients || []).length} empty="No patient interactions yet.">
            {(d) => <div className="mk-scroll"><table className="mk-table"><thead><tr><th>Patient</th><th>Last event</th><th>#</th></tr></thead><tbody>{d.patients.map((p) => (
              <tr key={p.phone_hash} style={{ cursor: "pointer" }} onClick={() => open(`phone_hash=${p.phone_hash}`)}><td>{p.mrn || `hash ${String(p.phone_hash).slice(0, 6)}`}</td><td>{label(p.last_event_type)}<br /><small>{fmtDateTime(p.last_event_at)}</small></td><td>{p.events}</td></tr>))}</tbody></table></div>}
          </State>
        </Card>
        <Card title="Patient timeline">
          {!sel ? <div className="mk-empty">Choose a patient or search to see their timeline.</div> : <State q={{ ...tl, reload: () => open(sel) }}>{(d) => <Timeline data={d} />}</State>}
        </Card>
      </div>
    </>
  );
}
