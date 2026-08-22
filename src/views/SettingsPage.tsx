import { useState } from "react";
import { readSettings, writeSettings } from "../settings/settingsStore";
import type { AppSettings } from "../types/settings";
import { PwaReadinessCard } from "../components/PwaReadinessCard";

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(() => readSettings());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    const next = { ...settings, [key]: value };
    try {
      writeSettings(next);
      setSettings(next);
      setError(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return <div className="settings-grid">
    {error ? <div className="error-banner"><strong>Settings not changed</strong><span>{error}</span></div> : null}
    <section className="settings-section"><div><p className="eyebrow">Appearance</p><h2>Interface</h2></div>
      <label><span><strong>Theme</strong><small>Use the system theme or force a light or dark workspace.</small></span><select onChange={(event: { target: HTMLSelectElement }) => update("theme", event.target.value as AppSettings["theme"])} value={settings.theme}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label><span><strong>Density</strong><small>Compact mode reduces spacing without hiding controls.</small></span><select onChange={(event: { target: HTMLSelectElement }) => update("density", event.target.value as AppSettings["density"])} value={settings.density}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
      <label><span><strong>Motion</strong><small>Reduce non-essential interface animation and smooth scrolling.</small></span><select onChange={(event: { target: HTMLSelectElement }) => update("motion", event.target.value as AppSettings["motion"])} value={settings.motion}><option value="system">Follow system</option><option value="reduced">Reduce motion</option></select></label>
    </section>
    <section className="settings-section"><div><p className="eyebrow">Viewer</p><h2>Document defaults</h2></div>
      <label><span><strong>Default view</strong><small>Used for projects without saved viewer state.</small></span><select onChange={(event: { target: HTMLSelectElement }) => update("defaultViewMode", event.target.value as AppSettings["defaultViewMode"])} value={settings.defaultViewMode}><option value="continuous">Continuous</option><option value="single">Single page</option></select></label>
      <label><span><strong>Default zoom</strong><small>Initial rendering scale for new projects.</small></span><select onChange={(event: { target: HTMLSelectElement }) => update("defaultZoom", Number(event.target.value))} value={settings.defaultZoom}><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option></select></label>
      <label><span><strong>Rendering profile</strong><small>Adaptive mode uses document size and local device signals to bound canvas quality and concurrent rendering.</small></span><select onChange={(event: { target: HTMLSelectElement }) => update("renderingQuality", event.target.value as AppSettings["renderingQuality"])} value={settings.renderingQuality}><option value="adaptive">Adaptive (recommended)</option><option value="balanced">Balanced</option><option value="high">High quality</option><option value="low-memory">Low memory</option></select></label>
    </section>
    <section className="settings-section"><div><p className="eyebrow">Recovery</p><h2>Local behavior</h2></div>
      <label className="toggle-setting"><span><strong>Reopen last project</strong><small>Return to the most recently opened local project in a new browser session.</small></span><input checked={settings.reopenLastProject} onChange={(event: { target: HTMLInputElement }) => update("reopenLastProject", event.target.checked)} type="checkbox" /></label>
      <label className="toggle-setting"><span><strong>Confirm destructive actions</strong><small>Require confirmation before deleting local projects and irreversible workspace data.</small></span><input checked={settings.confirmDestructive} onChange={(event: { target: HTMLInputElement }) => update("confirmDestructive", event.target.checked)} type="checkbox" /></label>
      <label className="toggle-setting"><span><strong>Show “What changes?” details</strong><small>Offer an optional panel explaining what an operation preserves, rebuilds, or may remove.</small></span><input checked={settings.showPreservationWarnings} onChange={(event: { target: HTMLInputElement }) => update("showPreservationWarnings", event.target.checked)} type="checkbox" /></label>
    </section>
    <section className="settings-section"><div><p className="eyebrow">Updates and local records</p><h2>Application behavior</h2></div>
      <label><span><strong>Application updates</strong><small>Prompt before reloading, or activate a ready service-worker update automatically.</small></span><select onChange={(event: { target: HTMLSelectElement }) => update("updateMode", event.target.value as AppSettings["updateMode"])} value={settings.updateMode}><option value="prompt">Ask before updating</option><option value="automatic">Update automatically</option></select></label>
      <label className="toggle-setting"><span><strong>Local diagnostic log</strong><small>Keep up to 50 technical errors locally. Document text, passwords, and PDF bytes are never included.</small></span><input checked={settings.diagnosticLogging} onChange={(event: { target: HTMLInputElement }) => update("diagnosticLogging", event.target.checked)} type="checkbox" /></label>
      <label className="toggle-setting"><span><strong>Keep download history</strong><small>Store local filename, size, and time for outputs. A technical checksum is also kept for verification; document contents are not retained.</small></span><input checked={settings.recordActivity} onChange={(event: { target: HTMLInputElement }) => update("recordActivity", event.target.checked)} type="checkbox" /></label>
    </section>
    <PwaReadinessCard />
    {saved ? <div className="save-toast">Settings saved locally</div> : null}
  </div>;
}
