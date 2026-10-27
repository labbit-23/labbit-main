"use client";
import Link from "next/link";
import { useApi } from "@/components/marketing/api";
import { Card, Chip, State, statusTone } from "@/components/marketing/ui";
import { fmtDateTime } from "@/lib/marketingUi/helpers";

export default function CampaignsPage() {
  const q = useApi("/campaigns");
  return (
    <Card title="Campaigns" actions={<Link href="/marketing/campaigns/new" className="mk-btn primary small" style={{ textDecoration: "none" }}>New campaign</Link>}>
      <State q={q} isEmpty={(d) => !(d.campaigns || []).length} empty="No campaigns yet. Create the first one.">
        {(d) => <div className="mk-scroll"><table className="mk-table"><thead><tr><th>Name</th><th>Status</th><th>Template</th><th>Created</th><th>Scheduled</th></tr></thead>
          <tbody>{d.campaigns.map((c) => <tr key={c.id}><td><Link href={`/marketing/campaigns/${c.id}`}>{c.name}</Link></td><td><Chip tone={statusTone(c.status)}>{c.status}</Chip></td><td>{c.template_key || "-"}</td><td>{fmtDateTime(c.created_at)}</td><td>{c.send_after ? fmtDateTime(c.send_after) : "-"}</td></tr>)}</tbody></table></div>}
      </State>
    </Card>
  );
}
