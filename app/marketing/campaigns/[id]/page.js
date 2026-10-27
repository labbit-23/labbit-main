"use client";
import { use, useEffect, useRef, useState } from "react";
import { api, useApi } from "@/components/marketing/api";
import { Bars, Card, Chip, Field, Note, Spinner, Stat, State, statusTone } from "@/components/marketing/ui";
import AudienceResult from "@/components/marketing/AudienceResult";
import WaBubble from "@/components/marketing/WaBubble";
import { confirmMatches, failureRows, fmtDateTime, fmtInr, fmtInt, launchGate, sendProgress, shapeResultsFunnel, withBarPct } from "@/lib/marketingUi/helpers";

function Step({ n, title, state, children }) {
  return <div className={`mk-step ${state === "locked" ? "locked" : ""} ${state === "done" ? "done" : ""}`}>
    <div className="mk-row" style={{ justifyContent: "space-between", marginBottom: 6 }}><b>{n}. {title}</b>{state === "done" && <Chip tone="ok">done</Chip>}{state === "locked" && <Chip>locked</Chip>}</div>{children}</div>;
}

function Results({ id, refreshKey }) {
  const q = useApi(`/campaigns/${id}/results?engagement=1`, [refreshKey]);
  return (
    <State q={q} isEmpty={(d) => !d?.funnel} empty="No results yet.">
      {(d) => {
        const rows = shapeResultsFunnel(d.funnel);
        const top = Math.max(1, ...rows.map((r) => r.count));
        const days = d.trend_by_day || [];
        const maxDay = Math.max(1, ...days.map((x) => x.sent || 0));
        const fails = failureRows(d);
        const tiers = withBarPct(Object.entries(d.by_offer_tier || {}).map(([label, count]) => ({ label, count })));
        const skipped = Object.entries(d.skipped_reasons || {}).map(([label, count]) => ({ label, count }));
        return (
          <>
            <div className="mk-stats">
              <Stat label="Recipients" value={fmtInt(d.recipients)} />
              <Stat label="Sent" value={fmtInt(d.funnel.sent)} />
              <Stat label="Cost so far (incl. GST)" value={fmtInr(d.cost_so_far_estimate?.inr_with_gst)} hint={d.cost_so_far_estimate ? `${fmtInt(d.cost_so_far_estimate.messages)} messages` : ""} />
              <Stat label="Opt-outs since prepared" value={fmtInt(d.opt_outs_since_prepared ?? d.funnel.opted_out)} />
            </div>
            <div className="mk-grid2">
              <Card title="Funnel">
                {rows.map((r) => <div className="mk-bar" key={r.key}><span className="lbl">{r.label}</span><span className="track"><span className={`fill ${r.key === "failed" ? "bad" : r.key === "read" ? "aqua" : ""}`} style={{ width: `${Math.max(r.count ? 2 : 0, (r.count / top) * 100)}%` }} /></span><span className="val">{fmtInt(r.count)}{r.pct != null ? ` (${r.pct}%)` : ""}</span></div>)}
              </Card>
              <Card title="Failures by Meta code">
                {fails.length === 0 ? <div className="mk-empty">No failures.</div> : <table className="mk-table"><tbody>{fails.map((f) => <tr key={f.code}><td><code>{f.code}</code></td><td>{f.label}</td><td>{fmtInt(f.count)}</td></tr>)}</tbody></table>}
                {skipped.length > 0 && <><h3>Skipped</h3><Bars rows={withBarPct(skipped)} /></>}
              </Card>
            </div>
            <div className="mk-grid2">
              <Card title="Per offer tier"><Bars rows={tiers} tone="aqua" /></Card>
              <Card title="Per day">
                {days.length === 0 ? <div className="mk-empty">No sends yet.</div> : <div className="mk-scroll"><table className="mk-table"><thead><tr><th>Date</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Failed</th></tr></thead>
                  <tbody>{days.map((x) => <tr key={x.date}><td>{x.date}</td><td><span style={{ display: "inline-block", height: 8, width: `${(x.sent / maxDay) * 60}px`, background: "#141e28", borderRadius: 4, marginRight: 6 }} />{x.sent}</td><td>{x.delivered}</td><td>{x.read}</td><td>{x.failed}</td></tr>)}</tbody></table></div>}
              </Card>
            </div>
          </>
        );
      }}
    </State>
  );
}

