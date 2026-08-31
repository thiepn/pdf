import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearRuntimePerformanceMetrics,
  runtimePerformanceSnapshot,
  runtimePerformanceSummary,
  type RuntimeMetric,
  type RuntimePerformanceSummary
} from "../performance/runtimeMetrics";

function formatMs(value: number): string {
  if (value < 1) return `${value.toFixed(2)} ms`;
  if (value < 100) return `${value.toFixed(1)} ms`;
  return `${Math.round(value)} ms`;
}

function metricRows(summary: RuntimePerformanceSummary) {
  return [
    ["Long interface tasks", summary.longTasks],
    ["Interactions", summary.interactions],
    ["Navigation", summary.navigation],
    ["PDF work", summary.pdf],
    ["Local storage", summary.storage],
    ["Background processing", summary.worker],
    ["Page and text rendering", summary.render],
    ["Other measured work", summary.custom]
  ] as const;
}

export function PerformanceDiagnostics() {
  const [metrics, setMetrics] = useState<RuntimeMetric[]>(() => runtimePerformanceSnapshot());
  const [summary, setSummary] = useState<RuntimePerformanceSummary>(() => runtimePerformanceSummary());

  const refresh = useCallback(() => {
    setMetrics(runtimePerformanceSnapshot());
    setSummary(runtimePerformanceSummary());
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 1_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const slowest = useMemo(() => metrics.slice().sort((left, right) => right.durationMs - left.durationMs).slice(0, 50), [metrics]);

  return <div className="stack performance-diagnostics">
    <section className="card">
      <p className="eyebrow">Local measurements</p>
      <h2>Performance</h2>
      <p>Performance measurements stay in this browser tab. PDF Studio does not upload them, filenames, document text, or your input.</p>
      <div className="button-row">
        <button className="button button--secondary" onClick={refresh} type="button">Refresh</button>
        <button className="button button--ghost" onClick={() => { clearRuntimePerformanceMetrics(); refresh(); }} type="button">Clear measurements</button>
      </div>
    </section>

    <details className="card"><summary>Technical performance measurements</summary><section>
      <h3>Current session summary</h3>
      <p>{summary.total} measurements kept temporarily for this tab.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Area</th><th>Count</th><th>P95</th><th>Slowest</th><th>Total</th></tr></thead>
          <tbody>{metricRows(summary).map(([label, bucket]) => <tr key={label}><td>{label}</td><td>{bucket.count}</td><td>{formatMs(bucket.p95Ms)}</td><td>{formatMs(bucket.maxMs)}</td><td>{formatMs(bucket.totalMs)}</td></tr>)}</tbody>
        </table>
      </div>
    </section>

    <section className="card">
      <h3>Slowest measured work</h3>
      {!slowest.length ? <p className="muted">No runtime measurements yet. Open a PDF, switch tools, search, or edit a document, then return here.</p> : <div className="table-wrap">
        <table>
          <thead><tr><th>Category</th><th>Operation</th><th>Duration</th><th>Details</th></tr></thead>
          <tbody>{slowest.map((metric) => <tr key={metric.id}><td>{metric.category}</td><td>{metric.name}</td><td>{formatMs(metric.durationMs)}</td><td>{metric.detail ? Object.entries(metric.detail).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}: ${String(value)}`).join(" · ") : "—"}</td></tr>)}</tbody>
        </table>
      </div>}
    </section></details>
  </div>;
}
