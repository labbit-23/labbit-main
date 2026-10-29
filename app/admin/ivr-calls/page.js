"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Phone, RefreshCw, Search } from "lucide-react";
import ShortcutBar from "@/components/ShortcutBar";
import "./ivr-calls.css";

const STATUS_LABELS = { new: "New", reviewed: "Reviewed", follow_up: "Follow-up required", closed: "Closed" };

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function duration(payload) {
  const seconds = Number(payload?.CallDuration);
  return Number.isFinite(seconds) && seconds >= 0 ? `${seconds}s` : "—";
}

function displayStatus(row) {
  return row?.review?.status || "new";
}

function deliveryLabel(row) {
  const status = row?.delivery?.status;
  if (status) return status.charAt(0).toUpperCase() + status.slice(1);
  return row?.whatsapp_status || "—";
}

export default function IvrCallsPage() {
  const [calls, setCalls] = useState([]);
  const [callers, setCallers] = useState([]);
  const [view, setView] = useState("calls");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [days, setDays] = useState("30");
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({ status: "new", follow_up_owner: "", notes: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ search, status, days });
      const res = await fetch(`/api/admin/ivr-calls?${params}`, { cache: "no-store", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load calls");
      setCalls(body.calls || []);
      setCallers(body.callers || []);
    } catch (err) {
      setError(err?.message || "Failed to load calls");
    } finally {
      setLoading(false);
    }
  }, [days, search, status]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  function openCall(row) {
    setSelected(row);
    setDraft({
      status: displayStatus(row),
      follow_up_owner: row?.review?.follow_up_owner || "",
      notes: row?.review?.notes || "",
    });
  }

  async function saveReview() {
    if (!selected?.call_id) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/ivr-calls", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ call_id: selected.call_id, ...draft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to save review");
      setSelected((current) => ({ ...current, review: body.review }));
      await load();
    } catch (err) {
      setError(err?.message || "Failed to save review");
    } finally {
      setSaving(false);
    }
  }

  const stats = useMemo(() => ({
    total: calls.length,
    new: calls.filter((row) => displayStatus(row) === "new").length,
    follow: calls.filter((row) => displayStatus(row) === "follow_up").length,
    callers: callers.length,
  }), [calls, callers]);

  return (
    <>
    <ShortcutBar />
    <main className="ivr-page">
      <header className="ivr-header">
        <div>
          <p className="ivr-kicker">Operations</p>
          <h1>IVR Calls</h1>
          <p>Review every inbound Bonvoice event and follow up from one queue.</p>
        </div>
        <button className="ivr-button secondary" onClick={load} disabled={loading}><RefreshCw size={16} /> Refresh</button>
      </header>

      <section className="ivr-stats">
        <div><span>Total events</span><strong>{stats.total}</strong></div>
        <div><span>New</span><strong>{stats.new}</strong></div>
        <div><span>Follow-up</span><strong>{stats.follow}</strong></div>
        <div><span>Unique callers</span><strong>{stats.callers}</strong></div>
      </section>

      <section className="ivr-toolbar">
        <div className="ivr-tabs">
          <button className={view === "calls" ? "active" : ""} onClick={() => setView("calls")}>Call events</button>
          <button className={view === "callers" ? "active" : ""} onClick={() => setView("callers")}>Caller summary</button>
        </div>
        <label className="ivr-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Phone, call ID, DTMF or action" /></label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Review status">
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <select value={days} onChange={(e) => setDays(e.target.value)} aria-label="Date range">
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="180">Last 180 days</option>
        </select>
      </section>

      {error ? <div className="ivr-error">{error}</div> : null}
      <section className="ivr-card">
        {loading ? <div className="ivr-empty">Loading IVR calls…</div> : view === "calls" ? (
          <div className="ivr-table-wrap"><table><thead><tr><th>Caller</th><th>Received</th><th>Call</th><th>DTMF</th><th>Action</th><th>WhatsApp</th><th>Review</th></tr></thead>
            <tbody>{calls.map((row) => <tr key={row.id} onClick={() => openCall(row)}>
              <td><strong>{row.identity?.display_name || "Unknown caller"}</strong><span className="ivr-caller-meta">{row.normalized_phone || row.source_number || "Unknown"}{row.identity?.mrn ? ` · ${row.identity.mrn}` : ""}</span></td>
              <td>{dateTime(row.created_at)}</td>
              <td><span className="ivr-muted">{row.bonvoice_payload?.Status || "—"} · {duration(row.bonvoice_payload)}</span></td>
              <td><code>{row.dtmf || "No input"}</code></td>
              <td>{String(row.action_taken || "logged_only").replaceAll("_", " ")}</td>
              <td><span className={`ivr-delivery ${row.delivery?.status || "none"}`}>{deliveryLabel(row)}</span></td>
              <td><span className={`ivr-badge ${displayStatus(row)}`}>{STATUS_LABELS[displayStatus(row)]}</span></td>
            </tr>)}</tbody></table>{!calls.length ? <div className="ivr-empty">No calls match these filters.</div> : null}</div>
        ) : (
          <div className="ivr-table-wrap"><table><thead><tr><th>Caller</th><th>Identity source</th><th>Events</th><th>Last call</th><th>Latest DTMF</th><th>Latest action</th><th>Open reviews</th></tr></thead>
            <tbody>{callers.map((row) => <tr key={row.phone} onClick={() => { setSearch(row.phone); setView("calls"); }}>
              <td><strong>{row.identity?.display_name || "Unknown caller"}</strong><span className="ivr-caller-meta">{row.phone}{row.identity?.mrn ? ` · ${row.identity.mrn}` : ""}</span></td><td><span className={`ivr-source ${row.identity?.name_source || "unknown"}`}>{row.identity?.name_source === "patient" ? "Patient record" : row.identity?.name_source === "whatsapp" ? "WhatsApp profile" : "Unmatched"}</span></td><td>{row.call_count}</td><td>{dateTime(row.last_call_at)}</td><td><code>{row.latest_dtmf || "No input"}</code></td><td>{String(row.latest_action || "—").replaceAll("_", " ")}</td><td>{row.open_reviews}</td>
            </tr>)}</tbody></table>{!callers.length ? <div className="ivr-empty">No callers match these filters.</div> : null}</div>
        )}
      </section>

      {selected ? <div className="ivr-overlay" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}>
        <aside className="ivr-drawer">
          <div className="ivr-drawer-head"><div><p className="ivr-kicker">Call detail</p><h2>{selected.identity?.display_name || selected.normalized_phone || selected.source_number}</h2><p>{selected.identity?.display_name ? `${selected.normalized_phone || selected.source_number} · ` : ""}{dateTime(selected.created_at)}</p></div><button onClick={() => setSelected(null)} aria-label="Close">×</button></div>
          <div className="ivr-actions">
            <a href={`/admin/whatsapp/${encodeURIComponent(selected.normalized_phone || selected.source_number)}`}><Phone size={15} /> WhatsApp conversation</a>
            {selected.bonvoice_payload?.ResourceURL ? <a href={selected.bonvoice_payload.ResourceURL} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Recording</a> : null}
          </div>
          <dl className="ivr-details">
            <div><dt>Call ID</dt><dd>{selected.call_id || "—"}</dd></div><div><dt>Bonvoice status</dt><dd>{selected.bonvoice_payload?.Status || "—"}</dd></div>
            <div><dt>DTMF</dt><dd>{selected.dtmf || "No input"}</dd></div><div><dt>Duration</dt><dd>{duration(selected.bonvoice_payload)}</dd></div>
            <div><dt>Action</dt><dd>{selected.action_taken || "logged_only"}</dd></div><div><dt>WhatsApp outcome</dt><dd>{deliveryLabel(selected)}{selected.delivery?.at ? ` · ${dateTime(selected.delivery.at)}` : ""}</dd></div>
            {selected.delivery?.provider_message_id ? <div><dt>Provider message ID</dt><dd>{selected.delivery.provider_message_id}</dd></div> : null}
          </dl>
          {!selected.call_id ? <div className="ivr-error">This legacy event has no call ID and cannot carry review state.</div> : <div className="ivr-form">
            <label>Review status<select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>Follow-up owner<input value={draft.follow_up_owner} onChange={(e) => setDraft((d) => ({ ...d, follow_up_owner: e.target.value }))} placeholder="Name or team" maxLength={160} /></label>
            <label>Review notes<textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Outcome, next action, or context" rows={5} maxLength={4000} /></label>
            <button className="ivr-button" onClick={saveReview} disabled={saving}>{saving ? "Saving…" : "Save review"}</button>
          </div>}
        </aside>
      </div> : null}
    </main>
    </>
  );
}

