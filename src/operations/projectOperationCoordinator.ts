export type ProjectOperationStage = "queued" | "running" | "validating" | "committing";

export interface ProjectOperationSnapshot {
  id: string;
  projectId: string;
  label: string;
  stage: ProjectOperationStage;
  detail?: string;
  progress?: number;
  startedAt: number;
  cancellable: boolean;
}

export interface ProjectOperationContext {
  signal: AbortSignal;
  update(patch: Partial<Pick<ProjectOperationSnapshot, "label" | "stage" | "detail" | "progress">>): void;
}

export interface RunProjectOperationOptions {
  label: string;
  signal?: AbortSignal;
  cancellable?: boolean;
  reserveBytes?: number;
  storagePurpose?: string;
}

import { assertStorageBudget } from "../storage/budget.ts";

const active = new Map<string, ProjectOperationSnapshot>();
const controllers = new Map<string, AbortController>();
const emitter = new EventTarget();
const CHANGE_EVENT = "change";

function createId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emit(projectId: string): void {
  emitter.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { projectId, operation: active.get(projectId) ?? null } }));
}

function combineSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
  if (!secondary) return primary;
  const controller = new AbortController();
  const abort = (signal: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason ?? new DOMException("Operation cancelled.", "AbortError"));
  };
  if (primary.aborted) abort(primary);
  else primary.addEventListener("abort", () => abort(primary), { once: true });
  if (secondary.aborted) abort(secondary);
  else secondary.addEventListener("abort", () => abort(secondary), { once: true });
  return controller.signal;
}


export function getActiveProjectOperations(): ProjectOperationSnapshot[] {
  return [...active.values()];
}

export function hasAnyActiveProjectOperation(): boolean {
  return active.size > 0;
}

export function subscribeAllProjectOperations(listener: (operations: ProjectOperationSnapshot[]) => void): () => void {
  const handler = () => listener(getActiveProjectOperations());
  emitter.addEventListener(CHANGE_EVENT, handler);
  listener(getActiveProjectOperations());
  return () => emitter.removeEventListener(CHANGE_EVENT, handler);
}

export function getProjectOperation(projectId: string): ProjectOperationSnapshot | null {
  return active.get(projectId) ?? null;
}

export function subscribeProjectOperation(projectId: string, listener: (operation: ProjectOperationSnapshot | null) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ projectId: string; operation: ProjectOperationSnapshot | null }>).detail;
    if (detail.projectId === projectId) listener(detail.operation);
  };
  emitter.addEventListener(CHANGE_EVENT, handler);
  listener(getProjectOperation(projectId));
  return () => emitter.removeEventListener(CHANGE_EVENT, handler);
}

export function cancelProjectOperation(projectId: string): boolean {
  const operation = active.get(projectId);
  const controller = controllers.get(projectId);
  if (!operation || !controller || !operation.cancellable) return false;
  controller.abort(new DOMException("Operation cancelled.", "AbortError"));
  return true;
}

export async function runProjectOperation<T>(
  projectId: string,
  options: RunProjectOperationOptions,
  task: (context: ProjectOperationContext) => Promise<T>
): Promise<T> {
  if (active.has(projectId)) throw new Error(`Another operation is already running for this document: ${active.get(projectId)?.label ?? "document operation"}.`);

  const controller = new AbortController();
  const signal = combineSignals(controller.signal, options.signal);
  const snapshot: ProjectOperationSnapshot = {
    id: createId(),
    projectId,
    label: options.label,
    stage: "queued",
    startedAt: Date.now(),
    cancellable: options.cancellable !== false
  };
  active.set(projectId, snapshot);
  controllers.set(projectId, controller);
  emit(projectId);

  const update: ProjectOperationContext["update"] = (patch) => {
    const current = active.get(projectId);
    if (!current || current.id !== snapshot.id) return;
    const progress = patch.progress === undefined ? current.progress : Math.max(0, Math.min(1, patch.progress));
    active.set(projectId, { ...current, ...patch, progress });
    emit(projectId);
  };

  const execute = async (): Promise<T> => {
    if (signal.aborted) throw signal.reason ?? new DOMException("Operation cancelled.", "AbortError");
    update({ stage: "running" });
    return task({ signal, update });
  };

  try {
    if (options.reserveBytes && options.reserveBytes > 0) {
      update({ detail: "Checking local storage headroom…", progress: 0.01 });
      await assertStorageBudget(options.reserveBytes, options.storagePurpose ?? "save the resulting revision");
    }
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (locks?.request) {
      const result = await locks.request(`local-pdf-studio-operation:${projectId}`, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error("This document is already busy in another browser context.");
        return execute();
      });
      return result;
    }
    return await execute();
  } finally {
    const current = active.get(projectId);
    if (current?.id === snapshot.id) {
      active.delete(projectId);
      controllers.delete(projectId);
      emit(projectId);
    }
  }
}
