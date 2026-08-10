import { describe, expect, it } from "vitest";
import { isolateImportedEditorData } from "../../src/projects/importIsolation";
import type { EditorAssetRecord, EditorDocumentState, ImageEditorObject } from "../../src/types/editor";

function image(assetId: string): ImageEditorObject {
  return {
    id: "image-1", type: "image", assetId, name: "logo.png", mimeType: "image/png",
    intrinsicWidth: 10, intrinsicHeight: 10, preserveAspectRatio: true, altText: "",
    pageNumber: 1, bounds: { x0: 0, y0: 0, x1: 10, y1: 10 }, rotation: 0,
    opacity: 1, zIndex: 1, locked: false, hidden: false, createdAt: 1, modifiedAt: 1
  };
}

it("remaps globally keyed editor assets for every imported project", () => {
  const state = {
    schemaVersion: 3, projectId: "source", objects: [image("asset-1")], currentPage: 1,
    zoom: 1, activeTool: "select", author: "", gridSize: 10, snapEnabled: false,
    showGuides: false, dirty: false, updatedAt: 1
  } satisfies EditorDocumentState;
  const assets: EditorAssetRecord[] = [{
    id: "asset-1", projectId: "source", name: "logo.png", mimeType: "image/png", width: 10,
    height: 10, byteLength: 1, bytes: new Uint8Array([1]).buffer, createdAt: 1
  }];
  let next = 0;
  const isolated = isolateImportedEditorData("restored", state, assets, () => `new-${++next}`);
  expect(isolated.assets[0].id).toBe("new-1");
  expect(isolated.assets[0].projectId).toBe("restored");
  expect(isolated.state?.projectId).toBe("restored");
  expect(isolated.state?.objects[0].type).toBe("image");
  expect((isolated.state?.objects[0] as ImageEditorObject).assetId).toBe("new-1");
});
