"use client";
import { useRef, useState } from "react";
import { api } from "./api";
import { Note, Spinner } from "./ui";
import { HEADER_IMAGE, validateHeaderImage } from "@/lib/marketingUi/helpers";

function measure(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve({}); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/** Drag/drop header image upload. value = custom URL ("" = use the template default). */
export default function HeaderUpload({ value, onChange }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState({ errors: [], warnings: [] });

  async function take(file) {
    if (!file) return;
    const dims = await measure(file);
    const check = validateHeaderImage({ type: file.type, size: file.size, ...dims });
    setIssues({ errors: check.errors, warnings: check.warnings });
    if (!check.ok) return;
    setBusy(true);
    try {
      const form = new FormData(); form.append("file", file);
      const r = await api("/uploads", { method: "POST", form });
      setIssues({ errors: [], warnings: [...new Set([...check.warnings, ...(r.warnings || [])])] });
      onChange(r.url);
    } catch (e) { setIssues({ errors: [e.message], warnings: [] }); }
    setBusy(false);
  }

  return (
    <div>
      <div className={`mk-drop ${over ? "over" : ""}`} role="button" tabIndex={0}
        onClick={() => input.current?.click()} onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}>
        {busy ? <Spinner label="Uploading" /> : value ? "Drop or click to replace the header image" : "Drop a header image here, or click to choose"}
        <div><small>JPEG or PNG, up to 5 MB, about 1.91:1 (for example 1200x628), at least {HEADER_IMAGE.minWidth}px wide.</small></div>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
      {issues.errors.map((x) => <Note key={x} tone="bad">{x}</Note>)}
      {issues.warnings.map((x) => <Note key={x} tone="warn">{x}</Note>)}
      <div className="mk-row" style={{ marginTop: 6 }}>
        {value ? <><span className="mk-chip ok">Custom header in use</span><button className="mk-btn small" onClick={() => { onChange(""); setIssues({ errors: [], warnings: [] }); }}>Use default header</button></> : <span className="mk-chip">Default neutral header</span>}
      </div>
    </div>
  );
}
