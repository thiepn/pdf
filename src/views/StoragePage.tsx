import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { formatBytes } from "../components/ProjectCard";
import { listProjects } from "../projects/projectRepository";
import { calculateOpfsProjectBytes } from "../storage/projectFiles";
import { repairHealthIssue, runStorageHealthCheck, type StorageHealthReport } from "../storage/health";

interface StorageMetrics { usage: number; quota: number; opfsProjects: number; projectCount: number; persistent: boolean }

export function StoragePage() {
  const [metrics, setMetrics] = useState<StorageMetrics | null>(null);
  const [health, setHealth] = useState<StorageHealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [repairing, setRepairing] = useState<string | null>(null);

  useEffect(() => { void refresh(); }, []);
  async function refresh(): Promise<void> {
    try {
      const [estimate, projects, opfsProjects, persistent] = await Promise.all([
        navigator.storage?.estimate?.() ?? Promise.resolve({ usage: 0, quota: 0 }),
        listProjects(),
        calculateOpfsProjectBytes(),
        navigator.storage?.persisted?.() ?? Promise.resolve(false)
      ]);
      setMetrics({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0, opfsProjects, projectCount: projects.length, persistent });
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  async function requestPersistence(): Promise<void> { if (!navigator.storage?.persist) return; setRequesting(true); try { await navigator.storage.persist(); await refresh(); } finally { setRequesting(false); } }
  async function checkHealth(): Promise<void> { setChecking(true); setError(null); try { setHealth(await runStorageHealthCheck()); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setChecking(false); } }
  async function repair(id: string): Promise<void> { const item = health?.issues.find((entry) => entry.id === id); if (!item) return; setRepairing(id); try { await repairHealthIssue(item); await checkHealth(); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setRepairing(null); } }

  const percentage = metrics?.quota ? Math.min(100, (metrics.usage / metrics.quota) * 100) : 0;
  return <div className="stack">
    {error ? <div className="error-banner"><strong>Storage operation failed</strong><span>{error}</span></div> : null}
    <section className="storage-overview"><div><p className="eyebrow">Browser-local storage</p><h2>{metrics ? formatBytes(metrics.usage) : "—"} used</h2><p>Source PDFs, recovery state, editor assets, and OCR results remain within this browser origin.</p></div><div className="storage-ring" style={{ "--storage-progress": `${percentage * 3.6}deg` } as CSSProperties}><strong>{percentage.toFixed(1)}%</strong><span>of browser quota</span></div></section>
    <section className="storage-metrics"><article><span>Projects</span><strong>{metrics?.projectCount ?? "—"}</strong><p>Saved local projects</p></article><article><span>PDF source data</span><strong>{metrics ? formatBytes(metrics.opfsProjects) : "—"}</strong><p>Local PDF source files</p></article><article><span>Storage limit</span><strong>{metrics ? formatBytes(metrics.quota) : "—"}</strong><p>Estimated by this browser</p></article><article><span>Browser cleanup protection</span><strong>{metrics?.persistent ? "Protected" : "Not protected"}</strong><p>Reduces automatic removal of local project data</p></article></section>
    <section className="settings-section"><div><p className="eyebrow">Browser cleanup protection</p><h2>Prevent automatic browser cleanup</h2><p>Ask the browser to keep this app’s local project data when it needs space. Clearing site data yourself can still delete projects, so keep backups of important work.</p></div><button className="button" disabled={requesting || metrics?.persistent || !navigator.storage?.persist} onClick={() => void requestPersistence()} type="button">{metrics?.persistent ? "Browser cleanup prevented" : "Prevent browser cleanup"}</button></section>
    <section className="release-section"><header><div><p className="eyebrow">Troubleshooting</p><h2>Check local project health</h2><p>Checks whether saved projects and their related local data are complete and internally consistent.</p></div><button className="button" disabled={checking} onClick={() => void checkHealth()} type="button">{checking ? "Checking…" : "Run health check"}</button></header>
      {health ? <><div className="health-summary"><span>{health.projectCount} projects</span><span>{formatBytes(health.checkedBytes)} verified</span><span>{health.issues.filter((item) => item.severity === "error").length} errors</span><span>{health.issues.filter((item) => item.severity === "warning").length} warnings</span></div><div className="health-list">{health.issues.map((item) => <article className={`health-item health-item--${item.severity}`} key={item.id}><span className={`health-dot health-dot--${item.severity}`} /><div><strong>{item.projectName ? `${item.projectName}: ` : ""}{item.message}</strong><small>{item.code}</small></div>{item.repairable ? <button className="button button--secondary button--small" disabled={repairing === item.id} onClick={() => void repair(item.id)} type="button">{repairing === item.id ? "Repairing…" : "Repair"}</button> : null}</article>)}</div></> : <div className="empty-state"><strong>No health check run yet</strong><p>The check reads local project data on this device. Nothing is uploaded or changed.</p></div>}
    </section>
    <section className="warning-panel"><strong>Browser data is not a permanent archive.</strong><p>Export a version 9 <code>.lpsproject</code> backup before clearing browser data, switching profiles, or reinstalling the browser.</p></section>
  </div>;
}
