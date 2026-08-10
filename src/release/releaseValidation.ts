import { createMinimalPdf } from "../fixtures/minimalPdf";
import { CoordinateService, createPdfViewportMatrix } from "../core/coordinates";
import { extractPageText, openPdfWithPdfJs } from "../engines/pdfjs";
import { indexedDbRoundTrip } from "../storage/indexedDb";
import { opfsRoundTrip } from "../storage/opfs";
import { decodeProjectPackage, encodeProjectPackage, verifyProjectPackageIntegrity } from "../projects/projectPackage";
import { APP_VERSION, BUILD_BASE_PATH, getReleaseInformation, PROJECT_PACKAGE_VERSION } from "../core/release";
import { assessDeployment, normalizeBasePath } from "./deployment";
import { deriveViewerPerformancePolicy } from "../viewer/performancePolicy";
import { defaultSettings } from "../types/settings";
import type { DiagnosticCheck } from "../lab/types";
import { listExternalResourceUrls, summarizeReleaseValidation, type ReleaseValidationStatus } from "./releaseValidationModel";
import type { ProjectManifest } from "../types/project";
import { idbDelete, idbGet, idbPut } from "../storage/database";
import type { ActivityReceipt } from "../activity/activityModel";
import { checkStorageBudget } from "../storage/budget";
import { getServiceWorkerOfflineStatus } from "./serviceWorkerManager";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";

export interface ReleaseValidationReport {
  schemaVersion: 1;
  generatedAt: string;
  release: ReturnType<typeof getReleaseInformation>;
  status: ReleaseValidationStatus;
  userAgent: string;
  location: string;
  checks: DiagnosticCheck[];
  externalResources: string[];
}

export interface ReleaseValidationProgress {
  completed: number;
  total: number;
  current: string;
}

function staticCheck(id: string, label: string, supported: boolean, required: boolean, detail: string): DiagnosticCheck {
  return { id, label, status: supported ? "passed" : required ? "failed" : "warning", detail };
}

async function timedCheck(id: string, label: string, task: () => Promise<string>): Promise<DiagnosticCheck> {
  const started = performance.now();
  try {
    return { id, label, status: "passed", detail: await task(), durationMs: performance.now() - started };
  } catch (reason) {
    return { id, label, status: "failed", detail: reason instanceof Error ? reason.message : String(reason), durationMs: performance.now() - started };
  }
}

async function optionalTimedCheck(id: string, label: string, task: () => Promise<string>): Promise<DiagnosticCheck> {
  const result = await timedCheck(id, label, task);
  return result.status === "failed" ? { ...result, status: "warning" } : result;
}

function runEchoWorker(): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/echo.worker.ts", import.meta.url), { type: "module" });
    const timeout = window.setTimeout(() => { worker.terminate(); reject(new Error("Worker handshake timed out.")); }, 7000);
    worker.onmessage = (event: MessageEvent<{ type: string; value: string }>) => {
      window.clearTimeout(timeout); worker.terminate();
      if (event.data.type !== "PONG" || event.data.value !== "phase-11") reject(new Error("Worker returned an unexpected response."));
      else resolve("Dedicated module worker responded correctly.");
    };
    worker.onerror = (event) => { window.clearTimeout(timeout); worker.terminate(); reject(new Error(event.message)); };
    worker.postMessage({ type: "PING", value: "phase-11" });
  });
}

function runMuPdfProbe(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/mupdf.worker.ts", import.meta.url), { type: "module" });
    const requestId = crypto.randomUUID();
    let probeTimeout: number | undefined;
    const startupTimeout = window.setTimeout(() => { worker.terminate(); reject(new Error("MuPDF worker startup timed out.")); }, 45000);
    const clearTimers = () => {
      window.clearTimeout(startupTimeout);
      if (probeTimeout !== undefined) window.clearTimeout(probeTimeout);
    };
    worker.onmessage = (event: MessageEvent) => {
      if (event.data.type === "READY") {
        window.clearTimeout(startupTimeout);
        probeTimeout = window.setTimeout(() => { worker.terminate(); reject(new Error("MuPDF worker probe timed out.")); }, 20000);
        const buffer = toOwnedArrayBuffer(bytes);
        worker.postMessage({ type: "OPEN_PROBE", requestId, bytes: buffer }, [buffer]);
        return;
      }
      if (event.data.requestId !== requestId) return;
      clearTimers(); worker.terminate();
      if (event.data.type === "PROBE_ERROR") reject(new Error(event.data.error?.message ?? "MuPDF probe failed."));
      else if (event.data.type === "PROBE_RESULT") {
        const result = event.data.result as { pageCount: number; firstPageText: string; outputBytes: number };
        if (result.pageCount !== 1 || !result.firstPageText.includes("PDF Studio")) reject(new Error("MuPDF returned an unexpected fixture result."));
        else resolve(`MuPDF reopened and clean-saved one page (${result.outputBytes.toLocaleString()} output bytes).`);
      }
    };
    worker.onerror = (event) => { clearTimers(); worker.terminate(); reject(new Error(event.message)); };
  });
}

