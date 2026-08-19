import type { NativeEdit } from "../types/nativeEditor";

/**
 * Return the first queued edit that would make a new P2 reflow plan stale.
 * Re-queuing the same source paragraph is allowed to reuse its own deterministic
 * follower edits; a paragraph already owned by another reflow, or any foreign
 * edit on a downstream follower, must be resolved first because both plans were
 * computed from the original inspection geometry.
 */
export function findNativeReflowQueueConflict(current: NativeEdit[], sourceObjectId: string, followerObjectIds: string[]): NativeEdit | undefined {
  const ownPrefix = `p2-reflow:${sourceObjectId}:`;
  const selectedForeignFollower = current.find((edit) => edit.objectId === sourceObjectId
    && edit.kind === "text"
    && Boolean(edit.reflowFollower)
    && !edit.id.startsWith(ownPrefix));
  if (selectedForeignFollower) return selectedForeignFollower;

  const followerIds = new Set(followerObjectIds);
  return current.find((edit) => followerIds.has(edit.objectId) && !edit.id.startsWith(ownPrefix));
}

/**
 * Merge edits by detected source object. Most source objects have one queued edit;
 * tables have one edit per cell and are replaced as an object-level batch.
 *
 * P2 layout-aware text edits also own deterministic follower edits whose ids begin
 * with `p2-reflow:<sourceObjectId>:`. Re-queueing or discarding the source edit
 * removes its previous follower set first, so shortening a paragraph cannot leave
 * stale downstream moves in the saved queue.
 */
export function mergeNativeEdits(current: NativeEdit[], incoming: NativeEdit[]): NativeEdit[] {
  if (!incoming.length) return current;
  const objectIds = new Set(incoming.map((edit) => edit.objectId));
  const reflowPrefixes = incoming
    .filter((edit) => edit.kind === "text" && !edit.reflowFollower)
    .map((edit) => `p2-reflow:${edit.objectId}:`);
  const retained = current.filter((existing) => {
    if (reflowPrefixes.some((prefix) => existing.id.startsWith(prefix))) return false;
    if (!objectIds.has(existing.objectId)) return true;
    return false;
  });
  return [...retained, ...incoming];
}

export function discardNativeObjectEdits(current: NativeEdit[], objectId: string): NativeEdit[] {
  const reflowPrefix = `p2-reflow:${objectId}:`;
  return current.filter((edit) => edit.objectId !== objectId && !edit.id.startsWith(reflowPrefix));
}

export function nativeChangedPages(edits: NativeEdit[]): number[] {
  return [...new Set(edits.map((edit) => edit.pageNumber))].sort((left, right) => left - right);
}
