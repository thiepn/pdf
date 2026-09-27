import type { PdfTask } from "../ia/taskCatalog";

type Launcher = (task: PdfTask) => Promise<void>;
const launchers = new Map<string, Launcher>();

/** All task entry points must use the mounted document's checked handoff.
 * Navigating first would unmount its live editor/form state before export. */
export function registerDocumentTaskLauncher(projectId: string, launcher: Launcher): () => void {
  launchers.set(projectId, launcher);
  return () => { if (launchers.get(projectId) === launcher) launchers.delete(projectId); };
}

export function getDocumentTaskLauncher(projectId: string): Launcher | undefined {
  return launchers.get(projectId);
}