async function validateProjectPackage(): Promise<string> {
  const bytes = createMinimalPdf();
  const manifest: ProjectManifest = {
    schemaVersion: 1, id: "release-validation", name: "Release validation", sourceFilename: "release-validation.pdf", mimeType: "application/pdf",
    byteLength: bytes.byteLength, checksum: "validation", createdAt: 1, updatedAt: 1, lastOpenedAt: 1, storageKind: "indexeddb",
    summary: { pageCount: 1, encrypted: false, hasOutline: false }, recovery: { dirty: false }
  };
  const blob = await encodeProjectPackage(manifest, bytes);
  const decoded = decodeProjectPackage(new Uint8Array(await blob.arrayBuffer()));
  await verifyProjectPackageIntegrity(decoded);
  const corrupted = new Uint8Array(await blob.arrayBuffer());
  corrupted[corrupted.length - 1] ^= 0xff;
  let rejected = false;
  try { await verifyProjectPackageIntegrity(decodeProjectPackage(corrupted)); }
  catch { rejected = true; }
  if (!rejected) throw new Error("Corrupted project package payload was not rejected.");

  const headerCorrupted = new Uint8Array(await blob.arrayBuffer());
  const headerLength = new DataView(headerCorrupted.buffer, headerCorrupted.byteOffset + 6, 4).getUint32(0, true);
  const headerStart = 10;
  const headerText = new TextDecoder().decode(headerCorrupted.slice(headerStart, headerStart + headerLength));
  const markerIndex = headerText.indexOf("Release validation");
  if (markerIndex < 0) throw new Error("Release-validation package header marker was not found.");
  const markerByteOffset = new TextEncoder().encode(headerText.slice(0, markerIndex)).byteLength;
  headerCorrupted[headerStart + markerByteOffset] ^= 0x01;
  let headerRejected = false;
  try { await verifyProjectPackageIntegrity(decodeProjectPackage(headerCorrupted)); }
  catch { headerRejected = true; }
  if (!headerRejected) throw new Error("Corrupted project package metadata was not rejected.");
  return `Version ${PROJECT_PACKAGE_VERSION} backup round-trip passed and payload/header corruption were rejected.`;
}

async function serviceWorkerCheck(): Promise<string> {
  if (!("serviceWorker" in navigator)) throw new Error("Service workers are unavailable.");
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Service worker was not ready within 8 seconds.")), 8000))
  ]);
  const expectedScope = new URL(normalizeBasePath(BUILD_BASE_PATH), window.location.origin).toString();
  if (registration.scope !== expectedScope) throw new Error(`Service-worker scope mismatch: ${registration.scope} (expected ${expectedScope}).`);
  const active = registration.active ?? navigator.serviceWorker.controller;
  if (!active) return `Active scope: ${registration.scope}`;
  const workerVersion = await new Promise<string>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve("unknown"), 2500);
    channel.port1.onmessage = (event) => { window.clearTimeout(timeout); resolve(event.data?.version ?? "unknown"); };
    active.postMessage({ type: "GET_RELEASE_VERSION" }, [channel.port2]);
  });
  if (workerVersion !== APP_VERSION) throw new Error(`Service-worker version ${workerVersion} does not match application ${APP_VERSION}.`);
  const offline = await getServiceWorkerOfflineStatus();
  if (!offline.ready) throw new Error(`Offline release cache is incomplete (${offline.cachedAssets}/${offline.expectedAssets} assets).`);
  return `Active scope: ${registration.scope} · worker ${workerVersion} · offline bundle ${offline.cachedAssets}/${offline.expectedAssets}`;
}

