"use client";
import Link from "next/link";
import { useApi } from "@/components/marketing/api";
import { Card, Chip, State, Stat, statusTone, Bars } from "@/components/marketing/ui";
import { HARD_LIMITS, fmtInt, fmtInr, pctOf, todayIst, withBarPct } from "@/lib/marketingUi/helpers";

function Trend({ days }) {
  const max = Math.max(1, ...days.map((d) => d.sent || 0));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 110 }} role="img" aria-label="Messages sent per day, last 14 days">
      {days.map((d) => (
        <div key={d.date} title={`${d.date}: ${d.sent} sent, ${d.delivered} delivered, ${d.read} read, ${d.failed} failed`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", height: "100%" }}>
          <div style={{ width: "100%", height: `${((d.sent || 0) / max) * 100}%`, minHeight: d.sent ? 3 : 0, background: "#141e28", borderRadius: 3 }} />
          <small style={{ fontSize: 9, color: "var(--text-3)", marginTop: 2 }}>{d.date.slice(8)}</small>
        </div>
      ))}
    </div>
  );
}

export default function OverviewPage() {
  const ov = useApi("/overview?days=14");
  const bot = useApi("/bot/flags");
  return (
    <State q={ov} isEmpty={(d) => !d?.totals}>
      {(d) => {
        const days = d.trend_by_day || [];
        const sentToday = days.find((x) => x.date === todayIst())?.sent || 0;
        const t = d.totals || {};
        const recent = (d.per_campaign || []).slice(0, 6);
        return (
          <>
            <div className="mk-stats">
              <Stat label="Sent (14 days)" value={fmtInt(t.sent)} />
              <Stat label="Delivered" value={fmtInt(t.delivered)} hint={`${pctOf(t.delivered, t.sent)}% of sent`} />
              <Stat label="Read" value={fmtInt(t.read)} hint={`${pctOf(t.read, t.sent)}% of sent`} />
              <Stat label="Failed" value={fmtInt(t.failed)} />
              <Stat label="Opted out" value={fmtInt(t.opted_out)} />
              <Stat label="Est. cost (incl. GST)" value={fmtInr(d.cost_estimate_inr_with_gst)} />
            </div>
            <div className="mk-grid2">
              <Card title="Sent per day">{days.length ? <Trend days={days} /> : <div className="mk-empty">No sends in this period.</div>}</Card>
              <Card title="Today">
                <p style={{ margin: "0 0 4px" }}>Daily send cap used</p>
                <Bars rows={[{ label: "Sent today", count: sentToday, pct: pctOf(sentToday, HARD_LIMITS.daily), pctText: `of ${fmtInt(HARD_LIMITS.daily)}` }]} tone="aqua" />
                <p className="mk-sub" style={{ margin: "6px 0" }}>Hard ceiling {fmtInt(HARD_LIMITS.daily)} a day, window {HARD_LIMITS.windowStart}-{HARD_LIMITS.windowEnd} IST.</p>
                <div className="mk-row">WhatsApp bot:{" "}
                  {bot.loading ? <Chip>checking</Chip> : bot.error ? <Chip tone="warn">{bot.error.status === 403 ? "no access" : "unknown"}</Chip>
                    : bot.data?.flags?.global_enabled ? <Chip tone="ok">ON</Chip> : <Chip tone="bad">OFF (kill switch)</Chip>}
                  <Link href="/marketing/bot" className="mk-btn small" style={{ textDecoration: "none" }}>Bot settings</Link>
                </div>
              </Card>
            </div>
            <Card title="Recent campaigns" actions={<Link href="/marketing/campaigns/new" className="mk-btn primary small" style={{ textDecoration: "none" }}>New campaign</Link>}>
              {recent.length === 0 ? <div className="mk-empty">No campaigns have sent yet.</div> : (
                <div className="mk-scroll"><table className="mk-table"><thead><tr><th>Campaign</th><th>Status</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Failed</th></tr></thead>
                  <tbody>{recent.map((c) => <tr key={c.campaign_id}><td><Link href={`/marketing/campaigns/${c.campaign_id}`}>{c.name}</Link></td><td><Chip tone={statusTone(c.status)}>{c.status}</Chip></td><td>{fmtInt(c.sent)}</td><td>{fmtInt(c.delivered)}</td><td>{fmtInt(c.read)}</td><td>{fmtInt(c.failed)}</td></tr>)}</tbody></table></div>
              )}
            </Card>
            {d.campaigns_by_status && <Card title="Campaigns by status"><Bars rows={withBarPct(Object.entries(d.campaigns_by_status).map(([label, count]) => ({ label, count })))} /></Card>}
          </>
        );
      }}
    </State>
  );
}
