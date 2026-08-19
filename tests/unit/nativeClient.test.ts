import { describe, expect, it } from "vitest";
import { normalizeNativeEditForExport } from "../../src/native/nativeClient";
import type { NativeTextEdit } from "../../src/types/nativeEditor";

function textEdit(reflowFollower: boolean): NativeTextEdit {
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
    align: "left",
    mode: "replace",
    wrap: true,
    fontSource: "built-in",
    lineHeight: 16,
    layoutMode: "expand-flow",
    reflowFollower
  };
}

describe("P2 native export normalization", () => {
  it("preserves source line breaks for move-only reflow followers", () => {
    const queued = textEdit(true);
    const normalized = normalizeNativeEditForExport(queued) as NativeTextEdit;

    expect(normalized.wrap).toBe(false);
    expect(normalized.text).toBe(queued.text);
    expect(normalized.bounds).toEqual(queued.bounds);
    expect(queued.wrap).toBe(true);
  });

  it("does not change user-authored text replacements", () => {
    const queued = textEdit(false);
    expect(normalizeNativeEditForExport(queued)).toBe(queued);
  });
});
