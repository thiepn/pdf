import { readSettings } from "../settings/settingsStore";
import { hasAnyActiveProjectOperation } from "../operations/projectOperationCoordinator";
import { deploymentAssetUrl, normalizeBasePath } from "./deployment";

export interface ServiceWorkerUpdateDetail {
  registration: ServiceWorkerRegistration;
}

export interface ServiceWorkerOfflineStatus {
  version: string;
  channel: "release-candidate" | "stable";
  buildEpoch: number;
  cache: string;
  scopePath: string;
  ready: boolean;
  expectedAssets: number;
  cachedAssets: number;
  missingAssets: string[];
}

export const SERVICE_WORKER_UPDATE_EVENT = "local-pdf-studio-update-available";

function announceUpdate(registration: ServiceWorkerRegistration): void {
  if (readSettings().updateMode === "automatic" && !hasAnyActiveProjectOperation()) {
    activateWaitingServiceWorker(registration);
    return;
  }
  window.dispatchEvent(new CustomEvent<ServiceWorkerUpdateDetail>(SERVICE_WORKER_UPDATE_EVENT, { detail: { registration } }));
}

function messageWorker<T>(worker: ServiceWorker | null, data: unknown, timeoutMs = 4000): Promise<T> {
  if (!worker) return Promise.reject(new Error("No active PDF Studio service worker is available."));
  return new Promise<T>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => reject(new Error("Service worker did not respond.")), timeoutMs);
    channel.port1.onmessage = (event) => { window.clearTimeout(timeout); resolve(event.data as T); };
    worker.postMessage(data, [channel.port2]);
  });
}

export async function registerAppServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const url = deploymentAssetUrl("sw.js");
  const scope = normalizeBasePath(import.meta.env.BASE_URL);
  const registration = await navigator.serviceWorker.register(url, { scope });
  if (registration.waiting) announceUpdate(registration);
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) announceUpdate(registration);
    });
  });
}

export function activateWaitingServiceWorker(registration: ServiceWorkerRegistration): boolean {
  if (hasAnyActiveProjectOperation()) return false;
  const waiting = registration.waiting;
  if (!waiting) return false;
  // Capture the waiting worker before posting: it may transition to activating
  // immediately, making registration.waiting null before this function returns.
  waiting.postMessage({ type: "SKIP_WAITING" });
  return true;
}

export async function getServiceWorkerOfflineStatus(): Promise<ServiceWorkerOfflineStatus> {
  if (!("serviceWorker" in navigator)) throw new Error("Service workers are unavailable in this browser.");
  const registration = await navigator.serviceWorker.getRegistration(normalizeBasePath(import.meta.env.BASE_URL));
  const worker = navigator.serviceWorker.controller ?? registration?.active ?? null;
  return messageWorker<ServiceWorkerOfflineStatus>(worker, { type: "GET_OFFLINE_STATUS" });
}

export async function markActiveServiceWorkerHealthy(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration(normalizeBasePath(import.meta.env.BASE_URL));
  const worker = navigator.serviceWorker.controller ?? registration?.active ?? null;
  if (!worker) return false;
  const status = await messageWorker<ServiceWorkerOfflineStatus>(worker, { type: "GET_OFFLINE_STATUS" }).catch(() => null);
  if (!status?.ready) return false;
  const result = await messageWorker<{ ok?: boolean }>(worker, { type: "CLIENT_HEALTHY" }).catch(() => null);
  return result?.ok === true;
}

export async function refreshActiveReleaseCache(): Promise<ServiceWorkerOfflineStatus> {
  if (!("serviceWorker" in navigator)) throw new Error("Service workers are unavailable in this browser.");
  const registration = await navigator.serviceWorker.getRegistration(normalizeBasePath(import.meta.env.BASE_URL));
  const worker = navigator.serviceWorker.controller ?? registration?.active ?? null;
  const result = await messageWorker<{ ok?: boolean; status?: ServiceWorkerOfflineStatus; error?: string }>(worker, { type: "REFRESH_RELEASE_CACHE" }, 120_000);
  if (!result?.ok || !result.status?.ready) throw new Error(result?.error || "The offline shell could not be refreshed completely.");
  return result.status;
}
