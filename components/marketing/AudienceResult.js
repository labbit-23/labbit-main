"use client";
import { Bars } from "./ui";
import { fmtInt, fmtInr, shapeBreakdowns, shapeCost, shapeFunnel } from "@/lib/marketingUi/helpers";

/** Renders an audience summary (preview) or a dry-run response: funnel, breakdowns, cost, anonymised sample. */
export default function AudienceResult({ summary }) {
  const funnel = shapeFunnel(summary);
  const { byPackage, byYear } = shapeBreakdowns(summary);
  const cost = shapeCost(summary);
  const sample = Array.isArray(summary?.sample) ? summary.sample : [];
  const top = Math.max(1, ...funnel.map((f) => f.count));
  return (
    <div>
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
        <div><h3>By package</h3><Bars rows={byPackage} /></div>
        <div><h3>By last-visit year</h3><Bars rows={byYear} tone="aqua" /></div>
      </div>
      {cost && <p><b>Cost estimate:</b> {cost.messages != null ? `${fmtInt(cost.messages)} messages` : ""}{cost.inrWithGst != null ? ` ≈ ${fmtInr(cost.inrWithGst)} incl. GST` : ""}</p>}
      {sample.length > 0 && (
        <>
          <h3>Anonymised sample</h3>
          <div className="mk-scroll"><table className="mk-table"><thead><tr>{Object.keys(sample[0]).map((k) => <th key={k}>{k.replace(/_/g, " ")}</th>)}</tr></thead>
            <tbody>{sample.slice(0, 10).map((r, i) => <tr key={i}>{Object.keys(sample[0]).map((k) => <td key={k}>{String(r[k] ?? "")}</td>)}</tr>)}</tbody></table></div>
        </>
      )}
    </div>
  );
}
