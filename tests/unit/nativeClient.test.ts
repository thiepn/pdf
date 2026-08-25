import { describe, expect, it } from "vitest";
import {
  normalizeNativeEditForExport,
  prepareVectorInspectionForTableRecovery,
  reconstructInspectionWithinResponsivenessBudget,
  type TableInspection,
  type VectorInspection
} from "../../src/native/nativeClient";
import type { NativeInspection, NativeTableObject, NativeTextEdit, NativeVectorObject } from "../../src/types/nativeEditor";

function textEdit(reflowFollower: boolean, align: NativeTextEdit["align"] = "left"): NativeTextEdit {
  return {
    id: reflowFollower ? "p2-reflow:source:follower" : "source-edit",
    kind: "text",
    objectId: reflowFollower ? "follower" : "source",
    pageNumber: 1,
    originalText: "Generated validation fixture - searchable",
    text: "Generated validation fixture - searchable",
    bounds: { x: 72, y: 183, w: 242, h: 16 },
    sourceBounds: { x: 72, y: 119, w: 242, h: 16 },
    fontFamily: "Helvetica",
    fontSize: 12,
    color: "#111111",
    backgroundColor: "transparent",
    align,
    mode: "replace",
    wrap: true,
    fontSource: "built-in",
    lineHeight: 16,
    layoutMode: "expand-flow",
    reflowFollower
  };
}

describe("P2 native export normalization", () => {
  it("preserves source line breaks and left anchor for move-only reflow followers", () => {
    const queued = textEdit(true, "left");
    const normalized = normalizeNativeEditForExport(queued) as NativeTextEdit;

    expect(normalized.wrap).toBe(false);
    expect(normalized.text).toBe(queued.text);
    expect(normalized.bounds).toEqual({ x: 72, y: 183, w: 246, h: 16 });
    expect(normalized.sourceBounds).toEqual(queued.sourceBounds);
    expect(queued.wrap).toBe(true);
    expect(queued.bounds).toEqual({ x: 72, y: 183, w: 242, h: 16 });
  });

  it("preserves center and right alignment anchors while adding export tolerance", () => {
    const centered = normalizeNativeEditForExport(textEdit(true, "center")) as NativeTextEdit;
    const right = normalizeNativeEditForExport(textEdit(true, "right")) as NativeTextEdit;

    expect(centered.bounds.x + centered.bounds.w / 2).toBe(72 + 242 / 2);
    expect(right.bounds.x + right.bounds.w).toBe(72 + 242);
  });

  it("does not change user-authored text replacements", () => {
    const queued = textEdit(false);
    expect(normalizeNativeEditForExport(queued)).toBe(queued);
  });
});

describe("R10 editor responsiveness guards", () => {
  it("skips quadratic fallback table recovery on a dense vector page without discarding the actual vector inspection", () => {
    const denseVectors = Array.from({ length: 601 }, () => ({} as NativeVectorObject));
    const vector: VectorInspection = {
      pages: [{ pageNumber: 1, vectors: denseVectors, warnings: [] }],
      total: denseVectors.length,
      warnings: []
    };
    const table: TableInspection = {
      pages: [{ pageNumber: 1, tables: [], warnings: [] }],
      total: 0,
      warnings: []
    };

    const guarded = prepareVectorInspectionForTableRecovery(vector, table);

    expect(guarded.skippedPages).toEqual([1]);
    expect(guarded.vector.pages[0].vectors).toHaveLength(0);
    expect(vector.pages[0].vectors).toHaveLength(601);
  });

  it("does not spend the fallback table budget on pages already handled by the specialist table inspector", () => {
    const denseVectors = Array.from({ length: 900 }, () => ({} as NativeVectorObject));
    const vector: VectorInspection = {
      pages: [{ pageNumber: 1, vectors: denseVectors, warnings: [] }],
      total: denseVectors.length,
      warnings: []
    };
    const table: TableInspection = {
      pages: [{ pageNumber: 1, tables: [{} as NativeTableObject], warnings: [] }],
      total: 1,
      warnings: []
    };

    const guarded = prepareVectorInspectionForTableRecovery(vector, table);

    expect(guarded.skippedPages).toEqual([]);
    expect(guarded.vector.pages[0].vectors).toBe(denseVectors);
  });

  it("caps aggregate fallback pair work across a multi-page graphics-heavy document", () => {
    const pages = Array.from({ length: 5 }, (_, index) => ({
      pageNumber: index + 1,
      vectors: Array.from({ length: 500 }, () => ({} as NativeVectorObject)),
      warnings: [] as string[]
    }));
    const vector: VectorInspection = { pages, total: 2_500, warnings: [] };
    const table: TableInspection = {
      pages: pages.map((page) => ({ pageNumber: page.pageNumber, tables: [], warnings: [] })),
      total: 0,
      warnings: []
    };

    const guarded = prepareVectorInspectionForTableRecovery(vector, table);

    expect(guarded.skippedPages).toEqual([5]);
    expect(guarded.vector.pages.slice(0, 4).every((page) => page.vectors.length === 500)).toBe(true);
    expect(guarded.vector.pages[4].vectors).toHaveLength(0);
  });

  it("keeps extremely dense text pages raw instead of running unbounded paragraph reconstruction on the UI thread", () => {
    const denseText = Array.from({ length: 651 }, (_, index) => ({ id: `text-${index}`, type: "text" }));
    const inspection = {
      pages: [{ pageNumber: 1, objects: denseText }],
      totals: { text: denseText.length },
      warnings: []
    } as unknown as NativeInspection;

    const guarded = reconstructInspectionWithinResponsivenessBudget(inspection);

    expect(guarded.pages[0].objects).toHaveLength(651);
    expect(guarded.totals.text).toBe(651);
    expect(guarded.warnings.some((warning) => /responsiveness guard skipped layout-aware paragraph reconstruction/i.test(warning))).toBe(true);
  });
});
