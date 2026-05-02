"use client";

import { useEffect, useState } from "react";

const FEATURE_KEYS = [
  "auto_dispatch_enabled",
  "auto_dispatch_paused_default",
  "report_dispatch_monitor_enabled",
  "whatsapp_inbox_enabled",
  "whatsapp_bot_enabled",
  "cto_dashboard_enabled",
  "booking_requests_enabled",
  "quickbook_enabled"
];

export default function AppSetupPage() {
  const [setup, setSetup] = useState({ features: {}, docs: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/setup/app", { cache: "no-store", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      setSetup(body?.setup || { features: {}, docs: {} });
    } catch (e) {
      setError(e?.message || "Failed to load app setup");
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
      const res = await fetch("/api/admin/setup/app", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ setup })
      });
      if (!res.ok) throw new Error(await res.text());
      setNotice("Saved app setup");
    } catch (e) {
      setError(e?.message || "Failed to save app setup");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 20, background: "#f4f7fb", minHeight: "100vh" }}>
      <div style={{ background: "#fff", border: "1px solid #d9e3f0", borderRadius: 12, padding: 16, maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, color: "#0f2f4a" }}>App Setup</h1>
            <p style={{ margin: "6px 0 0", color: "#5b718d" }}>Feature controls and runtime notes for admins.</p>
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
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <h3 style={{ margin: 0 }}>Features</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 8 }}>
              {FEATURE_KEYS.map((k) => (
                <label key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #e3e8ef", borderRadius: 8, padding: "10px 12px" }}>
                  <span style={{ fontSize: 14 }}>{k}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(setup?.features?.[k])}
                    onChange={(e) => setSetup((prev) => ({
                      ...prev,
                      features: { ...(prev.features || {}), [k]: e.target.checked }
                    }))}
                  />
                </label>
              ))}
            </div>
            <h3 style={{ margin: "8px 0 0" }}>Runtime Defaults</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 13, color: "#475467" }}>lookback_hours</span>
                <input
                  type="number"
                  value={Number(setup?.docs?.lookback_hours ?? 24)}
                  onChange={(e) => setSetup((prev) => ({ ...prev, docs: { ...(prev.docs || {}), lookback_hours: Number(e.target.value || 0) } }))}
                  style={{ border: "1px solid #d0d7e2", borderRadius: 8, padding: "10px 12px" }}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 13, color: "#475467" }}>cooloff_lab_minutes</span>
                <input
                  type="number"
                  value={Number(setup?.docs?.cooloff_lab_minutes ?? 30)}
                  onChange={(e) => setSetup((prev) => ({ ...prev, docs: { ...(prev.docs || {}), cooloff_lab_minutes: Number(e.target.value || 0) } }))}
                  style={{ border: "1px solid #d0d7e2", borderRadius: 8, padding: "10px 12px" }}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 13, color: "#475467" }}>cooloff_radiology_minutes</span>
                <input
                  type="number"
                  value={Number(setup?.docs?.cooloff_radiology_minutes ?? 10)}
                  onChange={(e) => setSetup((prev) => ({ ...prev, docs: { ...(prev.docs || {}), cooloff_radiology_minutes: Number(e.target.value || 0) } }))}
                  style={{ border: "1px solid #d0d7e2", borderRadius: 8, padding: "10px 12px" }}
                />
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

