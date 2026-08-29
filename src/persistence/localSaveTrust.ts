export type LocalSavePhase = "idle" | "pending" | "saving" | "saved" | "error";

export interface LocalSaveState {
  phase: LocalSavePhase;
  revision: number;
  savedAt?: number;
  message?: string;
}

export function describeLocalSaveError(reason: unknown): string {
  const name = reason instanceof Error ? reason.name : "";
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  const combined = `${name} ${message}`.toLowerCase();

  if (name === "QuotaExceededError" || /quota|storage.+full|disk.+full/.test(combined)) {
    return "Browser storage could not accept this save. Your current edits are still open in this tab. Free some local storage or export a PDF, then retry before closing or refreshing.";
  }
  if (name === "AbortError" || /transaction.+abort|write.+abort|interrupted/.test(combined)) {
    return "The local storage write was interrupted. Your current edits are still open in this tab. Retry before closing or refreshing.";
  }
  return "PDF Studio could not save the latest edits to local browser storage. Your current edits are still open in this tab. Retry before closing or refreshing.";
}

export function localSaveStatusLabel(state: LocalSaveState, report: string | null, hasExportChanges: boolean): string {
  if (state.phase === "pending") return "Local changes waiting to save";
  if (state.phase === "saving") return "Saving local changes…";
  if (state.phase === "error") return "Local autosave failed";
  if (state.phase === "saved") return report ?? "Local changes saved";
  return report ?? (hasExportChanges ? "Local changes not yet saved" : "No pending editor changes");
}

export function localSaveNeedsUnloadGuard(state: LocalSaveState): boolean {
  return state.phase === "pending" || state.phase === "saving" || state.phase === "error";
}
