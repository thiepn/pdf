import { useEffect, useState, type ChangeEvent } from "react";
import { clearDiagnosticErrors, listDiagnosticErrors } from "../diagnostics/errorRepository";
import { createSupportBundle, clearRuntimeCaches, unregisterServiceWorkers, type MaintenanceResult } from "../maintenance/maintenance";
import { applySafeModeState, disableSafeMode, enableSafeMode, isSafeMode } from "../maintenance/safeMode";
import { downloadBlob } from "../projects/download";
import { defaultSettings } from "../types/settings";
import { writeSettings } from "../settings/settingsStore";
import { repairHealthIssue, runStorageHealthCheck, type StorageHealthReport } from "../storage/health";

export function MaintenancePage() {
  const [safeMode, setSafeMode] = useState(() => isSafeMode());
  const [health, setHealth] = useState<StorageHealthReport | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MaintenanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeFilenames, setIncludeFilenames] = useState(false);
  const [diagnosticCount, setDiagnosticCount] = useState(0);

  useEffect(() => { applySafeModeState(); void listDiagnosticErrors().then((items) => setDiagnosticCount(items.length)); }, []);

  async function execute(action: () => Promise<MaintenanceResult>): Promise<void> {
    setRunning(true); setError(null);
    try { setResult(await action()); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setRunning(false); }
  }

  async function checkHealth(): Promise<void> {
    setRunning(true); setError(null);
    try { setHealth(await runStorageHealthCheck()); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setRunning(false); }
  }

  async function repairAll(): Promise<void> {
    if (!health) return;
    setRunning(true); setError(null);
    try {
      for (const issue of health.issues.filter((item) => item.repairable)) await repairHealthIssue(issue);
      setHealth(await runStorageHealthCheck());
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setRunning(false); }
  }

  async function exportBundle(): Promise<void> {
    setRunning(true); setError(null);
    try { downloadBlob(await createSupportBundle(includeFilenames), `pdf-studio-support-${Date.now()}.json`, { track: false }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setRunning(false); }
  }

  function toggleSafeMode(): void {
    if (safeMode) disableSafeMode(); else enableSafeMode();
    setSafeMode(!safeMode);
    window.location.hash = "#/maintenance";
    window.location.reload();
  }

  async function clearDiagnostics(): Promise<void> {
    await clearDiagnosticErrors(); setDiagnosticCount(0); setResult({ action: "clear-diagnostics", completedAt: new Date().toISOString(), detail: "Removed all local diagnostic records." });
  }

  function resetSettings(): void {
    if (!window.confirm("Reset interface, recovery, update, and privacy settings to defaults? Projects are not affected.")) return;
    try {
      writeSettings({ ...defaultSettings });
      setError(null);
      setResult({ action: "reset-settings", completedAt: new Date().toISOString(), detail: "Application settings were reset to defaults." });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return <div className="maintenance-page stack">
    <section className={safeMode ? "maintenance-hero maintenance-hero--safe" : "maintenance-hero"}><div><p className="eyebrow">Recovery and support</p><h2>{safeMode ? "Safe mode is active" : "Maintenance center"}</h2><p>Safe mode suppresses automatic project reopening and service-worker registration for this tab. Maintenance actions never modify PDF source bytes.</p></div><button className="button" onClick={toggleSafeMode} type="button">{safeMode ? "Exit safe mode" : "Enter safe mode and reload"}</button></section>
    {error ? <div className="error-banner"><strong>Maintenance action failed</strong><span>{error}</span></div> : null}
    {result ? <div className="success-banner"><strong>{result.action}</strong><span>{result.detail}</span></div> : null}
    <section className="maintenance-grid">
      <article><p className="eyebrow">Project integrity</p><h3>Health check</h3><p>Recalculate source checksums and inspect editor assets, OCR counters, interrupted jobs, and orphan records.</p><button className="button button--wide" disabled={running} onClick={() => void checkHealth()} type="button">Run health check</button>{health ? <><div className="health-summary"><span>{health.projectCount} projects</span><span>{health.issues.filter((item) => item.severity === "error").length} errors</span><span>{health.issues.filter((item) => item.severity === "warning").length} warnings</span></div><button className="button button--secondary button--wide" disabled={!health.issues.some((item) => item.repairable) || running} onClick={() => void repairAll()} type="button">Repair safe issues</button></> : null}</article>
      <article><p className="eyebrow">Offline shell</p><h3>Runtime cache</h3><p>Refresh the complete offline application shell without deleting pending shared files or installed OCR language packs. If the network refresh fails, the existing working shell is preserved.</p><button className="button button--wide" disabled={running} onClick={() => void execute(() => clearRuntimeCaches(true))} type="button">Refresh offline shell</button><button className="button button--secondary button--wide" disabled={running} onClick={() => void execute(unregisterServiceWorkers)} type="button">Unregister service workers</button></article>
      <article><p className="eyebrow">Support</p><h3>Export support bundle</h3><p>Exports release details, settings, project health, diagnostics, and receipt metadata. PDF bytes, passwords, OCR text, and editor content are excluded.</p><label className="toggle-setting"><span><strong>Include output filenames</strong><small>Leave disabled when sharing the report publicly.</small></span><input checked={includeFilenames} onChange={(event: ChangeEvent<HTMLInputElement>) => setIncludeFilenames(event.target.checked)} type="checkbox"/></label><button className="button button--wide" disabled={running} onClick={() => void exportBundle()} type="button">Export support bundle</button></article>
      <article><p className="eyebrow">Local preferences</p><h3>Reset non-document state</h3><p>{diagnosticCount} local diagnostic record(s) are currently stored. Resetting settings or diagnostics does not remove projects.</p><button className="button button--secondary button--wide" disabled={!diagnosticCount || running} onClick={() => void clearDiagnostics()} type="button">Clear diagnostics</button><button className="button button--ghost button--wide" disabled={running} onClick={resetSettings} type="button">Reset settings</button></article>
    </section>
    {health ? <section className="release-section"><header><div><p className="eyebrow">Health results</p><h2>{health.issues.length} result(s)</h2></div></header><div className="health-list">{health.issues.map((item) => <article className="health-item" key={item.id}><span className={`health-dot health-dot--${item.severity}`}/><div><strong>{item.projectName ?? item.code}</strong><p>{item.message}</p><small>{item.code}{item.repairable ? " · safely repairable" : ""}</small></div></article>)}</div></section> : null}
  </div>;
}
