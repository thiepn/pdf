import { listInstalledLanguages } from "../ocr/ocrRepository";
import { supportsPwaFileHandling } from "./launchFiles";
import { canPromptPwaInstall, isStandalonePwa } from "./installManager";
import { getServiceWorkerOfflineStatus } from "../release/serviceWorkerManager";

export interface PwaReadinessSnapshot {
  online: boolean;
  standalone: boolean;
  installPromptAvailable: boolean;
  serviceWorkerControlled: boolean;
  offlineShellReady: boolean;
  offlineAssetsCached: number;
  offlineAssetsExpected: number;
  persistenceSupported: boolean;
  persisted: boolean;
  usage?: number;
  quota?: number;
  installedOcrLanguages: number;
  fileHandlingSupported: boolean;
  shareTargetConfigured: boolean;
}

export async function collectPwaReadiness(): Promise<PwaReadinessSnapshot> {
  const [status, persisted, estimate, languages] = await Promise.all([
    getServiceWorkerOfflineStatus().catch(() => null),
    navigator.storage?.persisted?.().catch(() => false) ?? Promise.resolve(false),
    navigator.storage?.estimate?.().catch(() => undefined) ?? Promise.resolve(undefined),
    listInstalledLanguages().catch(() => [])
  ]);
  return {
    online: navigator.onLine,
    standalone: isStandalonePwa(),
    installPromptAvailable: canPromptPwaInstall(),
    serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
    offlineShellReady: Boolean(status?.ready),
    offlineAssetsCached: status?.cachedAssets ?? 0,
    offlineAssetsExpected: status?.expectedAssets ?? 0,
    persistenceSupported: Boolean(navigator.storage?.persist),
    persisted: Boolean(persisted),
    usage: estimate?.usage,
    quota: estimate?.quota,
    installedOcrLanguages: languages.length,
    fileHandlingSupported: supportsPwaFileHandling(),
    shareTargetConfigured: true
  };
}
