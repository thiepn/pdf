import { describe, expect, it } from "vitest";
import { assertOverlayExportCanPreserveObjects } from "../../src/editor/overlayExportIntegrity";
import type { EditorExportAsset, EditorObject } from "../../src/types/editor";

const text = (pageNumber: number, hidden = false) =>
  ({ id: "text", type: "text", pageNumber, hidden }) as EditorObject;
const image = (hidden = false) =>
  ({ id: "image", type: "image", pageNumber: 1, hidden, assetId: "image-data", name: "diagram.png" }) as EditorObject;
const asset = (bytes: number[]) =>
  ({ id: "image-data", mimeType: "image/png", bytes: new Uint8Array(bytes) }) as EditorExportAsset;

describe("overlay PDF export integrity", () => {
  it("exports supported page placements and images with stored bytes", () => {
    const objects = [text(2), image()];
    const assets = [asset([137, 80, 78, 71])];
    expect(() => assertOverlayExportCanPreserveObjects(objects, assets, 2)).not.toThrow();
    expect(objects).toHaveLength(2);
    expect(assets[0].bytes).toHaveLength(4);
  });

  it("refuses to silently omit a visible image after asset storage loss", () => {
    expect(() => assertOverlayExportCanPreserveObjects([image()], [], 1)).toThrow(/diagram\.png.*no stored image bytes/i);
    expect(() => assertOverlayExportCanPreserveObjects([image()], [asset([])], 1)).toThrow(/no stored image bytes/);
  });

  it("refuses to silently omit edits targeting nonexistent pages", () => {
    expect(() => assertOverlayExportCanPreserveObjects([text(3)], [], 2)).toThrow(/page 3.*2 pages/);
    expect(() => assertOverlayExportCanPreserveObjects([text(0)], [], 2)).toThrow(/page 0/);
  });

  it("does not block export for intentionally hidden placements", () => {
    expect(() => assertOverlayExportCanPreserveObjects([image(true), text(99, true)], [], 1)).not.toThrow();
  });
});
