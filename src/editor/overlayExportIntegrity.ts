import type { EditorExportAsset, EditorObject } from "../types/editor";

/**
 * Reject incomplete overlay exports before MuPDF writes a single annotation.
 * Hidden objects intentionally do not appear in an output PDF.
 */
export function assertOverlayExportCanPreserveObjects(
  objects: readonly EditorObject[],
  assets: readonly EditorExportAsset[],
  pageCount: number
): void {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
    throw new Error("PDF export blocked: the source document has no valid pages.");
  }
  const availableAssets = new Map(assets.map((asset) => [asset.id, asset]));
  for (const object of objects) {
    if (object.hidden) continue;
    if (!Number.isSafeInteger(object.pageNumber) || object.pageNumber < 1 || object.pageNumber > pageCount) {
      throw new Error(`PDF export blocked: “${object.type}” is assigned to page ${object.pageNumber}, but the source PDF has ${pageCount} page${pageCount === 1 ? "" : "s"}. Move or remove that placement explicitly before exporting.`);
    }
    if (object.type === "image") {
      const asset = availableAssets.get(object.assetId);
      if (!asset?.bytes?.byteLength) {
        throw new Error(`PDF export blocked: added image “${object.name}” has no stored image bytes. Restore the missing image, or explicitly remove the placement before exporting. Other edits were not discarded.`);
      }
    }
  }
}
