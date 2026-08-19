import { describe, expect, it } from "vitest";
import { normalizeNativeEditForExport } from "../../src/native/nativeClient";
import type { NativeTextEdit } from "../../src/types/nativeEditor";

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
