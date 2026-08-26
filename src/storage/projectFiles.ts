import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import { recordRuntimeMetric } from "../performance/runtimeMetrics";

const PROJECT_ROOT = "projects";
const sourceByteCache = new Map<string, Uint8Array>();

function hasOpfs(): boolean {
  return "storage" in navigator && "getDirectory" in navigator.storage;
}

async function getProjectDirectory(projectId: string, create: boolean): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const projects = await root.getDirectoryHandle(PROJECT_ROOT, { create });
  return projects.getDirectoryHandle(projectId, { create });
}

export async function writeProjectSource(projectId: string, bytes: Uint8Array): Promise<string> {
  if (!hasOpfs()) throw new Error("OPFS is unavailable.");
  const directory = await getProjectDirectory(projectId, true);
  const file = await directory.getFileHandle("original.pdf", { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(toOwnedArrayBuffer(bytes));
    await writable.close();
    // Project source PDFs are immutable. Reusing the same byte view avoids a full
    // OPFS read every time the persistent workspace changes document modes.
    sourceByteCache.set(projectId, bytes);
  } catch (reason) {
    sourceByteCache.delete(projectId);
    try { await writable.abort(reason); } catch { /* Best-effort cleanup; caller removes the project directory. */ }
    throw reason;
  }
  return `/${PROJECT_ROOT}/${projectId}/original.pdf`;
}

export async function readProjectSource(projectId: string): Promise<Uint8Array> {
  const cached = sourceByteCache.get(projectId);
  if (cached) {
    recordRuntimeMetric("storage", "projectSource.session.hit", 0, undefined, { storage: "opfs" });
    return cached;
  }
  if (!hasOpfs()) throw new Error("OPFS is unavailable.");
  recordRuntimeMetric("storage", "projectSource.session.miss", 0, undefined, { storage: "opfs" });
  const directory = await getProjectDirectory(projectId, false);
  const handle = await directory.getFileHandle("original.pdf");
  const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
  sourceByteCache.set(projectId, bytes);
  return bytes;
}

export async function deleteProjectFiles(projectId: string): Promise<void> {
  sourceByteCache.delete(projectId);
  if (!hasOpfs()) return;
  const root = await navigator.storage.getDirectory();
  try {
    const projects = await root.getDirectoryHandle(PROJECT_ROOT);
    await projects.removeEntry(projectId, { recursive: true });
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
  }
}

export async function calculateOpfsProjectBytes(): Promise<number> {
  if (!hasOpfs()) return 0;
  const root = await navigator.storage.getDirectory();
  let total = 0;
  try {
    const projects = await root.getDirectoryHandle(PROJECT_ROOT);
    const projectEntries = (projects as unknown as { values(): AsyncIterableIterator<FileSystemHandle> }).values();
    for await (const entry of projectEntries) {
      if (entry.kind !== "directory") continue;
      const childEntries = (entry as FileSystemDirectoryHandle as unknown as { values(): AsyncIterableIterator<FileSystemHandle> }).values();
      for await (const child of childEntries) {
        if (child.kind === "file") total += (await (child as FileSystemFileHandle).getFile()).size;
      }
    }
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
  }
  return total;
}
