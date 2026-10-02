import { isQuickTask, MAX_INPUT_BYTES } from "../quick/quickModel";
import { getTask, type PdfTask } from "../ia/taskCatalog";

export type InputKind = "pdf" | "pdfs" | "images" | "mixed";
export const isImageFile = (file: Pick<File, "name"> & Partial<Pick<File, "type">>): boolean => /\.(jpe?g|png|webp)$/i.test(file.name) || /^(image\/(jpeg|png|webp))$/i.test(file.type ?? "");
export const isPdfFile = (file: Pick<File, "name"> & Partial<Pick<File, "type">>): boolean => /\.pdf$/i.test(file.name) || file.type?.toLowerCase() === "application/pdf";

/** Names/sizes only; never parse a document before the user chooses an action. */
export function inspectIncomingFiles(files: readonly File[]): InputKind {
  if (!files.length) throw new Error("Choose at least one file.");
  if (files.some((file) => file.size === 0)) throw new Error("One of these files is empty. Choose a non-empty file.");
  if (files.reduce((total, file) => total + file.size, 0) > MAX_INPUT_BYTES) throw new Error("Choose files totaling less than 200 MB.");
  if (files.every(isPdfFile)) return files.length === 1 ? "pdf" : "pdfs";
  if (files.every(isImageFile)) return "images";
  if (files.every((file) => isPdfFile(file) || isImageFile(file))) return "mixed";
  throw new Error("Choose PDF, JPG, PNG, or WebP files. Editable Word, Excel, and PowerPoint conversion is not implemented yet.");
}
/** This same contract is used by the directory and the one-use file handoff. */
export function acceptsTaskInput(task: Pick<PdfTask, "id" | "target">, kind: InputKind, count = kind === "pdf" ? 1 : 2): boolean {
  if (["merge-pdfs", "organize-pages"].includes(task.id)) return true;
  if (task.id === "compress-pdf") return kind === "pdf" || kind === "pdfs";
  if (task.id === "images-to-pdf" || task.id === "scan-to-pdf") return kind === "images";
  if (task.id === "compare-pdfs") return (kind === "pdf" || kind === "pdfs") && count <= 2;
  if (kind !== "pdf") return false;
  return isQuickTask(task.id) || task.target.kind === "workspace";
}
const TTL = 10 * 60 * 1000;
export interface TaskTransfer { files: File[]; passwords: Array<string | undefined>; warnings: string[] }
let pending: (TaskTransfer & { taskId: string; at: number }) | null = null;
let pendingExpiry: ReturnType<typeof setTimeout> | null = null;

function clearPending(): void {
  pending = null;
  if (pendingExpiry !== null) clearTimeout(pendingExpiry);
  pendingExpiry = null;
}
/** File bytes and passwords are never put in URLs, browser storage or analytics. */
export function handOffTaskFiles(taskId: string, files: readonly File[], context: Partial<Pick<TaskTransfer, "passwords" | "warnings">> = {}): void {
  const kind = inspectIncomingFiles(files), task = getTask(taskId);
  if (!task || !acceptsTaskInput(task, kind, files.length)) throw new Error("These files cannot be used by that tool. Choose a compatible task.");
  clearPending();
  const transfer = { taskId, files: [...files], passwords: [...(context.passwords ?? [])], warnings: [...(context.warnings ?? [])], at: Date.now() };
  pending = transfer;
  pendingExpiry = setTimeout(() => {
    if (pending === transfer) pending = null;
    pendingExpiry = null;
  }, TTL);
}
export function takeTaskTransfer(taskId: string): TaskTransfer | null {
  const current = pending;
  if (!current) return null;
  if (Date.now() - current.at > TTL) { clearPending(); return null; }
  if (current.taskId !== taskId) return null;
  clearPending(); return { files: current.files, passwords: current.passwords, warnings: current.warnings };
}
export function takeTaskFiles(taskId: string): File[] | null { return takeTaskTransfer(taskId)?.files ?? null; }
export function discardTaskFiles(): void { clearPending(); }
