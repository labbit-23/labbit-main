"use client";
import { renderTemplate } from "@/lib/marketingUi/helpers";

/** HTML/CSS WhatsApp message preview. headerUrl overrides the template's sample header image. */
export default function WaBubble({ template, values, headerUrl, time = "10:30" }) {
  if (!template) return <div className="mk-empty">Pick a template to preview it.</div>;
  const r = renderTemplate(template, values);
  const img = headerUrl || template.header?.sample_url;
  return (
    <div className="wa-phone">
      <div className="wa-bubble">
        {r.hasImageHeader && (img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="wa-hdr" src={img} alt="Header preview" />
          : <div className="wa-hdr ph">Header image</div>)}
        <div className="wa-body">{r.segments.map((s, i) => s.variable ? <span key={i} className={`wa-var ${s.missing ? "missing" : ""}`} title={s.variable}>{s.text}</span> : <span key={i}>{s.text}</span>)}</div>
        {r.footer && <div className="wa-foot">{r.footer}</div>}
        <div className="wa-time">{time}</div>
      </div>
      {r.buttons.length > 0 && <div className="wa-btns">{r.buttons.map((b, i) => <div key={i} className="wa-btn">{b.type === "url" ? "↗ " : ""}{b.text}</div>)}</div>}
    </div>
  );
}
