import type { WorkspaceMode } from "../types/workspace";

const LEGACY_KEY = "local-pdf-studio-workspace-heartbeat-v1";
const KEY_PREFIX = "local-pdf-studio-workspace-heartbeat-v2:";
const MAX_RECOVERY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface WorkspaceHeartbeatRecord {
  schemaVersion: 2;
  sessionId: string;
  projectId: string;
  mode: WorkspaceMode;
  startedAt: number;
  heartbeatAt: number;
  cleanExit: boolean;
}

export interface InterruptedWorkspaceSession extends WorkspaceHeartbeatRecord {
  ageMs: number;
}

function heartbeatKey(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

function parseRecord(raw: string | null): WorkspaceHeartbeatRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceHeartbeatRecord> & { schemaVersion?: number };
    if (parsed.schemaVersion !== 2 || !parsed.sessionId || !parsed.projectId || !parsed.mode || !Number.isFinite(parsed.heartbeatAt)) return null;
    return parsed as WorkspaceHeartbeatRecord;
  } catch {
    return null;
  }
}

function pruneHeartbeatRecords(now = Date.now()): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
    const removals: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(KEY_PREFIX)) continue;
      const record = parseRecord(localStorage.getItem(key));
      if (!record || record.cleanExit || now - record.heartbeatAt > MAX_RECOVERY_AGE_MS || now - record.heartbeatAt < 0) removals.push(key);
    }
    for (const key of removals) localStorage.removeItem(key);
  } catch { /* Recovery is best effort. */ }
}

export function readInterruptedWorkspaceSession(projectId?: string): InterruptedWorkspaceSession | null {
  const now = Date.now();
  pruneHeartbeatRecords(now);
  try {
    const candidates: InterruptedWorkspaceSession[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(KEY_PREFIX)) continue;
      const record = parseRecord(localStorage.getItem(key));
      if (!record || record.cleanExit) continue;
      const ageMs = now - record.heartbeatAt;
      if (ageMs < 0 || ageMs > MAX_RECOVERY_AGE_MS) continue;
      if (projectId && record.projectId !== projectId) continue;
      candidates.push({ ...record, ageMs });
    }
    return candidates.sort((left, right) => right.heartbeatAt - left.heartbeatAt)[0] ?? null;
  } catch { return null; }
}

export function beginWorkspaceHeartbeat(projectId: string, mode: WorkspaceMode): () => void {
  pruneHeartbeatRecords();
  const record: WorkspaceHeartbeatRecord = {
    schemaVersion: 2,
    sessionId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    projectId,
    mode,
    startedAt: Date.now(),
    heartbeatAt: Date.now(),
    cleanExit: false
  };
  const key = heartbeatKey(record.sessionId);
  const persist = () => {
    try { localStorage.setItem(key, JSON.stringify({ ...record, heartbeatAt: Date.now(), cleanExit: false })); } catch { /* Recovery is best effort. */ }
  };
  const clean = () => {
    try { localStorage.removeItem(key); } catch { /* Recovery is best effort. */ }
  };
  persist();
  const timer = window.setInterval(persist, 10_000);
  const handlePageHide = (event: PageTransitionEvent) => {
    if (event.persisted) persist();
    else clean();
  };
  window.addEventListener("pagehide", handlePageHide);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("pagehide", handlePageHide);
    clean();
  };
}
