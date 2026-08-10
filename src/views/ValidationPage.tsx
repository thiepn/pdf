import { useRef, useState } from "react";
import { DiagnosticList } from "../components/DiagnosticList";
import { StatusBadge } from "../components/StatusBadge";
import { runReleaseValidation, type ReleaseValidationProgress, type ReleaseValidationReport } from "../release/releaseValidation";
import { downloadBlob } from "../projects/download";

export function ValidationPage() {
  const [report, setReport] = useState<ReleaseValidationReport | null>(null);
  const [progress, setProgress] = useState<ReleaseValidationProgress | null>(null);
  const [running, setRunning] = useState(false);
  const runId = useRef(0);

  async function run(): Promise<void> {
    const currentRun = ++runId.current;
    setRunning(true); setReport(null); setProgress({ completed: 0, total: 1, current: "Starting" });
    try {
      const next = await runReleaseValidation((value) => { if (runId.current === currentRun) setProgress(value); });
      if (runId.current === currentRun) setReport(next);
    } finally { if (runId.current === currentRun) setRunning(false); }
  }

  function download(): void {
    if (!report) return;
    downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), `pdf-studio-${report.release.version}-validation.json`);
  }

  return <div className="validation-page stack">
    <section className="release-hero validation-hero">
      <div><p className="eyebrow">Release verification</p><h2>Run the local production self-test</h2><p>This test exercises the deployed browser environment, both PDF engines, workers, coordinates, storage, backup integrity, the Cache API, and the offline service-worker foundation without uploading a document.</p></div>
      <div className="validation-summary"><span>Result</span>{report ? <StatusBadge status={report.status} /> : <strong>Not run</strong>}<span>Checks</span><strong>{report?.checks.length ?? "—"}</strong></div>
    </section>

    <section className="release-section">
      <header><div><p className="eyebrow">Automated gate</p><h2>{running ? progress?.current ?? "Running" : report ? "Validation complete" : "Ready"}</h2><p>Warnings identify optional APIs or conditions requiring review. Any failed check blocks a stable-release claim for this browser.</p></div><div className="button-row"><button className="button button--secondary" disabled={!report || running} onClick={download} type="button">Export report</button><button className="button" disabled={running} onClick={() => void run()} type="button">{running ? "Running…" : report ? "Run again" : "Run validation"}</button></div></header>
      {running && progress ? <div className="validation-progress"><progress max={progress.total} value={progress.completed}/><span>{progress.completed} / {progress.total}</span></div> : null}
      {report ? <DiagnosticList checks={report.checks} /> : <div className="empty-state"><strong>No validation report yet</strong><p>Run this after deploying the app and after every engine, worker, storage, service-worker, or dependency update.</p></div>}
    </section>

    {report?.externalResources.length ? <section className="release-section"><header><div><p className="eyebrow">Privacy review</p><h2>Observed external resources</h2></div></header><ul className="resource-list">{report.externalResources.map((url) => <li key={url}><code>{url}</code></li>)}</ul></section> : null}

    <section className="release-grid">
      <article><p className="eyebrow">Passing scope</p><h3>Runtime foundation</h3><p>A pass proves the current browser can execute the application’s core local foundation. It does not prove every third-party PDF corpus or external viewer.</p></article>
      <article><p className="eyebrow">Still manual</p><h3>Compatibility corpus</h3><p>Adobe Reader, PDF24, mobile readers, print output, large files, malformed files, signatures, and adversarial redaction remain separate release gates.</p></article>
    </section>
  </div>;
}
