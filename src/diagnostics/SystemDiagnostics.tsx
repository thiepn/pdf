import { useEffect, useMemo, useState } from "react";
import { clearDiagnosticErrors, diagnosticReportBlob, listDiagnosticErrors, type DiagnosticErrorRecord } from "./errorRepository";
import { getReleaseInformation } from "../core/release";
import { downloadBlob } from "../projects/download";
import { collectRuntimeHealth, type RuntimeHealthSnapshot } from "../runtime/runtimeHealth";

interface Capability { name: string; supported: boolean; detail: string }

function capabilities(): Capability[] {
  return [
    { name: "WebAssembly", supported: typeof WebAssembly !== "undefined", detail: "Required for local PDF and OCR processing." },
    { name: "Web Workers", supported: typeof Worker !== "undefined", detail: "Keeps intensive document processing away from the interface." },
    { name: "IndexedDB", supported: typeof indexedDB !== "undefined", detail: "Structured project and recovery storage." },
    { name: "OPFS", supported: Boolean(navigator.storage?.getDirectory), detail: "Preferred storage for large source files." },
    { name: "Service Worker", supported: "serviceWorker" in navigator, detail: "Offline shell and controlled updates." },
    { name: "File System Access", supported: "showOpenFilePicker" in window, detail: "Optional direct file access; downloads remain the fallback." },
    { name: "Camera", supported: Boolean(navigator.mediaDevices?.getUserMedia), detail: "Optional scan capture." },
    { name: "Storage persistence", supported: Boolean(navigator.storage?.persist), detail: "Reduces the chance that the browser automatically clears local projects." },
    { name: "Web Locks", supported: Boolean(navigator.locks?.request), detail: "Helps prevent two browser contexts from changing the same document at once." }
  ];
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = value; let index = 0;
  while (current >= 1000 && index < units.length - 1) { current /= 1000; index += 1; }
  return `${current.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function SystemDiagnostics() {
  const [records, setRecords] = useState<DiagnosticErrorRecord[]>([]);
  const [runtime, setRuntime] = useState<RuntimeHealthSnapshot | null>(null);
  const release = getReleaseInformation();
  const detected = useMemo(capabilities, []);
  useEffect(() => { void refresh(); }, []);
  async function refresh() { const [nextRecords, nextRuntime] = await Promise.all([listDiagnosticErrors(), collectRuntimeHealth()]); setRecords(nextRecords); setRuntime(nextRuntime); }
  async function clear() { await clearDiagnosticErrors(); await refresh(); }
  function exportReport() { downloadBlob(diagnosticReportBlob(records), `pdf-studio-diagnostics-${Date.now()}.json`); }

  return <div className="stack">
    <section className="system-summary">
      <div><p className="eyebrow">App status</p><h2>{release.name} {release.version}</h2><p>{navigator.onLine ? "Online" : "Offline"} · {records.length ? `${records.length} local error record${records.length === 1 ? "" : "s"}` : "No recorded errors"}</p></div>
      <div><span>Stored error records</span><strong>{records.length}</strong><span>Browser</span><strong>{navigator.userAgent.includes("Firefox") ? "Firefox" : navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome") ? "Safari" : "Chromium-compatible"}</strong></div>
    </section>
    <details className="card"><summary>Technical browser details</summary><p>Browser APIs, device signals, storage limits, and desktop-bridge information used for deeper troubleshooting.</p><section className="capability-grid">{detected.map((item) => <article key={item.name}><span className={item.supported ? "health-dot health-dot--pass" : "health-dot health-dot--warning"} /><div><strong>{item.name}</strong><p>{item.detail}</p></div><b>{item.supported ? "Available" : "Fallback"}</b></article>)}</section>
    {runtime ? <section className="runtime-health-grid"><article><span>Logical processors</span><strong>{runtime.logicalProcessors}</strong><small>Used to bound concurrent page rendering.</small></article><article><span>Device memory signal</span><strong>{runtime.deviceMemoryGb ? `${runtime.deviceMemoryGb} GB` : "Not exposed"}</strong><small>Adaptive rendering degrades safely when memory is constrained.</small></article><article><span>Local storage</span><strong>{runtime.storage ? `${formatBytes(runtime.storage.usage)} / ${formatBytes(runtime.storage.quota)}` : "Unavailable"}</strong><small>{runtime.storage ? `${runtime.storage.percent.toFixed(1)}% used · ${runtime.storage.persisted ? "persistent" : "best effort"}` : "Storage estimate API is unavailable."}</small></article><article><span>Write safety reserve</span><strong>{runtime.storage ? formatBytes(Math.max(25_000_000, runtime.storage.quota * 0.05)) : "Unavailable"}</strong><small>Local revision writes are blocked when they would consume this safety reserve.</small></article><article><span>Desktop companion</span><strong>{runtime.desktop ? `${runtime.desktop.host} ${runtime.desktop.hostVersion}` : "Browser mode"}</strong><small>{runtime.desktop ? `${runtime.desktop.platform} · bridge v${runtime.desktop.bridgeVersion}` : "No native bridge is attached; browser fallbacks remain active."}</small></article></section> : null}</details>
    <section className="release-section"><header><div><p className="eyebrow">Local error log</p><h2>Recent application errors</h2></div><div className="button-row"><button className="button button--secondary button--small" disabled={!records.length} onClick={exportReport} type="button">Export report</button><button className="button button--danger-ghost button--small" disabled={!records.length} onClick={() => void clear()} type="button">Clear records</button></div></header>
      {records.length ? <div className="error-records">{records.map((record) => <details key={record.id}><summary><span>{new Date(record.timestamp).toLocaleString()}</span><strong>{record.context.area}: {record.message}</strong></summary><pre>{record.stack ?? record.message}</pre><small>Diagnostic ID: {record.id} · No PDF bytes or passwords are stored with this record.</small></details>)}</div> : <div className="empty-state"><strong>No recorded application errors</strong><p>If PDF Studio encounters a recoverable technical failure, its local diagnostic record will appear here.</p></div>}
    </section>
  </div>;
}
