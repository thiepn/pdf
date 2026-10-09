import type { NativeImageFidelityClass, NativeRect } from "../types/nativeEditor";

/**
 * A masked image may appear with different geometry or coverage in MuPDF's
 * structured-text JSON and graphics-device painting trace. Never mix one
 * enumeration source at input with the other at output when validating that
 * sibling instances stayed in place.
 *
 * Refuse a masked comparison when no device evidence exists; the caller must
 * not fall back to the unrelated structured-text coordinate source.
 */
export function imagePreservationBaseline(
  classification: NativeImageFidelityClass | undefined,
  structuredRects: NativeRect[],
  deviceRects: NativeRect[]
): NativeRect[] {
  if (classification !== "masked") return structuredRects;
  if (!deviceRects.length) {
    throw new Error("Masked image preservation evidence is unavailable; the original PDF must remain unchanged.");
  }
  return deviceRects;
}

/** Coordinate-stable squared-off image box distance (unchanged from P17). */
export function imageBoxDistance(a: NativeRect, b: NativeRect): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
    + Math.abs(a.w - b.w) + Math.abs(a.h - b.h);
}
