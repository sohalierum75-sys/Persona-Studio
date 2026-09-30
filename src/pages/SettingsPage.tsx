import React, { useRef, useState } from "react";
import { Moon, Sun, Archive, Download, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import JSZip from "jszip";
import { useStudio } from "../store";
import { dbGetAll, localMutation, DB_STORES, type StoreName } from "../db";
import type { AppSettings, ContinuitySettings } from "../types";

export default function SettingsPage() {
  const { settings, saveSettings } = useStudio();

  function updateContinuity(update: Partial<ContinuitySettings>) {
    saveSettings({ ...settings, continuity: { ...settings.continuity, ...update } });
  }

  function updateApp(update: Partial<AppSettings>) {
    saveSettings({ ...settings, ...update });
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="section-header">
        <div>
          <h1>Settings</h1>
          <p style={{ marginTop: 4 }}>Customize how Persona Studio tracks continuity and looks.</p>
        </div>
      </div>

      {/* Appearance */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h2 style={{ marginBottom: 20 }}>Appearance</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Theme</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Choose light or dark mode</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  className={`btn btn-sm ${settings.theme === t ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => updateApp({ theme: t })}
                >
                  {t === "dark" ? <Moon size={14} /> : <Sun size={14} />}
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Reduce motion</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Disable animations and transitions</div>
            </div>
            <label style={{ position: "relative", display: "inline-block", width: 44, height: 24 }}>
              <input type="checkbox" checked={settings.reducedMotion}
                onChange={(e) => updateApp({ reducedMotion: e.target.checked })}
                style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{
                position: "absolute", inset: 0, borderRadius: 12,
                background: settings.reducedMotion ? "var(--accent)" : "var(--bg-elevated)",
                border: "1px solid var(--border)",
                cursor: "pointer", transition: "background 0.2s",
              }}>
                <span style={{
                  position: "absolute", width: 18, height: 18,
                  borderRadius: "50%", background: "white",
                  top: 2, left: settings.reducedMotion ? 22 : 2,
                  transition: "left 0.2s",
                }} />
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Continuity Settings */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h2 style={{ marginBottom: 4 }}>Continuity Rules</h2>
        <p className="text-sm text-muted" style={{ marginBottom: 20 }}>
          Control what triggers repeat warnings across episodes.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Lookback window */}
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Lookback window</div>
            <div style={{ display: "flex", gap: 8 }}>
              {([5, 10, -1] as const).map((w) => (
                <button
                  key={w}
                  className={`btn btn-sm ${settings.continuity.lookbackWindow === w ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => updateContinuity({ lookbackWindow: w })}
                >
                  {w === -1 ? "All episodes" : `Last ${w}`}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          {[
            {
              key: "avoidOutfitExactRepeat" as const,
              label: "Warn on exact outfit repeat",
              desc: "Alert when the same outfit from history is used again",
            },
            {
              key: "avoidOutfitColorRepeat" as const,
              label: "Warn on color family repeat",
              desc: "Alert when the same color family appears in consecutive episodes",
            },
            {
              key: "avoidLocationCategoryRepeat" as const,
              label: "Warn on location category repeat",
              desc: 'Alert at category level (e.g. "beach used recently")',
            },
            {
              key: "applyPerCharacter" as const,
              label: "Apply rules per character",
              desc: "Check history only for the same character (vs. workspace-wide)",
            },
          ].map(({ key, label, desc }) => (
            <div key={key} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{desc}</div>
              </div>
              <label style={{ position: "relative", display: "inline-block", width: 44, height: 24, flexShrink: 0 }}>
                <input type="checkbox" checked={settings.continuity[key]}
                  onChange={(e) => updateContinuity({ [key]: e.target.checked })}
                  style={{ opacity: 0, width: 0, height: 0 }} />
                <span style={{
                  position: "absolute", inset: 0, borderRadius: 12,
                  background: settings.continuity[key] ? "var(--accent)" : "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  cursor: "pointer", transition: "background 0.2s",
                }}>
                  <span style={{
                    position: "absolute", width: 18, height: 18,
                    borderRadius: "50%", background: "white",
                    top: 2, left: settings.continuity[key] ? 22 : 2,
                    transition: "left 0.2s",
                  }} />
                </span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Backup & Restore */}
      <BackupRestoreCard />

      {/* About */}
      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ marginBottom: 16 }}>About Persona Studio</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
          <div>Version 1.0.0 — MVP</div>
          <div>Data stored locally in your browser via IndexedDB</div>
          <div>Signed-in workspaces sync privately to your configured server</div>
          <div style={{ marginTop: 8, padding: 12, background: "var(--accent-dim)", borderRadius: 10, color: "var(--text-secondary)" }}>
            💡 The backup above exports everything — characters, scenes, prompts and all reference images (including scene references) — to a single ZIP you can restore later.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Backup & Restore — full-project ZIP export/import ────────────────────────
function BackupRestoreCard() {
  const loadAll = useStudio((s) => s.loadAll);
  const [busy, setBusy] = useState<null | "export" | "restore">(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setBusy("export");
    setStatus(null);
    try {
      const zip = new JSZip();
      const manifest: Record<string, number> = {};
      for (const store of DB_STORES) {
        const rows = await dbGetAll(store);
        manifest[store] = rows.length;
        zip.file(`${store}.json`, JSON.stringify(rows));
      }
      zip.file("manifest.json", JSON.stringify({
        app: "Persona Studio",
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        stores: manifest,
      }, null, 2));
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `persona-studio-backup-${ts}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      const total = Object.values(manifest).reduce((x, y) => x + y, 0);
      setStatus({ ok: true, msg: `Backup downloaded — ${total} records, including ${manifest.referenceAssets} stored images.` });
    } catch (err) {
      setStatus({ ok: false, msg: `Backup failed: ${err instanceof Error ? err.message : String(err)}` });
    }
    setBusy(null);
  }

  async function handleRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("restore");
    setStatus(null);
    try {
      const imported: Partial<Record<StoreName, any[]>> = {};
      let exportedAt = "unknown date";
      if (file.name.endsWith(".json")) {
        const backup = JSON.parse(await file.text());
        if (backup.app !== "persona-studio" || !backup.stores) throw new Error("Invalid local backup");
        exportedAt = backup.savedAt ?? backup.exportedAt;
        Object.assign(imported, backup.stores);
      } else {
        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        const manifestFile = zip.file("manifest.json");
        if (!manifestFile) throw new Error("Not a Persona Studio backup");
        exportedAt = JSON.parse(await manifestFile.async("string")).exportedAt;
        for (const store of DB_STORES) {
          const entry = zip.file(`${store}.json`);
          if (entry) imported[store] = JSON.parse(await entry.async("string"));
        }
      }
      for (const store of DB_STORES) {
        const rows = imported[store];
        if (rows && (!Array.isArray(rows) || rows.some(row => !row || typeof row.id !== "string"))) throw new Error(`Invalid ${store} data`);
      }
      const total = Object.values(imported).reduce((n,rows) => n + (rows?.length ?? 0), 0);
      const manifest = {exportedAt};
      if (!confirm(`Restore ${total} records from ${exportedAt}? This replaces this workspace and syncs the changes to the signed-in account.`)) {setBusy(null);return;}
      for (const store of DB_STORES) {
        const rows = imported[store] ?? [];
        const ids = new Set(rows.map(row => row.id));
        for (const row of await dbGetAll<{id:string}>(store)) if (!ids.has(row.id)) await localMutation(store,"delete",row.id);
        for (const row of rows) await localMutation(store,"put",row);
      }
      await loadAll();
      setStatus({ ok: true, msg: `Restored backup from ${manifest.exportedAt ?? "unknown date"} — ${total} records.` });
    } catch (err) {
      setStatus({ ok: false, msg: `Restore failed: ${err instanceof Error ? err.message : String(err)}` });
    }
    setBusy(null);
  }

  return (
    <div className="card" style={{ padding: 24, marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Archive size={18} style={{ color: "var(--accent)" }} />
        <h2 style={{ margin: 0 }}>Backup &amp; Restore</h2>
      </div>
      <p className="text-sm text-muted" style={{ marginBottom: 20 }}>
        Export the entire workspace — every character, episode, scene, saved prompt and reference
        image (character, wardrobe, location and scene references) — into one ZIP file, and restore
        it back into this or another browser.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={handleExport} disabled={busy !== null}>
          <Download size={14} /> {busy === "export" ? "Exporting…" : "Export ZIP"}
        </button>
        <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          <Upload size={14} /> {busy === "restore" ? "Restoring…" : "Restore backup"}
        </button>
        <input ref={fileRef} type="file" accept=".zip,.json,application/zip,application/json" style={{ display: "none" }}
          onChange={handleRestoreFile} aria-label="Restore from backup ZIP" />
      </div>
      {status && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, padding: "10px 12px",
          borderRadius: "var(--radius-sm)", fontSize: 13,
          background: status.ok ? "var(--success-bg)" : "var(--error-bg)",
          border: `1px solid ${status.ok ? "rgba(82,217,160,0.3)" : "rgba(255,90,90,0.25)"}`,
          color: status.ok ? "var(--success)" : "var(--error)" }}>
          {status.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {status.msg}
        </div>
      )}
    </div>
  );
}
