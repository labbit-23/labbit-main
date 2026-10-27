"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApi } from "@/components/marketing/api";
import { Card, Chip, Field, Note, Spinner, State } from "@/components/marketing/ui";
import WaBubble from "@/components/marketing/WaBubble";
import HeaderUpload from "@/components/marketing/HeaderUpload";
import { HARD_LIMITS, clampLimits, describeFilter, fmtInt, offerSummary, offerWarnings, templateSelectable, todayIst } from "@/lib/marketingUi/helpers";

export default function NewCampaignPage() {
  const router = useRouter();
  const tpls = useApi("/templates");
  const segs = useApi("/segments");
  const offers = useApi("/offers");
  const [f, setF] = useState({ name: "", template_key: "", segment_id: "", offer_id: "", pilot_size: "50", header: "", per_run_cap: 100, daily_cap: 1000, rate_per_minute: 30, cooldown_days: 30, window_start_hhmm: "09:00", window_end_hhmm: "20:00" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const { limits, clamped } = clampLimits(f);
  const template = (tpls.data?.templates || []).find((t) => t.key === f.template_key);
  const hasImage = template?.header?.type === "image";
  const offer = (offers.data?.offers || []).find((o) => o.id === f.offer_id);
  const offerWarn = offerWarnings(offer, todayIst());
  const ready = f.name.trim() && template && templateSelectable(template).ok && f.segment_id && (f.pilot_size === "" || Number(f.pilot_size) >= 1);

  async function create() {
    setBusy(true); setErr(null);
    try {
      const body = {
        name: f.name.trim(), template_key: f.template_key, segment_id: f.segment_id, offer_id: f.offer_id || undefined,
        pilot_size: f.pilot_size === "" ? undefined : Math.min(HARD_LIMITS.perRun, Number(f.pilot_size)), limits,
        ...(hasImage && f.header ? { header_image_url: f.header } : {})
      };
      const r = await api("/campaigns", { method: "POST", body });
      router.push(`/marketing/campaigns/${r.campaign_id}`);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="mk-split">
      <div>
        <Card title="1. Name and template">
          <Field label="Campaign name"><input type="text" value={f.name} onChange={set("name")} placeholder="Diwali lapsed - liver" /></Field>
          <State q={tpls} isEmpty={(d) => !(d.templates || []).length} empty="No templates in the registry.">
            {(d) => <div style={{ display: "grid", gap: 8 }}>{d.templates.map((t) => {
              const s = templateSelectable(t);
              return (
                <button key={t.key} type="button" disabled={!s.ok} className={`mk-tpl ${f.template_key === t.key ? "sel" : ""} ${s.ok ? "" : "disabled"}`} onClick={() => setF((x) => ({ ...x, template_key: t.key, header: "" }))}>
                  <div className="mk-row" style={{ justifyContent: "space-between" }}><b>{t.key}</b>
                    <span className="mk-row"><Chip tone={t.category === "MARKETING" ? "mkt" : "util"}>{t.category}</Chip><Chip tone={t.status === "approved" ? "ok" : "warn"}>{t.status}</Chip></span></div>
                  <div className="mk-sub" style={{ margin: "4px 0 0" }}>{t.purpose}</div>
                  {!s.ok && <div style={{ color: "var(--warn-ink)", marginTop: 4 }}>{s.hint}</div>}
                </button>
              );
            })}</div>}
          </State>
          {template?.category === "MARKETING" && <Note tone="warn">Marketing category: charged at the marketing rate and must carry an opt-out. Make sure the audience has not opted out of promotions.</Note>}
        </Card>
        {hasImage && (
          <Card title="2. Header image">
            <HeaderUpload value={f.header} onChange={(url) => setF((x) => ({ ...x, header: url }))} />
            <p className="mk-sub">Keep it neutral for Utility templates: a promotional banner can make Meta re-categorise the template.</p>
          </Card>
        )}
        <Card title="3. Audience and offer">
          <Field label="Segment" hint="Build and save segments on the Audience tab.">
            <State q={segs}>{(d) => (
              <select value={f.segment_id} onChange={set("segment_id")}><option value="">Choose a saved segment</option>
                {(d.segments || []).filter((s) => !s.archived_at).map((s) => <option key={s.id} value={s.id}>{s.name} ({describeFilter(s.filter)})</option>)}</select>)}</State>
          </Field>
          <Field label="Offer (optional)">
            <State q={offers}>{(d) => (
              <select value={f.offer_id} onChange={set("offer_id")}><option value="">No offer</option>
                {(d.offers || []).filter((o) => !o.archived_at).map((o) => <option key={o.id} value={o.id}>{o.name} - {offerSummary(o)}</option>)}</select>)}</State>
          </Field>
          {offerWarn.map((x) => <Note key={x} tone="warn">{x}</Note>)}
        </Card>
        <Card title="4. Limits">
          <div className="mk-grid2">
            <Field label="Pilot size" hint="First batch, sent after your test message."><input type="number" min="1" max={HARD_LIMITS.perRun} value={f.pilot_size} onChange={set("pilot_size")} /></Field>
            <Field label={`Per run (max ${HARD_LIMITS.perRun})`}><input type="number" min="1" value={f.per_run_cap} onChange={set("per_run_cap")} /></Field>
            <Field label={`Per day (max ${fmtInt(HARD_LIMITS.daily)})`}><input type="number" min="1" value={f.daily_cap} onChange={set("daily_cap")} /></Field>
            <Field label={`Per minute (max ${HARD_LIMITS.perMinute})`}><input type="number" min="1" value={f.rate_per_minute} onChange={set("rate_per_minute")} /></Field>
            <Field label="Cooldown days"><input type="number" min="0" value={f.cooldown_days} onChange={set("cooldown_days")} /></Field>
            <Field label="Send window (IST)"><div className="mk-row"><input type="time" min="09:00" max="20:00" value={f.window_start_hhmm} onChange={set("window_start_hhmm")} style={{ width: 120 }} /> to <input type="time" min="09:00" max="20:00" value={f.window_end_hhmm} onChange={set("window_end_hhmm")} style={{ width: 120 }} /></div></Field>
          </div>
          <div className="mk-note">Effective: {limits.per_run_cap}/run, {fmtInt(limits.daily_cap)}/day, {limits.rate_per_minute}/min, {limits.window_start_hhmm}-{limits.window_end_hhmm} IST. Hard ceilings {HARD_LIMITS.perRun}/{fmtInt(HARD_LIMITS.daily)}/{HARD_LIMITS.perMinute} and {HARD_LIMITS.windowStart}-{HARD_LIMITS.windowEnd} cannot be raised.</div>
          {clamped.length > 0 && <Note tone="warn">Reduced to the ceiling: {clamped.join(", ")}.</Note>}
        </Card>
        {err && <Note tone="bad">{err}</Note>}
        <div className="mk-row"><button className="mk-btn primary" disabled={!ready || busy} onClick={create}>{busy ? <Spinner label="Creating" /> : "Create draft campaign"}</button>
          <span className="mk-sub" style={{ margin: 0 }}>Next: dry run, test message, pilot, then send in batches. Scheduling is on the campaign page.</span></div>
      </div>
      <div style={{ position: "sticky", top: 8, alignSelf: "start" }}>
        <Card title="Live preview"><WaBubble template={template} headerUrl={f.header || undefined} />
          {template && <p className="mk-sub">Sample values only. Highlighted text is filled per patient.</p>}</Card>
      </div>
    </div>
  );
}
