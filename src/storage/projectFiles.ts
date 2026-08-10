import { toOwnedArrayBuffer } from "../core/arrayBuffer";

const PROJECT_ROOT = "projects";

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
  } catch (reason) {
    try { await writable.abort(reason); } catch { /* Best-effort cleanup; caller removes the project directory. */ }
    throw reason;
  }
  return `/${PROJECT_ROOT}/${projectId}/original.pdf`;
}

export async function readProjectSource(projectId: string): Promise<Uint8Array> {
  if (!hasOpfs()) throw new Error("OPFS is unavailable.");
  const directory = await getProjectDirectory(projectId, false);
  const handle = await directory.getFileHandle("original.pdf");
  return new Uint8Array(await (await handle.getFile()).arrayBuffer());
}

export async function deleteProjectFiles(projectId: string): Promise<void> {
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
