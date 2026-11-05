import { describe, expect, it } from "vitest";
import { shouldSerializeSpecialistInspection } from "../../src/native/nativeClientBase";
import type { NativeInspection } from "../../src/types/nativeEditor";

function sampleInspection(vectorCounts: number[]): NativeInspection {
  return {
    pages: vectorCounts.map((count, index) => ({
      pageNumber: index + 1,
      objects: Array.from({ length: count }, (_, objectIndex) => ({
        id: `vector-${index}-${objectIndex}`,
        type: "vector",
        pageNumber: index + 1
      }))
    }))
  } as unknown as NativeInspection;
}

describe("native specialist worker concurrency policy", () => {
  it("retains concurrent inspection on ordinary PDFs", () => {
    expect(shouldSerializeSpecialistInspection(sampleInspection([0, 12, 49]))).toBe(false);
  });

  it("serializes workers after the capped base inspector hits 50 vectors on a page", () => {
    expect(shouldSerializeSpecialistInspection(sampleInspection([50]))).toBe(true);
    expect(shouldSerializeSpecialistInspection(sampleInspection([1, 50, 1]))).toBe(true);
  });

  it("does not mistake many ordinary pages for one unusually dense page", () => {
    expect(shouldSerializeSpecialistInspection(sampleInspection([30, 30]))).toBe(false);
  });
});
