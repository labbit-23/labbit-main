"use client";

import { useEffect, useState } from "react";

const FLOW_OPTIONS = [
  { value: "home_visit", label: "Home Visit Bot Flow" },
  { value: "reports", label: "Reports Bot Flow" },
  { value: "main_menu", label: "Main Menu Bot Flow" }
];

function blankTemplateShortcut() {
  return { key: "", label: "", type: "template", message: "" };
}

function blankHandoverShortcut() {
  return { key: "", label: "", type: "handover", flow: "main_menu" };
}

function normalizeSettings(data) {
  const shortcuts = Array.isArray(data?.shortcuts) ? data.shortcuts : [];
  return {
    shortcuts: shortcuts.map((item) => ({
      key: String(item?.key || ""),
      label: String(item?.label || ""),
      type: item?.type === "handover" ? "handover" : "template",
      message: String(item?.message || ""),
      flow: String(item?.flow || "main_menu")
    }))
  };
}

export default function WhatsappSettingsPage() {
  const [settings, setSettings] = useState({ shortcuts: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const fetchSettings = async () => {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const response = await fetch("/api/admin/whatsapp/settings", {
        credentials: "include",
        cache: "no-store"
      });
      if (!response.ok) throw new Error(await response.text());
      const body = await response.json();
      setSettings(normalizeSettings(body?.settings || {}));
    } catch (err) {
      setError(err?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateShortcut = (index, key, value) => {
    setSettings((prev) => {
      const next = [...prev.shortcuts];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, shortcuts: next };
    });
  };

  const removeShortcut = (index) => {
    setSettings((prev) => ({
      ...prev,
      shortcuts: prev.shortcuts.filter((_, i) => i !== index)
    }));
  };

  const addTemplateShortcut = () => {
    setSettings((prev) => ({
      ...prev,
      shortcuts: [...prev.shortcuts, blankTemplateShortcut()]
    }));
  };

  const addHandoverShortcut = () => {
    setSettings((prev) => ({
      ...prev,
      shortcuts: [...prev.shortcuts, blankHandoverShortcut()]
    }));
  };

  const save = async () => {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const response = await fetch("/api/admin/whatsapp/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ settings })
      });
      if (!response.ok) throw new Error(await response.text());
      const body = await response.json();
      setSettings(normalizeSettings(body?.settings || {}));
      setNotice("Saved");
    } catch (err) {
      setError(err?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="waSettingsRoot">
      <div className="waSettingsCard">
        <div className="waSettingsHead">
          <div>
            <h1>WhatsApp Settings</h1>
            <p>Manage agent shortcuts and bot handover actions.</p>
          </div>
          <div className="waSettingsActions">
            <a href="/admin/whatsapp" className="waBtnGhost">← Back to Inbox</a>
            <button type="button" className="waBtnGhost" onClick={fetchSettings} disabled={loading}>
              Refresh
            </button>
            <button type="button" className="waBtnPrimary" onClick={save} disabled={saving || loading}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {error && <div className="waError">{error}</div>}
        {notice && <div className="waNotice">{notice}</div>}

        {loading ? (
          <div className="waEmpty">Loading settings…</div>
        ) : (
          <div className="waSettingsBody">
            <div className="waSettingsToolbar">
              <button type="button" className="waBtnGhost" onClick={addTemplateShortcut}>
                + Add Template Shortcut
              </button>
              <button type="button" className="waBtnGhost" onClick={addHandoverShortcut}>
                + Add Bot Handover Shortcut
              </button>
            </div>

            {settings.shortcuts.length === 0 ? (
              <div className="waEmpty">No shortcuts configured.</div>
            ) : (
              <div className="waRows">
                {settings.shortcuts.map((shortcut, index) => (
                  <div key={`${shortcut.key}-${index}`} className="waRow">
                    <input
                      value={shortcut.key}
                      onChange={(e) => updateShortcut(index, "key", e.target.value)}
                      placeholder="/r"
                    />
                    <input
                      value={shortcut.label}
                      onChange={(e) => updateShortcut(index, "label", e.target.value)}
                      placeholder="Label"
                    />

                    {shortcut.type === "template" ? (
                      <textarea
                        value={shortcut.message || ""}
                        onChange={(e) => updateShortcut(index, "message", e.target.value)}
                        placeholder="Template text"
                        rows={2}
                      />
                    ) : (
                      <select
                        value={shortcut.flow || "main_menu"}
                        onChange={(e) => updateShortcut(index, "flow", e.target.value)}
                      >
                        {FLOW_OPTIONS.map((flow) => (
                          <option key={flow.value} value={flow.value}>
                            {flow.label}
                          </option>
                        ))}
                      </select>
                    )}

                    <button type="button" className="waBtnDanger" onClick={() => removeShortcut(index)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .waSettingsRoot {
          padding: 20px;
          background: #f4f7fb;
          min-height: 100vh;
        }
        .waSettingsCard {
          background: #fff;
          border: 1px solid #d9e3f0;
          border-radius: 14px;
          overflow: hidden;
        }
        .waSettingsHead {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
          border-bottom: 1px solid #e3e9f2;
        }
        .waSettingsHead h1 {
          margin: 0;
          font-size: 24px;
          color: #0f2f4a;
        }
        .waSettingsHead p {
          margin: 4px 0 0;
          color: #5b718d;
        }
        .waSettingsActions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .waSettingsBody {
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .waSettingsToolbar {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .waRows {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .waRow {
          display: grid;
          grid-template-columns: 140px 200px 1fr auto;
          gap: 8px;
          align-items: start;
          background: #f7f9fc;
          border: 1px solid #e3e9f2;
          border-radius: 10px;
          padding: 10px;
        }
        input, textarea, select {
          width: 100%;
          border: 1px solid #c5d2e2;
          border-radius: 8px;
          padding: 8px;
          font: inherit;
        }
        .waBtnPrimary, .waBtnGhost, .waBtnDanger {
          border-radius: 8px;
          border: 1px solid transparent;
          padding: 8px 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .waBtnPrimary { background: #0f8a94; color: #fff; }
        .waBtnGhost { background: #fff; border-color: #c5d2e2; color: #274665; text-decoration: none; }
        .waBtnDanger { background: #fff2f2; border-color: #f4c7c7; color: #9c2f2f; }
        .waError, .waNotice, .waEmpty {
          margin: 10px 14px;
          padding: 10px 12px;
          border-radius: 8px;
        }
        .waError { background: #ffe7e7; color: #8a1f1f; border: 1px solid #f1b0b0; }
        .waNotice { background: #ebfff1; color: #12663a; border: 1px solid #9fe0b8; }
        .waEmpty { background: #f5f7fb; color: #4f6480; border: 1px solid #e1e8f3; }
        @media (max-width: 900px) {
          .waRow {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

