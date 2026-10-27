"use client";
import Link from "next/link";
import { fmtInt } from "@/lib/marketingUi/helpers";

export const Spinner = ({ label = "Loading" }) => <span><span className="mk-spin" />{label}...</span>;
export const Chip = ({ tone = "", children }) => <span className={`mk-chip ${tone}`}>{children}</span>;
export const Note = ({ tone = "", children }) => <div className={`mk-note ${tone}`}>{children}</div>;
export const Card = ({ title, actions, children }) => (
  <section className="mk-card">
    {(title || actions) && <div className="mk-row" style={{ justifyContent: "space-between", marginBottom: 8 }}>{title && <h2 style={{ margin: 0 }}>{title}</h2>}{actions}</div>}
    {children}
  </section>
);
export const Stat = ({ label, value, hint }) => <div className="mk-stat"><b>{value}</b><span>{label}</span>{hint && <div><small style={{ color: "var(--text-3)" }}>{hint}</small></div>}</div>;
export const Field = ({ label, hint, children }) => <div className="mk-field"><label>{label}</label>{children}{hint && <small>{hint}</small>}</div>;

/** Loading / error / 403 / empty wrapper for a useApi() result. */
export function State({ q, empty, isEmpty, children }) {
  if (q.loading && !q.data) return <div className="mk-empty"><Spinner /></div>;
  if (q.error) {
    const e = q.error;
    return (
      <Note tone="bad">
        {e.status === 403 ? "Access denied: your account does not have permission for this section. Ask a director to grant it." : e.status === 401 ? "Your session has ended. Please sign in again." : e.message}{" "}
        <button className="mk-btn small" onClick={q.reload}>Retry</button>
      </Note>
    );
  }
  if (isEmpty && isEmpty(q.data)) return <div className="mk-empty">{empty || "Nothing here yet."}</div>;
  return children(q.data);
}

export function Bars({ rows, tone = "", fmt = fmtInt }) {
  if (!rows?.length) return <div className="mk-empty">No data.</div>;
  return <div>{rows.map((r) => (
    <div className="mk-bar" key={r.label}><span className="lbl" title={r.label}>{r.label}</span>
      <span className="track"><span className={`fill ${tone}`} style={{ width: `${Math.max(2, r.pct ?? 0)}%` }} /></span>
      <span className="val">{fmt(r.count)}{r.pctText ? ` (${r.pctText})` : ""}</span></div>
  ))}</div>;
}

export const statusTone = (s) => ({ draft: "", prepared: "navy", scheduled: "navy", running: "ok", paused: "warn", stopped: "bad", completed: "ok", approved: "ok" }[s] || "");

export const TabLink = Link;
