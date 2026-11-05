import { describe, expect, it } from "vitest";
import { readOnlyDenseInspection, readOnlyIncompleteInspection, requiresReadOnlyDenseInspection, shouldSerializeSpecialistInspection } from "../../src/native/nativeClientBase";
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

describe("dense source-stream fail-closed inspection", () => {
  it("recognizes multi-stream vector density even when the legacy scanner saw no rectangles", () => {
    const sample = sampleInspection([0]);
    sample.pages[0].contentStreamCount = 1601;
    expect(requiresReadOnlyDenseInspection(sample)).toBe(true);
    sample.pages[0].contentStreamCount = 1;
    sample.pages[0].sourceRectCount = 601;
    expect(requiresReadOnlyDenseInspection(sample)).toBe(true);
    sample.pages[0].sourceRectCount = 50;
    expect(requiresReadOnlyDenseInspection(sample)).toBe(false);
  });

  it("keeps recognized text searchable but blocks native source modification", () => {
    const sample = sampleInspection([0]);
    sample.canEdit = true;
    sample.pages[0].objects = [{
      id: "page-1-text", type: "text", pageNumber: 1, text: "SEARCHABLE",
      editability: "fixed-box",
      capability: { level: "safe-reconstruction", reason: "test", label: "text", confidence: 1, preserves: [], risks: [] }
    }, { id: "image-1", type: "image", pageNumber: 1 }] as any;
    const safe = readOnlyDenseInspection(sample);
    expect(safe.canEdit).toBe(false);
    expect(safe.pages[0].objects.map((object) => object.type)).toEqual(["text"]);
    expect(safe.pages[0].objects[0]).toMatchObject({ editability: "unsupported", text: "SEARCHABLE", capability: { level: "unsupported" } });
    expect(safe.warnings).toEqual(expect.arrayContaining([expect.stringContaining("Dense PDF safeguard")]));
  });
});

describe("partial native-inspection recovery", () => {
  it("makes text discoverable but never grants edits after a specialist worker fails", () => {
    const inspection = sampleInspection([0]);
    inspection.canEdit = true;
    inspection.pages[0].objects = [
      { id: "t", type: "text", text: "FINDABLE", pageNumber: 1, editability: "fixed-box",
        capability: { level: "safe-reconstruction", label: "text", confidence: 1, reason: "source", preserves: [], risks: [] } },
      { id: "vector", type: "vector", pageNumber: 1 }
    ] as any;
    const fallback = readOnlyIncompleteInspection(inspection);
    expect(fallback.canEdit).toBe(false);
    expect(fallback.pages[0].objects).toHaveLength(1);
    expect(fallback.pages[0].objects[0]).toMatchObject({ type: "text", text: "FINDABLE", editability: "unsupported", capability: { level: "unsupported" } });
    expect(fallback.warnings).toEqual(expect.arrayContaining([expect.stringContaining("Incomplete PDF inspection:")]));
    expect(inspection.canEdit).toBe(true);
  });
});
