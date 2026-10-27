"use client";
import { Bars } from "./ui";
import { fmtInt, fmtInr, shapeBreakdowns, shapeCost, shapeFunnel } from "@/lib/marketingUi/helpers";

/** Renders a labit-core audience summary (preview) or a campaign dry run: funnel, breakdowns, cost, offer tiers, anonymised sample. */
export default function AudienceResult({ summary }) {
  const funnel = shapeFunnel(summary);
  const bd = shapeBreakdowns(summary);
  const cost = shapeCost(summary);
  const sample = Array.isArray(summary?.sample) ? summary.sample : [];
  const top = Math.max(1, ...funnel.map((f) => f.count));
  const total = summary?.total ?? (funnel.length ? funnel[funnel.length - 1].count : null);
  return (
    <div>
      {total != null && <p><b>{fmtInt(total)}</b> patients in this audience.</p>}
      {funnel.length === 0 ? <div className="mk-empty">The server returned no funnel for this filter.</div> : (
        <div className="mk-funnel">
          {funnel.map((f) => (
            <div className="step" key={f.key}>
              <div className="mk-bar"><span className="lbl" title={f.label}>{f.label}</span>
                <span className="track"><span className={`fill ${f.kind === "final" ? "aqua" : ""}`} style={{ width: `${Math.max(2, (f.count / top) * 100)}%` }} /></span>
                <span className="val"><b>{fmtInt(f.count)}</b></span></div>
              {f.removed > 0 && <div className="removed">- {fmtInt(f.removed)} removed</div>}
            </div>
          ))}
        </div>
      )}
      <div className="mk-grid2">
        {bd.byPackage.length > 0 && <div><h3>By package</h3><Bars rows={bd.byPackage} /></div>}
        {bd.byYear.length > 0 && <div><h3>By last-visit year</h3><Bars rows={bd.byYear} tone="aqua" /></div>}
        {bd.byVisitBand.length > 0 && <div><h3>By number of visits</h3><Bars rows={bd.byVisitBand} /></div>}
        {bd.bySex.length > 0 && <div><h3>By sex</h3><Bars rows={bd.bySex} tone="aqua" /></div>}
        {bd.byAgeBand.length > 0 && <div><h3>By age band</h3><Bars rows={bd.byAgeBand} /></div>}
        {bd.bySource.length > 0 && <div><h3>Top referral sources</h3><Bars rows={bd.bySource} tone="aqua" /></div>}
      </div>
      {bd.tierSample && (
        <div className="mk-grid2">
          <div><h3>Offer tiers (sample of {fmtInt(bd.tierSample.sampled)} of {fmtInt(bd.tierSample.of)})</h3><Bars rows={bd.tiers} /></div>
          <div><h3>Focus areas (same sample)</h3><Bars rows={bd.focusAreas} tone="aqua" /></div>
        </div>
      )}
      {cost && <p><b>Cost estimate:</b> {cost.messages != null ? `${fmtInt(cost.messages)} messages` : ""}{cost.inrExGst != null ? ` ≈ ${fmtInr(cost.inrExGst)} before GST` : ""}{cost.inrWithGst != null ? ` (≈ ${fmtInr(cost.inrWithGst)} incl. GST)` : ""}. Estimate only: verify against the Mtalkz rate card.</p>}
      {sample.length > 0 && (
        <>
          <h3>Anonymised sample</h3>
          <div className="mk-scroll"><table className="mk-table"><thead><tr>{Object.keys(sample[0]).map((k) => <th key={k}>{k.replace(/_/g, " ")}</th>)}</tr></thead>
            <tbody>{sample.slice(0, 10).map((r, i) => <tr key={i}>{Object.keys(sample[0]).map((k) => <td key={k}>{Array.isArray(r[k]) ? r[k].join(", ") : String(r[k] ?? "")}</td>)}</tr>)}</tbody></table></div>
        </>
      )}
    </div>
  );
}
