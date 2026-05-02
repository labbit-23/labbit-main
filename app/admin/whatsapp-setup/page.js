"use client";

import { useEffect, useState } from "react";

const FIELD_ORDER = [
  ["api_base_url", "API Base URL"],
  ["report_status_reqno_url", "Report Status URL (REQNO)"],
  ["requisitions_by_date_url", "Requisitions By Date URL"],
  ["internal_send_url", "Internal Send URL"],
  ["report_template_name", "Report Template Name"],
  ["report_template_language", "Template Language"],
  ["source_service", "Source Service"],
  ["lab_id", "Lab ID"]
];

export default function WhatsappSetupPage() {
  const [setup, setSetup] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/setup/whatsapp", { cache: "no-store", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      setSetup(body?.setup || {});
    } catch (e) {
      setError(e?.message || "Failed to load WhatsApp setup");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/setup/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ setup })
      });
      if (!res.ok) throw new Error(await res.text());
      setNotice("Saved WhatsApp setup");
    } catch (e) {
      setError(e?.message || "Failed to save WhatsApp setup");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 20, background: "#f4f7fb", minHeight: "100vh" }}>
      <div style={{ background: "#fff", border: "1px solid #d9e3f0", borderRadius: 12, padding: 16, maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, color: "#0f2f4a" }}>WhatsApp Setup</h1>
            <p style={{ margin: "6px 0 0", color: "#5b718d" }}>Prefilled from live config. Update safely without touching code.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href="/admin" style={{ textDecoration: "none", border: "1px solid #c8d4e6", borderRadius: 8, padding: "8px 12px", color: "#25496b" }}>Back</a>
            <button onClick={load} disabled={loading} style={{ border: "1px solid #c8d4e6", borderRadius: 8, padding: "8px 12px" }}>Refresh</button>
            <button onClick={save} disabled={saving || loading} style={{ background: "#1463ff", color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px" }}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        {error ? <p style={{ color: "#b42318", marginTop: 10 }}>{error}</p> : null}
        {notice ? <p style={{ color: "#027a48", marginTop: 10 }}>{notice}</p> : null}
        {loading ? (
          <p style={{ marginTop: 12 }}>Loading…</p>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {FIELD_ORDER.map(([key, label]) => (
              <label key={key} style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 13, color: "#475467" }}>{label}</span>
                <input
                  value={String(setup?.[key] || "")}
                  onChange={(e) => setSetup((prev) => ({ ...prev, [key]: e.target.value }))}
                  style={{ border: "1px solid #d0d7e2", borderRadius: 8, padding: "10px 12px" }}
                />
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

