import type { NativeInspection, NativePageObject, NativePageTree } from "../types/nativeEditor";

const pageByObject = new WeakMap<object, NativePageTree>();

/**
 * Ephemeral UI-only association between reconstructed inspection objects and the
 * page that owns them. Nothing is serialized or persisted, and object identity
 * prevents collisions between two open PDFs whose generated object ids match.
 */
export function registerNativeInspectionPages(inspection: NativeInspection): NativeInspection {
  for (const page of inspection.pages) for (const object of page.objects) pageByObject.set(object, page);
  return inspection;
}

export function pageForNativeObject(object: NativePageObject): NativePageTree | undefined {
  return pageByObject.get(object);
}
