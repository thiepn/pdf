import { useState } from "react";
import { Panel } from "../../components/Panel";
import { DiagnosticList } from "../../components/DiagnosticList";
import { downloadDiagnosticReport } from "../../diagnostics/downloadReport";
import type { DiagnosticCheck } from "../../lab/types";
import { indexedDbRoundTrip } from "../../storage/indexedDb";
import { opfsRoundTrip } from "../../storage/opfs";

async function runCheck(id: string, label: string, task: () => Promise<string>): Promise<DiagnosticCheck> {
  const started = performance.now();
  try {
    return {
      id,
      label,
      status: "passed",
      detail: await task(),
      durationMs: performance.now() - started
    };
  } catch (error) {
    return {
      id,
      label,
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
      durationMs: performance.now() - started
    };
  }
}

export function StorageLab() {
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [running, setRunning] = useState(false);

  async function run(): Promise<void> {
    setRunning(true);
    const marker = `phase-0-${crypto.randomUUID()}`;
    const results: DiagnosticCheck[] = [];

    results.push(
      await runCheck("indexeddb", "IndexedDB structured round-trip", async () => {
        const result = await indexedDbRoundTrip(marker);
        if (result !== marker) throw new Error("IndexedDB returned different data.");
        return "Record write, read and deletion succeeded.";
      })
    );

    results.push(
      await runCheck("opfs", "OPFS binary round-trip", async () => {
        const source = crypto.getRandomValues(new Uint8Array(1024 * 1024));
        const result = await opfsRoundTrip(source);
        if (source.byteLength !== result.byteLength) throw new Error("OPFS byte length changed.");
        for (let index = 0; index < source.length; index += 4096) {
          if (source[index] !== result[index]) throw new Error(`OPFS data mismatch at byte ${index}.`);
        }
        return `1 MiB binary write, read and cleanup succeeded.`;
      })
    );

    results.push(
      await runCheck("quota", "Storage quota estimate", async () => {
        if (!("storage" in navigator) || !("estimate" in navigator.storage)) {
          throw new Error("Storage estimation is unavailable.");
        }
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage ?? 0;
        const quota = estimate.quota ?? 0;
        return `Usage ${formatBytes(usage)} of approximately ${formatBytes(quota)}.`;
      })
    );

    results.push(
      await runCheck("persistence", "Persistent-storage request", async () => {
        if (!("storage" in navigator) || !("persist" in navigator.storage)) {
          throw new Error("Storage persistence is unavailable.");
        }
        const granted = await navigator.storage.persist();
        return granted
          ? "Persistent storage was granted or was already active."
          : "Browser declined persistence; project export and recovery warnings remain required.";
      })
    );

    setChecks(results);
    setRunning(false);
  }

  return (
    <div className="stack">
      <Panel
        title="Local storage and recovery primitives"
        eyebrow="P0-12"
        actions={
          <div className="button-row">
            <button className="button button--secondary" disabled={checks.length === 0} onClick={() => downloadDiagnosticReport(checks, "p0-12-storage-report.json")} type="button">Export report</button>
            <button className="button" disabled={running} onClick={() => void run()} type="button">{running ? "Testing…" : "Run storage tests"}</button>
          </div>
        }
      >
        <p className="panel-intro">
          Validates the intended split: large binary working files in OPFS, structured manifests in IndexedDB, and explicit handling of quota and persistence limits.
        </p>
        <DiagnosticList checks={checks} />
      </Panel>

      <Panel title="Atomic project-save rule" eyebrow="Recovery invariant">
        <ol className="numbered-list">
          <li>Write a new temporary snapshot.</li>
          <li>Close and reopen the temporary file.</li>
          <li>Run PDF validation.</li>
          <li>Update the project manifest to point at the valid snapshot.</li>
          <li>Retain the previous checkpoint until the update completes.</li>
          <li>Clean abandoned temporary files on the next project open.</li>
        </ol>
      </Panel>
    </div>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let current = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && current >= 1024; index += 1) {
    current /= 1024;
    unit = units[index];
  }
  return `${current.toFixed(1)} ${unit}`;
}
