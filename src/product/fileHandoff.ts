import { MAX_INPUT_BYTES } from "../quick/quickModel";

export type InputKind = "pdf" | "pdfs" | "images";
const IMAGE = /\.(jpe?g|png|webp)$/i;
const PDF = /\.pdf$/i;

/** Inspect names and sizes only. Parsing starts after the user chooses an action. */
export function inspectIncomingFiles(files: readonly File[]): InputKind {
  if (!files.length) throw new Error("Choose at least one file.");
  if (files.some((file) => file.size === 0)) throw new Error("One of these files is empty. Choose a non-empty file.");
  if (files.reduce((total, file) => total + file.size, 0) > MAX_INPUT_BYTES) throw new Error("Choose files totaling less than 200 MB.");
  if (files.every((file) => PDF.test(file.name))) return files.length === 1 ? "pdf" : "pdfs";
  if (files.every((file) => IMAGE.test(file.name))) return "images";
  if (files.every((file) => PDF.test(file.name) || IMAGE.test(file.name))) {
    throw new Error("Choose PDFs or images, not a mixture. Convert images to PDF first, then merge the PDFs.");
  }
  throw new Error("Choose PDF, JPG, PNG, or WebP files. Editable Word, Excel, and PowerPoint conversion is not implemented yet.");
}

const TTL = 10 * 60 * 1000;
let pending: { taskId: string; files: File[]; at: number } | null = null;

/** One-use hand-off. File contents are never written to web storage. */
export function handOffTaskFiles(taskId: string, files: readonly File[]): void {
  inspectIncomingFiles(files);
  pending = { taskId, files: [...files], at: Date.now() };
}
export function takeTaskFiles(taskId: string): File[] | null {
  const current = pending;
  pending = null;
  if (!current || current.taskId !== taskId || Date.now() - current.at > TTL) return null;
  return current.files;
}
export function discardTaskFiles(): void { pending = null; }
