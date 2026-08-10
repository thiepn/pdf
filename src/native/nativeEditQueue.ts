import type { NativeEdit } from "../types/nativeEditor";

/**
 * Merge edits by detected source object. Most source objects have one queued edit;
 * tables have one edit per cell and are replaced as an object-level batch.
 */
export function mergeNativeEdits(current: NativeEdit[], incoming: NativeEdit[]): NativeEdit[] {
  if (!incoming.length) return current;
  const objectIds = new Set(incoming.map((edit) => edit.objectId));
  const replacementTableIds = new Set(incoming.filter((edit) => edit.kind === "table-cell").map((edit) => edit.objectId));
  const retained = current.filter((existing) => {
    if (!objectIds.has(existing.objectId)) return true;
    if (replacementTableIds.has(existing.objectId)) return false;
    return false;
  });
  return [...retained, ...incoming];
}

export function discardNativeObjectEdits(current: NativeEdit[], objectId: string): NativeEdit[] {
  return current.filter((edit) => edit.objectId !== objectId);
}

export function nativeChangedPages(edits: NativeEdit[]): number[] {
  return [...new Set(edits.map((edit) => edit.pageNumber))].sort((left, right) => left - right);
}
