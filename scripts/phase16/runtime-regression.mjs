import assert from "node:assert/strict";
import { resolveComparePagePresence } from "../../src/comparison/pagePair.ts";
import { buildOcrRecipeFingerprint } from "../../src/ocr/recipe.ts";
import { addFingerprint, aggregateCategoryFingerprints, comparePreservationGraphs, createObjectMap } from "../../src/preservation/fingerprint.ts";
import { isolateImportedEditorData } from "../../src/projects/importIsolation.ts";

const pagePair = resolveComparePagePresence(5, 7, 7);
assert.deepEqual(pagePair, { pageNumber: 7, leftPresent: false, rightPresent: true });

const preprocess = { grayscale: true, contrast: 1, brightness: 0, threshold: null, invert: false, scale: 2 };
const baseRecipe = buildOcrRecipeFingerprint({ pageNumbers: [1, 2], languages: ["eng"], preprocess });
const changedRecipe = buildOcrRecipeFingerprint({ pageNumbers: [1, 2], languages: ["eng"], preprocess: { ...preprocess, contrast: 1.2 } });
assert.notEqual(baseRecipe, changedRecipe, "OCR preprocessing changes must invalidate cached pages.");

function graph(text) {
  const objects = createObjectMap();
  addFingerprint(objects, "pages", "page:1", "612x792", 1);
  addFingerprint(objects, "text", "page:1:line:1", text, 1, text);
  return {
    graphVersion: 2,
    pageCount: 1,
    counts: { pages: 1, text: 1, images: 0, vectors: 0, fonts: 0, annotations: 0, forms: 0, links: 0, bookmarks: 0, attachments: 0, layers: 0, metadata: 0, signatures: 0, tags: 0, encryption: 0 },
    encrypted: false,
    tagged: false,
    metadata: {},
    objects,
    fingerprints: aggregateCategoryFingerprints(objects),
    warnings: []
  };
}
const preserve = Object.fromEntries(["pages", "text", "images", "vectors", "fonts", "annotations", "forms", "links", "bookmarks", "attachments", "layers", "metadata", "signatures", "tags", "encryption"].map((category) => [category, "preserve"]));
const preservation = comparePreservationGraphs("runtime-regression", preserve, graph("alpha"), graph("beta"), 0);
assert.equal(preservation.passed, false, "Same-count semantic replacement must fail preservation.");
assert.match(preservation.failures.join(" "), /text objects changed/);

const state = {
  schemaVersion: 3,
  projectId: "source",
  objects: [{ id: "image-1", type: "image", assetId: "asset-1", name: "a.png", mimeType: "image/png", intrinsicWidth: 1, intrinsicHeight: 1, preserveAspectRatio: true, altText: "", pageNumber: 1, bounds: { x0: 0, y0: 0, x1: 1, y1: 1 }, rotation: 0, opacity: 1, zIndex: 0, locked: false, hidden: false, createdAt: 1, modifiedAt: 1 }],
  currentPage: 1, zoom: 1, activeTool: "select", author: "", gridSize: 10, snapEnabled: false, showGuides: false, dirty: false, updatedAt: 1
};
const assets = [{ id: "asset-1", projectId: "source", name: "a.png", mimeType: "image/png", width: 1, height: 1, byteLength: 1, bytes: new Uint8Array([1]).buffer, createdAt: 1 }];
const isolated = isolateImportedEditorData("copy", state, assets, () => "asset-copy");
assert.equal(isolated.assets[0].id, "asset-copy");
assert.equal(isolated.assets[0].projectId, "copy");
assert.equal(isolated.state.objects[0].assetId, "asset-copy");

console.log(JSON.stringify({ passed: true, checks: 4 }, null, 2));
