"use client";
import { useState } from "react";
import { useApi } from "@/components/marketing/api";
import { Card, State } from "@/components/marketing/ui";
import { fmtDateTime } from "@/lib/marketingUi/helpers";

export default function AuditPage() {
  const [cid, setCid] = useState("");
  const [limit, setLimit] = useState("100");
  const path = `/audit?limit=${encodeURIComponent(limit)}${cid.trim() ? `&campaign_id=${encodeURIComponent(cid.trim())}` : ""}`;
  const q = useApi(path);
  return (
    <Card title="Audit log">
      <div className="mk-row" style={{ marginBottom: 10 }}>
        <input type="search" style={{ maxWidth: 340 }} placeholder="Filter by campaign id" value={cid} onChange={(e) => setCid(e.target.value)} />
        <select style={{ width: 110 }} value={limit} onChange={(e) => setLimit(e.target.value)}>{["50", "100", "200", "500"].map((n) => <option key={n}>{n}</option>)}</select>
        <button className="mk-btn small" onClick={q.reload}>Refresh</button>
      </div>
      <State q={q} isEmpty={(d) => !(d.audit || []).length} empty="No audit entries.">
        {(d) => <div className="mk-scroll"><table className="mk-table"><thead><tr><th>When (IST)</th><th>Who</th><th>Action</th><th>Campaign</th><th>Details</th></tr></thead>
          <tbody>{d.audit.map((r) => <tr key={r.id}><td>{fmtDateTime(r.created_at)}</td><td>{r.actor_name || "-"} <small>{r.actor_role}</small></td><td><code>{r.action}</code></td>
            <td>{r.campaign_id ? <small>{String(r.campaign_id).slice(0, 8)}</small> : "-"}</td><td><small style={{ wordBreak: "break-word" }}>{r.details ? JSON.stringify(r.details) : ""}</small></td></tr>)}</tbody></table></div>}
      </State>
    </Card>
  );
}
