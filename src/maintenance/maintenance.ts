import { listActivityReceipts } from "../activity/activityRepository";
import { getReleaseInformation } from "../core/release";
import { listDiagnosticErrors } from "../diagnostics/errorRepository";
import { readSettings } from "../settings/settingsStore";
import { runStorageHealthCheck } from "../storage/health";
import { collectRuntimeHealth } from "../runtime/runtimeHealth";
import { OCR_LANGUAGE_CACHE } from "../release/cacheNames";
import { normalizeBasePath } from "../release/deployment";
import { refreshActiveReleaseCache } from "../release/serviceWorkerManager";

export interface MaintenanceResult {
  action: string;
  completedAt: string;
  detail: string;
}

export async function clearRuntimeCaches(preserveOcrLanguages = true): Promise<MaintenanceResult> {
  // Never treat the Share Inbox as disposable runtime cache: it may contain the
  // only local copy of a PDF delivered through the OS share/file-handling path.
  // Refresh the active release atomically in place so a failed network request
  // preserves the previously working offline shell.
  const status = await refreshActiveReleaseCache();
  let removedLanguages = false;
  if (!preserveOcrLanguages && "caches" in window) {
    removedLanguages = await caches.delete(OCR_LANGUAGE_CACHE);
  }
  return {
    action: "refresh-runtime-cache",
    completedAt: new Date().toISOString(),
    detail: `Refreshed ${status.cachedAssets}/${status.expectedAssets} offline application assets${preserveOcrLanguages ? " while retaining installed OCR language packs and pending shared files" : removedLanguages ? " and removed installed OCR language packs while preserving pending shared files" : " while preserving pending shared files"}.`
  };
}

export async function unregisterServiceWorkers(): Promise<MaintenanceResult> {
  if (!("serviceWorker" in navigator)) throw new Error("Service workers are unavailable in this browser.");
  const registrations = await navigator.serviceWorker.getRegistrations();
  const expectedScope = new URL(normalizeBasePath(import.meta.env.BASE_URL), window.location.origin).toString();
  const owned = registrations.filter((registration) => registration.scope === expectedScope);
  const results = await Promise.all(owned.map((registration) => registration.unregister()));
  return { action: "unregister-service-workers", completedAt: new Date().toISOString(), detail: `Unregistered ${results.filter(Boolean).length} service worker registration(s).` };
}

export async function createSupportBundle(includeFilenames = false): Promise<Blob> {
  const [health, diagnostics, receipts, runtime] = await Promise.all([runStorageHealthCheck(), listDiagnosticErrors(), listActivityReceipts(), collectRuntimeHealth()]);
  const report = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    release: getReleaseInformation(),
    browser: { userAgent: navigator.userAgent, online: navigator.onLine, language: navigator.language },
    runtime,
    settings: readSettings(),
    storageHealth: health,
    diagnostics,
    activity: receipts.map((receipt) => ({
      createdAt: receipt.createdAt,
      kind: receipt.kind,
      filename: includeFilenames ? receipt.filename : "[filename omitted]",
      mimeType: receipt.mimeType,
      byteLength: receipt.byteLength,
      sha256: receipt.sha256,
      releaseVersion: receipt.releaseVersion
    }))
  };
  return new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
}