export default function CampaignDetail({ params }) {
  const { id } = use(params);
  const det = useApi(`/campaigns/${id}`);
  const audit = useApi(`/audit?campaign_id=${id}&limit=200`);
  const tpls = useApi("/templates");
  const [dry, setDry] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [numbers, setNumbers] = useState("");
  const [testRes, setTestRes] = useState(null);
  const [typed, setTyped] = useState("");
  const [header, setHeader] = useState({ state: "unknown", reason: null });
  const [run, setRun] = useState({ active: false, sent: 0, failed: 0, skipped: 0, reason: null });
  const [sendAfter, setSendAfter] = useState("");
  const [rk, setRk] = useState(0);
  const stopRef = useRef(false);

  const c = det.data?.campaign;
  const rec = det.data?.recipients_by_status || {};
  const cfg = c?.config || {};
  const tpl = (tpls.data?.templates || []).find((t) => t.key === (cfg.template?.key || c?.template_key));
  const headerUrl = cfg.template?.header_image_url || null;
  const needsHeader = Boolean(headerUrl);
  const gate = launchGate({ status: c?.status, recipients: rec, auditRows: audit.data?.audit || [], dryRunDone: Boolean(dry), headerOk: header.state !== "bad", needsHeader, pilotPrepared: Boolean(cfg.pilot_prepared) });
  const progress = sendProgress({ stored: gate.stored, sent: rec.sent, failed: rec.failed, skipped: rec.skipped });
  const pilot = cfg.pilot_size || 50;

  const refresh = () => { det.reload(); audit.reload(); setRk((k) => k + 1); };
  useEffect(() => { stopRef.current = false; return () => { stopRef.current = true; }; }, []);

  async function act(action, extra = {}, label = action) {
    setBusy(label); setMsg(null);
    try { return await api(`/campaigns/${id}/actions`, { method: "POST", body: { action, ...extra } }); }
    catch (e) { setMsg({ tone: "bad", text: e.message }); return null; }
    finally { setBusy(""); }
  }
  async function checkHeader() {
    if (!needsHeader) return true;
    setHeader({ state: "checking", reason: null });
    try {
      const r = await api("/uploads/check", { method: "POST", body: { url: headerUrl } });
      setHeader({ state: r.reachable ? "ok" : "bad", reason: r.reason });
      return r.reachable;
    } catch (e) { setHeader({ state: "bad", reason: e.message }); return false; }
  }

  async function doDry() { const r = await act("prepare", { dry_run: true, pilot_size: pilot }, "dry"); if (r) setDry(r); }
  async function doPrepare() { if (await act("prepare", { dry_run: false, pilot_size: pilot }, "prepare")) refresh(); }
  async function doExpand() { if (await act("prepare", { dry_run: false, expand: true }, "expand")) refresh(); }
  async function doTest() {
    if (!(await checkHeader())) return setMsg({ tone: "bad", text: "Blocked: the header image address cannot be fetched by Meta. Fix or replace the header before testing." });
    const list = numbers.split(/[\s,]+/).filter(Boolean);
    const r = await act("test", list.length ? { numbers: list } : {}, "test");
    if (r) { setTestRes(r.results || []); refresh(); }
  }
  async function sendBatches(size, once) {
    if (!(await checkHeader())) return setMsg({ tone: "bad", text: "Blocked: the header image address cannot be fetched by Meta. Fix or replace the header before sending." });
    stopRef.current = false;
    setRun({ active: true, sent: 0, failed: 0, skipped: 0, reason: null });
    let tot = { sent: 0, failed: 0, skipped: 0 };
    for (;;) {
      const r = await act("send", { batch_size: size }, "send");
      if (!r) break;
      tot = { sent: tot.sent + (r.sent || 0), failed: tot.failed + (r.failed || 0), skipped: tot.skipped + (r.skipped || 0) };
      setRun({ active: true, ...tot, reason: r.stopped_reason || null });
      det.reload();
      if (once || !r.more || r.stopped_reason || stopRef.current) { setRun((x) => ({ ...x, active: false, reason: r.stopped_reason || (stopRef.current ? "Stopped by you." : null) })); break; }
    }
    setRun((x) => ({ ...x, active: false }));
    refresh();
  }
  async function stopNow() { stopRef.current = true; if (await act("stop", {}, "stop")) refresh(); }
  async function doResume() { if (await act("resume", {}, "resume")) refresh(); }
  async function doSchedule(clear) {
    const iso = clear ? null : new Date(sendAfter).toISOString();
    if (!clear && !sendAfter) return;
    if (await act("schedule", { send_after: iso }, "schedule")) refresh();
  }

  const lock = (ok, done) => (done ? "done" : ok ? "open" : "locked");
  return (
    <State q={det} isEmpty={(d) => !d?.campaign}>
      {() => (
        <>
          <div className="mk-row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div><h2 style={{ fontSize: 20, margin: 0 }}>{c.name}</h2>
              <div className="mk-row"><Chip tone={statusTone(c.status)}>{c.status}</Chip><Chip>{c.template_key}</Chip>{c.send_after && <Chip tone="navy">scheduled {fmtDateTime(c.send_after)}</Chip>}</div></div>
            <button className="mk-btn small" onClick={refresh}>Refresh</button>
          </div>
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
          <div className="mk-split">
            <div>
              <Card title="Guided launch">
                {needsHeader && header.state === "bad" && <Note tone="bad">Header image problem: {header.reason} Test, pilot and send are blocked until it can be fetched.</Note>}
                {needsHeader && header.state === "ok" && <Note tone="ok">Header image reachable.</Note>}
                <Step n={1} title="Dry run (writes nothing)" state={lock(gate.canDryRun, gate.prepared)}>
                  <button className="mk-btn" disabled={!gate.canDryRun || gate.prepared || !!busy} onClick={doDry}>{busy === "dry" ? <Spinner label="Counting" /> : "Dry-run prepare"}</button>
                  {dry && <div style={{ marginTop: 8 }}><AudienceResult summary={{ stats: dry.stats, cost_estimate: dry.cost_estimate, sample: dry.sample }} />
                    {dry.offer && <p className="mk-sub">Offer tiers: {Object.entries(dry.offer.by_tier || {}).map(([k, v]) => `${k} ${fmtInt(v)}`).join(", ")}</p>}
                    {dry.days_to_complete_at_daily_cap != null && <p className="mk-sub">About {dry.days_to_complete_at_daily_cap} day(s) to finish at the daily cap.</p>}</div>}
                </Step>
                <Step n={2} title="Store recipients" state={lock(gate.canPrepare, gate.prepared)}>
                  <button className="mk-btn" disabled={!gate.canPrepare || !!busy} onClick={doPrepare}>{busy === "prepare" ? <Spinner label="Preparing" /> : `Prepare ${pilot} pilot recipients`}</button>
                  {!dry && !gate.prepared && <div className="mk-sub">Run the dry run first.</div>}
                  {gate.prepared && <div className="mk-sub">{fmtInt(gate.stored)} recipients stored.</div>}
                </Step>
                <Step n={3} title="Test to staff numbers" state={lock(gate.canTest, gate.testDone)}>
                  <Field label="Numbers (blank = all allowlisted staff numbers)" hint="Only numbers on the server allowlist are accepted; anything else rejects the whole call."><input type="text" value={numbers} onChange={(e) => setNumbers(e.target.value)} disabled={!gate.canTest} /></Field>
                  <button className="mk-btn" disabled={!gate.canTest || !!busy} onClick={doTest}>{busy === "test" ? <Spinner label="Sending test" /> : "Send test message"}</button>
                  {testRes && <ul>{testRes.map((t, i) => <li key={i}>{t.phone_masked}: {t.ok ? "sent" : "failed"}</li>)}</ul>}
                  {!gate.testDone && gate.prepared && <div className="mk-sub">Look at the real message on a phone before the pilot. Pilot and send stay locked until a test succeeds.</div>}
                </Step>
                <Step n={4} title={`Pilot (${pilot})`} state={lock(gate.canPilot, gate.sent > 0)}>
                  <button className="mk-btn" disabled={!gate.canPilot || !!busy || run.active} onClick={() => sendBatches(pilot, true)}>{run.active ? <Spinner label="Sending" /> : `Send pilot batch`}</button>
                  {gate.sent > 0 && <div className="mk-sub">{fmtInt(gate.sent)} sent. Check delivery below before widening.</div>}
                </Step>
                <Step n={5} title="Send in batches" state={lock(gate.canSend || gate.canExpand, c.status === "completed")}>
                  {gate.canExpand && <><p className="mk-sub">Pilot done. Add the rest of the audience:</p><button className="mk-btn" disabled={!!busy} onClick={doExpand}>{busy === "expand" ? <Spinner label="Adding" /> : "Add remaining audience"}</button></>}
                  {gate.canSend && <>
                    <Field label={`Type the audience count (${fmtInt(gate.stored)}) to confirm`}><input type="text" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={String(gate.stored)} /></Field>
                    <div className="mk-row"><button className="mk-btn primary" disabled={!confirmMatches(typed, gate.stored) || run.active || !!busy} onClick={() => sendBatches(Math.min(cfg.limits?.per_run_cap || 100, 500), false)}>{run.active ? <Spinner label="Sending" /> : "Send in batches"}</button>
                      {run.active && <button className="mk-btn danger" onClick={stopNow}>Stop</button>}</div></>}
                  {c.status === "paused" && <Note tone="warn">Paused (circuit breaker or stop). <button className="mk-btn small" onClick={doResume} disabled={!!busy}>Resume</button></Note>}
                  {c.status === "running" && !run.active && <button className="mk-btn danger small" onClick={stopNow}>Stop campaign</button>}
                  {(gate.sent > 0 || run.active) && <div style={{ marginTop: 8 }}><div className="mk-bar"><span className="track"><span className="fill aqua" style={{ width: `${progress.pct}%` }} /></span><span className="val">{progress.done}/{progress.total}</span></div>
                    {run.reason && <div className="mk-sub">{run.reason}</div>}</div>}
                </Step>
                <Step n={6} title="Schedule (optional)" state={lock(gate.prepared && gate.testDone && !["completed", "stopped"].includes(c.status), false)}>
                  <div className="mk-row"><input type="datetime-local" style={{ maxWidth: 240 }} value={sendAfter} onChange={(e) => setSendAfter(e.target.value)} disabled={!gate.prepared || !gate.testDone} />
                    <button className="mk-btn small" disabled={!gate.prepared || !gate.testDone || !sendAfter || !!busy} onClick={() => doSchedule(false)}>Schedule</button>
                    {c.send_after && <button className="mk-btn small" onClick={() => doSchedule(true)}>Clear schedule</button>}</div>
                  <div className="mk-sub">Scheduled campaigns send only inside the window and refuse manual sends. A scheduler must call run-due.</div>
                </Step>
              </Card>
            </div>
            <div style={{ position: "sticky", top: 8, alignSelf: "start" }}>
              <Card title="Message preview"><WaBubble template={tpl} headerUrl={headerUrl || undefined} /></Card>
              <Card title="Limits"><div className="mk-sub" style={{ margin: 0 }}>{cfg.limits?.per_run_cap}/run &middot; {fmtInt(cfg.limits?.daily_cap)}/day &middot; {cfg.limits?.rate_per_minute}/min &middot; {cfg.limits?.window_start_hhmm}-{cfg.limits?.window_end_hhmm} IST</div></Card>
            </div>
          </div>
          <h2 style={{ marginTop: 6 }}>Results</h2>
          <Results id={id} refreshKey={rk} />
        </>
      )}
    </State>
  );
}
