import { useMemo, useState } from "react";
import { Panel } from "../../components/Panel";
import { DiagnosticList } from "../../components/DiagnosticList";
import { downloadDiagnosticReport } from "../../diagnostics/downloadReport";
import type { DiagnosticCheck } from "../../lab/types";

function capability(name: string, available: boolean, detail: string): DiagnosticCheck {
  return {
    id: name,
    label: name,
    status: available ? "passed" : "warning",
    detail
  };
}

async function timeCheck(
  id: string,
  label: string,
  task: () => Promise<string>
): Promise<DiagnosticCheck> {
  const start = performance.now();
  try {
    const detail = await task();
    return { id, label, status: "passed", detail, durationMs: performance.now() - start };
  } catch (error) {
    return {
      id,
      label,
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
      durationMs: performance.now() - start
    };
  }
}

export function DeploymentLab() {
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [running, setRunning] = useState(false);

  const staticChecks = useMemo<DiagnosticCheck[]>(
    () => [
      capability("WebAssembly", typeof WebAssembly !== "undefined", "Required for MuPDF and OCR engines."),
      capability("Dedicated Worker", typeof Worker !== "undefined", "Required to isolate parsing and processing."),
      capability("IndexedDB", "indexedDB" in window, "Structured project metadata fallback."),
      capability("OPFS", "storage" in navigator && "getDirectory" in navigator.storage, "Preferred large local-file workspace."),
      capability("Service Worker", "serviceWorker" in navigator, "Offline application shell and cached engines."),
      capability("OffscreenCanvas", typeof OffscreenCanvas !== "undefined", "Optional worker-side rendering acceleration."),
      capability("File System Access", "showOpenFilePicker" in window, "Optional direct file-open/save integration."),
      capability("Storage persistence", "storage" in navigator && "persist" in navigator.storage, "Reduces browser eviction risk."),
      capability("Secure context", window.isSecureContext, "Required by several storage and PWA capabilities.")
    ],
    []
  );

  async function run(): Promise<void> {
    setRunning(true);
    setChecks(staticChecks.map((check) => ({ ...check, status: "running" })));

    const results = [...staticChecks];

    results.push(
      await timeCheck("generic-worker", "Generic worker handshake", async () => {
        const worker = new Worker(new URL("../../workers/echo.worker.ts", import.meta.url), { type: "module" });
        const response = await new Promise<string>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error("Worker handshake timed out.")), 5000);
          worker.onmessage = (event: MessageEvent<{ type: string; value: string }>) => {
            window.clearTimeout(timeout);
            resolve(`${event.data.type}: ${event.data.value}`);
          };
          worker.onerror = (event) => reject(new Error(event.message));
          worker.postMessage({ type: "PING", value: "phase-0" });
        });
        worker.terminate();
        return response;
      })
    );

    results.push(
      await timeCheck("dynamic-import", "Dynamic module import", async () => {
        const module = await import("../../validation/pdfValidator");
        return typeof module.validatePdfBytes === "function"
          ? "Validator module imported from a split chunk."
          : "Module loaded but expected export was absent.";
      })
    );

    results.push(
      await timeCheck("service-worker", "Service worker registration state", async () => {
        if (!("serviceWorker" in navigator)) throw new Error("Service workers are unavailable.");
        const registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Service worker did not become ready within 5 seconds.")), 5000))
        ]);
        return `Active scope: ${registration.scope}`;
      })
    );

    results.push(
      await timeCheck("cache-write", "Cache API write/read", async () => {
        if (!("caches" in window)) throw new Error("Cache API is unavailable.");
        const cache = await caches.open("local-pdf-studio-phase0-diagnostic");
        const request = new Request(new URL("diagnostic-probe.txt", document.baseURI));
        await cache.put(request, new Response("phase-0-cache-ok"));
        const value = await (await cache.match(request))?.text();
        await cache.delete(request);
        if (value !== "phase-0-cache-ok") throw new Error("Cached value did not round-trip.");
        return "Cache write, read and cleanup succeeded.";
      })
    );

    setChecks(results);
    setRunning(false);
  }

  return (
    <div className="stack">
      <Panel
        title="Static-hosting readiness"
        eyebrow="P0-01"
        actions={
          <div className="button-row">
            <button className="button button--secondary" disabled={checks.length === 0} onClick={() => downloadDiagnosticReport(checks, "p0-01-deployment-report.json")} type="button">
              Export report
            </button>
            <button className="button" disabled={running} onClick={() => void run()} type="button">
              {running ? "Running…" : "Run all checks"}
            </button>
          </div>
        }
      >
        <p className="panel-intro">
          Confirms that the browser can load a static application, create module workers, use local storage APIs and keep an offline service worker within the deployed base path.
        </p>
        <DiagnosticList checks={checks.length ? checks : staticChecks} />
      </Panel>

      <Panel title="Deployment invariants" eyebrow="Pass conditions">
        <ul className="feature-list">
          <li>All asset and worker URLs are derived from the Vite base URL.</li>
          <li>Application navigation uses hash routes, avoiding GitHub Pages deep-route 404 errors.</li>
          <li>Worker startup, dynamic imports and WebAssembly packages can be tested independently.</li>
          <li>Missing optional browser APIs produce fallbacks rather than blocking the entire application.</li>
        </ul>
      </Panel>
    </div>
  );
}