export async function runReleaseValidation(onProgress?: (progress: ReleaseValidationProgress) => void): Promise<ReleaseValidationReport> {
  const deployment = assessDeployment(window.location, BUILD_BASE_PATH);
  const checks: DiagnosticCheck[] = [
    staticCheck("deployment-base", "Deployment base path", deployment.withinBase, true, deployment.withinBase ? `Current path is inside ${deployment.basePath}.` : `Current path ${deployment.currentPath} is outside configured base ${deployment.basePath}.`),
    staticCheck("github-pages-origin", "GitHub Pages storage isolation", !deployment.sharedGithubIoOrigin, false, deployment.sharedGithubIoOrigin ? "Project-site paths on *.github.io share one browser origin with other repositories on the same account. Use a dedicated custom hostname for strongest storage isolation." : "This deployment does not use a shared *.github.io project-site origin."),
    staticCheck("secure-context", "Secure context", window.isSecureContext, true, "Required for storage, PWA, and file-system capabilities."),
    staticCheck("wasm", "WebAssembly", typeof WebAssembly !== "undefined", true, "Required for MuPDF and OCR."),
    staticCheck("worker", "Dedicated workers", typeof Worker !== "undefined", true, "Required to isolate PDF processing."),
    staticCheck("indexeddb", "IndexedDB", "indexedDB" in window, true, "Required project metadata fallback."),
    staticCheck("opfs", "Origin Private File System", "storage" in navigator && "getDirectory" in navigator.storage, false, "Preferred large-file storage; IndexedDB remains the fallback."),
    staticCheck("service-worker-api", "Service Worker API", "serviceWorker" in navigator, true, "Required for the offline application shell."),
    staticCheck("file-system-access", "Direct file save API", "showSaveFilePicker" in window, false, "Optional; browser downloads remain supported."),
    staticCheck("offscreen-canvas", "OffscreenCanvas", typeof OffscreenCanvas !== "undefined", false, "Optional rendering acceleration."),
    staticCheck("web-locks", "Web Locks", Boolean(navigator.locks?.request), false, "Preferred cross-context operation serialization; project ownership and in-process locks remain as fallbacks.")
  ];

  const tasks: Array<[string, () => Promise<DiagnosticCheck>]> = [
    ["Worker handshake", () => timedCheck("worker-handshake", "Worker handshake", runEchoWorker)],
    ["PDF.js fixture", () => timedCheck("pdfjs-fixture", "PDF.js fixture open and text extraction", async () => {
      const document = await openPdfWithPdfJs(createMinimalPdf());
      try { const text = await extractPageText(document, 1); if (document.numPages !== 1 || !text.includes("PDF Studio")) throw new Error("Fixture page or text did not match."); return "PDF.js opened one page and extracted the expected text."; }
      finally { await document.loadingTask.destroy(); }
    })],
    ["MuPDF fixture", () => timedCheck("mupdf-fixture", "MuPDF worker open and clean save", () => runMuPdfProbe(createMinimalPdf()))],
    ["Coordinate round-trip", () => timedCheck("coordinates", "Canonical coordinate round-trip", async () => {
      for (const rotation of [0, 90, 180, 270] as const) {
        const service = new CoordinateService(createPdfViewportMatrix(612, 792, 1.75, rotation));
        const source = { x: 123.456, y: 654.321 }; const result = service.viewportToPdf(service.pdfToViewport(source));
        if (Math.abs(result.x - source.x) > 1e-7 || Math.abs(result.y - source.y) > 1e-7) throw new Error(`Coordinate drift at ${rotation}°.`);
      }
      return "All four page rotations round-tripped within tolerance.";
    })],
    ["Adaptive render policy", () => timedCheck("adaptive-render-policy", "Large-document render safeguards", async () => {
      const policy = deriveViewerPerformancePolicy(defaultSettings, 500, 150_000_000, { deviceMemoryGb: 16, logicalProcessors: 12, viewportPixels: 2_000_000 });
      if (!policy.largeDocument || policy.renderConcurrency > 2 || policy.pixelRatioCap > 1.5) throw new Error("Large-document rendering safeguards did not activate.");
      return `${policy.effectiveProfile} profile · ${policy.renderConcurrency} concurrent render(s) · ${policy.pixelRatioCap}× pixel-ratio cap.`;
    })],
    ["IndexedDB", () => timedCheck("indexeddb-roundtrip", "IndexedDB write/read/delete", async () => {
      const token = `phase-11-${crypto.randomUUID()}`; const result = await indexedDbRoundTrip(token); if (result !== token) throw new Error("IndexedDB returned the wrong value."); return "Temporary record round-tripped and was removed.";
    })],
    ["Activity store", () => timedCheck("activity-store", "Activity receipt store", async () => {
      const id = `validation-${crypto.randomUUID()}`;
      const receipt: ActivityReceipt = { id, schemaVersion: 1, kind: "report", filename: "validation.json", mimeType: "application/json", byteLength: 10, sha256: "validation", createdAt: Date.now(), route: "#/validation", releaseVersion: getReleaseInformation().version };
      await idbPut("activityReceipts", receipt);
      const result = await idbGet<ActivityReceipt>("activityReceipts", id);
      await idbDelete("activityReceipts", id);
      if (result?.id !== id) throw new Error("Activity receipt did not round-trip.");
      return "Activity receipt metadata round-tripped and was removed.";
    })],
    ["Workspace stores", () => timedCheck("workspace-stores", "Unified workspace persistence", async () => {
      const eventId = `validation-${crypto.randomUUID()}`;
      const checkpointId = `validation-${crypto.randomUUID()}`;
      const revisionId = `validation-${crypto.randomUUID()}`;
      const transactionId = `validation-${crypto.randomUUID()}`;
      await idbPut("workspaceSessions", { id: "validation", schemaVersion: 1, tabs: [], recentlyClosed: [], timelineOpen: false, preservationOpen: true, updatedAt: Date.now() });
      await idbPut("workspaceEvents", { id: eventId, projectId: "validation", type: "mode-changed", label: "Validation", mode: "viewer", createdAt: Date.now() });
      await idbPut("workspaceCheckpoints", { id: checkpointId, projectId: "validation", projectName: "Validation", label: "Validation", createdAt: Date.now(), packageBytes: new ArrayBuffer(0), byteLength: 0 });
      await idbPut("documentRevisions", { schemaVersion: 1, id: revisionId, projectId: "validation", rootProjectId: "validation", sequence: 0, operation: "release-validation", checksum: "validation", byteLength: 0, createdAt: Date.now() });
      await idbPut("documentTransactions", { id: transactionId, projectId: "validation", operation: "release-validation", status: "committed", startedAt: Date.now(), completedAt: Date.now(), outputRevisionId: revisionId });
      const session = await idbGet<{ id: string }>("workspaceSessions", "validation");
      const event = await idbGet<{ id: string }>("workspaceEvents", eventId);
      const checkpoint = await idbGet<{ id: string }>("workspaceCheckpoints", checkpointId);
      const revision = await idbGet<{ id: string }>("documentRevisions", revisionId);
      const transaction = await idbGet<{ id: string }>("documentTransactions", transactionId);
      await Promise.all([
        idbDelete("workspaceSessions", "validation"),
        idbDelete("workspaceEvents", eventId),
        idbDelete("workspaceCheckpoints", checkpointId),
        idbDelete("documentRevisions", revisionId),
        idbDelete("documentTransactions", transactionId)
      ]);
      if (!session || !event || !checkpoint || !revision || !transaction) throw new Error("One or more unified workspace stores failed to round-trip.");
      return "Session, event, checkpoint, revision, and transaction records round-tripped and were removed.";
    })],
    ["OPFS", () => optionalTimedCheck("opfs-roundtrip", "OPFS write/read/delete", async () => {
      const source = new TextEncoder().encode(`phase-11-${crypto.randomUUID()}`); const result = await opfsRoundTrip(source);
      if (new TextDecoder().decode(result) !== new TextDecoder().decode(source)) throw new Error("OPFS returned different bytes."); return "Temporary file round-tripped and was removed.";
    })],
    ["Cache API", () => timedCheck("cache-roundtrip", "Cache API write/read/delete", async () => {
      if (!("caches" in window)) throw new Error("Cache API is unavailable.");
      const cache = await caches.open("local-pdf-studio-release-validation"); const url = new URL(`release-validation-${crypto.randomUUID()}.txt`, document.baseURI);
      await cache.put(url, new Response("ok")); const value = await (await cache.match(url))?.text(); await cache.delete(url); if (value !== "ok") throw new Error("Cache value did not round-trip."); return "Temporary cache response round-tripped and was removed.";
    })],
    ["Project package", () => timedCheck("project-package", "Project backup integrity", validateProjectPackage)],
    ["Storage safety", async () => {
      const started = performance.now();
      const budget = await checkStorageBudget(10_000_000);
      const status: DiagnosticCheck["status"] = !budget.supported || budget.status !== "ok" ? "warning" : "passed";
      return { id: "storage-budget", label: "Storage safety reserve", status, detail: budget.message, durationMs: performance.now() - started };
    }],
    ["Service worker", () => optionalTimedCheck("service-worker-ready", "Service worker readiness", serviceWorkerCheck)]
  ];

  const total = checks.length + tasks.length + 1;
  let completed = checks.length;
  onProgress?.({ completed, total, current: "Capability checks" });
  for (const [label, task] of tasks) {
    onProgress?.({ completed, total, current: label });
    checks.push(await task()); completed += 1;
  }

  const externalResources = listExternalResourceUrls(performance.getEntriesByType("resource") as PerformanceResourceTiming[], window.location.origin);
  checks.push({
    id: "resource-origins", label: "Core resource-origin audit", status: externalResources.length ? "warning" : "passed",
    detail: externalResources.length ? `${externalResources.length} external resource URL(s) were observed. Review the report; OCR language downloads are the only expected optional network activity.` : "No cross-origin resource loads were observed during validation."
  });
  completed += 1; onProgress?.({ completed, total, current: "Complete" });

  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), release: getReleaseInformation(), status: summarizeReleaseValidation(checks),
    userAgent: navigator.userAgent, location: window.location.href, checks, externalResources
  };
}

