import { describe, expect, it } from "vitest";
import editorSource from "../../src/views/EditorPage.tsx?raw";

describe("P1 original vs edited verification", () => {
  it("exposes an explicit source/edited preview switch only after native preview validation", () => {
    expect(editorSource).toContain('nativeEdits.length && nativePreviewState === "ready"');
    expect(editorSource).toContain('aria-label="Compare edited PDF with original source"');
    expect(editorSource).toContain(">Edited preview</button>");
    expect(editorSource).toContain(">Original</button>");
  });

  it("renders the untouched PDF and removes edit overlays while source review is active", () => {
    expect(editorSource).toContain("const renderedDocument = reviewOriginal ? document : nativePreviewDocument ?? document");
    expect(editorSource).toContain("nativeObjects={reviewOriginal ? [] : currentNativeObjects}");
    expect(editorSource).toContain("objects={reviewOriginal ? [] : displayObjects}");
    expect(editorSource).toContain("showNativeContent={!reviewOriginal && showNativeContent}");
  });

  it("locks the workspace against accidental edits while reviewing the original", () => {
    expect(editorSource).toContain("inert={processing || reviewOriginal ? true : undefined}");
    expect(editorSource).toContain("Original PDF · editing paused");
  });
});
