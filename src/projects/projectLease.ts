export type ProjectLeaseMode = "acquiring" | "owner" | "read-only";

export interface ProjectLease {
  readonly mode: ProjectLeaseMode;
  tryAcquire(): Promise<boolean>;
  release(): void;
  subscribe(listener: (mode: ProjectLeaseMode) => void): () => void;
}

interface LeaseRecord {
  ownerId: string;
  nonce: string;
  expiresAt: number;
}

interface WebLockLike {}
interface LockManagerLike {
  request(
    name: string,
    options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: WebLockLike | null) => Promise<void> | void
  ): Promise<unknown>;
}

const LEASE_MS = 12_000;
const HEARTBEAT_MS = 4_000;
const tabId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ownedProjectIds = new Set<string>();

export function ownsProjectLease(projectId: string): boolean {
  return ownedProjectIds.has(projectId);
}

function randomId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Owns a project for the lifetime of the unified workspace. The Web Locks API is
 * authoritative where available; the expiring localStorage lease is a fallback
 * for browsers without Web Locks.
 */
export function createProjectLease(projectId: string): ProjectLease {
  const storageKey = `local-pdf-studio-lease:${projectId}`;
  const lockName = `local-pdf-studio-project:${projectId}`;
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("local-pdf-studio-project-leases") : null;
  const listeners = new Set<(mode: ProjectLeaseMode) => void>();
  const lockManager = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManagerLike }).locks : undefined;

  let mode: ProjectLeaseMode = "acquiring";
  let heartbeat: number | null = null;
  let released = false;
  let fallbackOwned = false;
  let webLockOwned = false;
  let releaseWebLock: (() => void) | null = null;
  let acquiring: Promise<boolean> | null = null;

  function markOwned(value: boolean): void {
    if (value) ownedProjectIds.add(projectId);
    else ownedProjectIds.delete(projectId);
  }

  function notify(next: ProjectLeaseMode): void {
    if (mode === next) return;
    mode = next;
    for (const listener of listeners) listener(next);
  }

  function readFallback(): LeaseRecord | null {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const record = JSON.parse(raw) as LeaseRecord;
      if (!record.ownerId || !record.nonce || record.expiresAt <= Date.now()) return null;
      return record;
    } catch {
      return null;
    }
  }

  function clearHeartbeat(): void {
    if (heartbeat !== null) window.clearInterval(heartbeat);
    heartbeat = null;
  }

  function writeFallbackLease(): boolean {
    const nonce = randomId();
    const record: LeaseRecord = { ownerId: tabId, nonce, expiresAt: Date.now() + LEASE_MS };
    try {
      localStorage.setItem(storageKey, JSON.stringify(record));
      const verified = readFallback();
      if (!verified || verified.ownerId !== tabId || verified.nonce !== nonce) return false;
      fallbackOwned = true;
      markOwned(true);
      channel?.postMessage({ type: "LEASE", projectId, ownerId: tabId });
      return true;
    } catch {
      return false;
    }
  }

  function startFallbackHeartbeat(): void {
    clearHeartbeat();
    heartbeat = window.setInterval(() => {
      if (released || webLockOwned) return;
      const current = readFallback();
      if (current && current.ownerId !== tabId) {
        fallbackOwned = false;
        markOwned(false);
        clearHeartbeat();
        notify("read-only");
        return;
      }
      if (!writeFallbackLease()) {
        fallbackOwned = false;
        markOwned(false);
        clearHeartbeat();
        notify("read-only");
      }
    }, HEARTBEAT_MS);
  }

  async function acquireWebLock(): Promise<boolean> {
    if (!lockManager) return false;
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      void lockManager.request(lockName, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock || released) {
          settle(false);
          return;
        }
        webLockOwned = true;
        fallbackOwned = false;
        markOwned(true);
        clearHeartbeat();
        notify("owner");
        channel?.postMessage({ type: "LEASE", projectId, ownerId: tabId });
        settle(true);
        await new Promise<void>((release) => { releaseWebLock = release; });
        releaseWebLock = null;
        webLockOwned = false;
        markOwned(false);
      }).catch(() => settle(false));
    });
  }

  async function acquireFallback(): Promise<boolean> {
    const current = readFallback();
    if (current && current.ownerId !== tabId) {
      fallbackOwned = false;
      markOwned(false);
      notify("read-only");
      return false;
    }
    if (!writeFallbackLease()) {
      fallbackOwned = false;
      markOwned(false);
      notify("read-only");
      return false;
    }
    startFallbackHeartbeat();
    notify("owner");
    return true;
  }

  async function tryAcquire(): Promise<boolean> {
    if (released) return false;
    if (webLockOwned || fallbackOwned) return true;
    if (acquiring) return acquiring;
    notify("acquiring");
    acquiring = (async () => {
      if (lockManager) {
        const acquired = await acquireWebLock();
        if (!acquired) {
          markOwned(false);
          notify("read-only");
        }
        return acquired;
      }
      return acquireFallback();
    })();
    try {
      return await acquiring;
    } finally {
      acquiring = null;
    }
  }

  function releaseLease(): void {
    if (released) return;
    released = true;
    clearHeartbeat();
    if (fallbackOwned) {
      const current = readFallback();
      if (current?.ownerId === tabId) {
        try { localStorage.removeItem(storageKey); } catch { /* Storage may be blocked. */ }
      }
    }
    fallbackOwned = false;
    markOwned(false);
    releaseWebLock?.();
    channel?.postMessage({ type: "RELEASE", projectId, ownerId: tabId });
    channel?.close();
    notify("read-only");
  }

  const onStorage = (event: StorageEvent) => {
    if (lockManager || webLockOwned || event.key !== storageKey) return;
    const current = readFallback();
    if (current && current.ownerId !== tabId) {
      fallbackOwned = false;
      markOwned(false);
      clearHeartbeat();
      notify("read-only");
    }
  };
  window.addEventListener("storage", onStorage);
  channel?.addEventListener("message", (event: MessageEvent<{ type: string; projectId: string; ownerId: string }>) => {
    if (event.data.projectId !== projectId || event.data.ownerId === tabId || webLockOwned) return;
    if (!lockManager) {
      const current = readFallback();
      if (current?.ownerId !== tabId) {
        fallbackOwned = false;
        markOwned(false);
        notify("read-only");
      }
    }
  });

  void tryAcquire();

  return {
    get mode() { return mode; },
    tryAcquire,
    release() {
      window.removeEventListener("storage", onStorage);
      releaseLease();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(mode);
      return () => listeners.delete(listener);
    }
  };
}
