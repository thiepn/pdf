import type { NativePageObject } from "../../types/nativeEditor";

export const MAX_NATIVE_OVERLAY_HITBOXES = 800;

export interface NativeOverlayBudgetResult {
  objects: NativePageObject[];
  omitted: number;
}

/**
 * Rendering a button for every low-level path on a graphics-heavy PDF can create
 * thousands of DOM nodes in one React commit. Keep direct-canvas hit testing
 * bounded while retaining the complete native inspection in editor state.
 *
 * Selected objects always stay visible. Non-vector semantic content (text,
 * images, forms, tables, complex groups) is preferred over low-level vectors
 * when a dense page exceeds the direct-hitbox budget.
 */
export function nativeOverlayObjectsWithinBudget(
  objects: NativePageObject[],
  selectedIds: ReadonlySet<string>,
  maxHitboxes = MAX_NATIVE_OVERLAY_HITBOXES
): NativeOverlayBudgetResult {
  const safeMax = Math.max(1, Math.floor(maxHitboxes));
  if (objects.length <= safeMax) return { objects, omitted: 0 };

  const selected: NativePageObject[] = [];
  const semantic: NativePageObject[] = [];
  const vectors: NativePageObject[] = [];

  for (const object of objects) {
    if (selectedIds.has(object.id)) selected.push(object);
    else if (object.type === "vector") vectors.push(object);
    else semantic.push(object);
  }

  const budget = Math.max(safeMax, selected.length);
  const output: NativePageObject[] = [];
  output.push(...selected);

  for (const object of semantic) {
    if (output.length >= budget) break;
    output.push(object);
  }
  for (const object of vectors) {
    if (output.length >= budget) break;
    output.push(object);
  }

  return { objects: output, omitted: Math.max(0, objects.length - output.length) };
}
