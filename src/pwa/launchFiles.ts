import { storeSharedInboxFiles } from "./shareInbox";

export const PWA_LAUNCH_FILES_EVENT = "local-pdf-studio-launch-files";

interface LaunchFileHandleLike {
  getFile(): Promise<File>;
}
interface LaunchParamsLike { files?: LaunchFileHandleLike[] }
interface LaunchQueueLike { setConsumer(consumer: (params: LaunchParamsLike) => void | Promise<void>): void }

export interface PendingPwaLaunchFile {
  id: string;
  file: File;
}

let pendingFiles: PendingPwaLaunchFile[] = [];
let registered = false;

function createPendingEntry(file: File): PendingPwaLaunchFile {
  return { id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`, file };
}

export function supportsPwaFileHandling(): boolean {
  return Boolean((window as Window & { launchQueue?: LaunchQueueLike }).launchQueue);
}

export function registerPwaFileHandling(): void {
  if (registered) return;
  registered = true;
  const launchQueue = (window as Window & { launchQueue?: LaunchQueueLike }).launchQueue;
  if (!launchQueue) return;
  launchQueue.setConsumer(async (params) => {
    const files: File[] = [];
    for (const handle of params.files ?? []) {
      try { files.push(await handle.getFile()); } catch { /* The browser can revoke a launch handle before it is read. */ }
    }
    if (!files.length) return;

    // Prefer the durable Cache Storage inbox so a password prompt, failed import,
    // navigation, or reload cannot discard a file delivered by the OS. If Cache
    // Storage is unavailable, retain a non-destructive in-memory queue instead.
    try {
      await storeSharedInboxFiles(files);
    } catch {
      pendingFiles.push(...files.map(createPendingEntry));
    }
    window.dispatchEvent(new CustomEvent<File[]>(PWA_LAUNCH_FILES_EVENT, { detail: files }));
  });
}

export function peekPendingPwaLaunchFiles(maxCount = Number.POSITIVE_INFINITY): PendingPwaLaunchFile[] {
  const count = Math.max(0, Math.min(pendingFiles.length, maxCount));
  return pendingFiles.slice(0, count);
}

export function acknowledgePendingPwaLaunchFiles(ids: string[]): void {
  if (!ids.length) return;
  const remove = new Set(ids);
  pendingFiles = pendingFiles.filter((entry) => !remove.has(entry.id));
}

/** @deprecated Prefer peek + acknowledge so failed imports remain retryable. */
export function takePendingPwaLaunchFiles(maxCount = Number.POSITIVE_INFINITY): File[] {
  const entries = peekPendingPwaLaunchFiles(maxCount);
  acknowledgePendingPwaLaunchFiles(entries.map((entry) => entry.id));
  return entries.map((entry) => entry.file);
}
