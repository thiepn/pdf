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

export interface ObservedImageInstance {
  bounds: NativeRect;
  /** From independent MuPDF graphics-device and XObject inspection. */
  masked: boolean;
}

/**
 * Verify unchanged masked-image siblings with distinct after-export matches.
 * A single output image must never satisfy two original image instances, even
 * if the PDF places two invocations at identical coordinates.
 *
 * This is intentionally stricter than a count of PDF Do operators: a stream
 * can contain four Do instructions but render only two images or lose /SMask.
 */
export function requirePreservedImageSiblings(
  originals: readonly ObservedImageInstance[],
  output: readonly ObservedImageInstance[],
  selectedSource: NativeRect,
  selectedDestination: NativeRect,
  tolerance = 4
): void {
  if (!originals.length || !output.length) {
    throw new Error("Image fidelity validation failed: graphics-device evidence is missing.");
  }
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error("Image fidelity validation failed: invalid image tolerance.");
  }
  const untouched = originals.filter(({ bounds }) => {
    const x0 = Math.max(bounds.x, selectedSource.x);
    const y0 = Math.max(bounds.y, selectedSource.y);
    const x1 = Math.min(bounds.x + bounds.w, selectedSource.x + selectedSource.w);
    const y1 = Math.min(bounds.y + bounds.h, selectedSource.y + selectedSource.h);
    const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    const smallest = Math.max(1, Math.min(bounds.w * bounds.h, selectedSource.w * selectedSource.h));
    return intersection / smallest < 0.5;
  });
  if (output.length < originals.length) {
    throw new Error(`Image fidelity validation failed: expected ${originals.length} rendered instances but found ${output.length}.`);
  }
  const originalMasked = originals.filter(instance => instance.masked).length;
  const outputMasked = output.filter(instance => instance.masked).length;
  if (outputMasked < originalMasked) {
    throw new Error(`Image fidelity validation failed: attached soft masks disappeared (expected ${originalMasked}; observed ${outputMasked}).`);
  }
  // Bipartite match rather than checking each original independently with
  // Array.some(), which could silently reuse one surviving sibling twice.
  // Reserve the edited image itself: otherwise a moved target that overlaps an
  // untouched sibling could count both as the edited image and a surviving
  // sibling. This reservation must be backed by a real masked output paint.
  const destinationMatches = output.flatMap((image, index) =>
    image.masked && imageBoxDistance(image.bounds, selectedDestination) <= tolerance
      ? [{ index, distance: imageBoxDistance(image.bounds, selectedDestination) }]
      : []).sort((a, b) => a.distance - b.distance || a.index - b.index);
  if (!destinationMatches.length) {
    throw new Error("Image fidelity validation failed: transformed source image or its attached soft mask is missing.");
  }
  const selectedOutputIndex = destinationMatches[0].index;
  const assignedToOriginal = new Map<number, number>();
  const visit = (source: number, used: Set<number>): boolean => {
    const from = untouched[source];
    const candidates = output.flatMap((image, index) =>
      image.masked === from.masked && imageBoxDistance(image.bounds, from.bounds) <= tolerance
        ? [{ index, distance: imageBoxDistance(image.bounds, from.bounds) }]
        : []).sort((a, b) => a.distance - b.distance || a.index - b.index);
    for (const { index } of candidates) {
      if (index === selectedOutputIndex || used.has(index)) continue;
      used.add(index);
      const previous = assignedToOriginal.get(index);
      if (previous === undefined || visit(previous, used)) {
        assignedToOriginal.set(index, source);
        return true;
      }
    }
    return false;
  };
  for (let index = 0; index < untouched.length; index++) {
    if (!visit(index, new Set<number>())) {
      throw new Error(`Image fidelity validation failed: an untouched image instance changed position, lost its mask, or disappeared (sibling ${index + 1} of ${untouched.length}).`);
    }
  }
}
