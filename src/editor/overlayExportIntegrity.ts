import type { EditorExportAsset, EditorObject } from "../types/editor";

const INVALID_WEB_LINK_MESSAGE = "PDF export blocked: web links must use a valid http:// or https:// URL. Edit or remove the link before exporting; other edits are retained.";

/** Web links are PDF URI actions; never embed arbitrary schemes in output PDFs. */
export function validatedWebLinkTarget(rawTarget: string): string {
  if (/[\u0000-\u001f\u007f\\]/u.test(rawTarget)) throw new Error(INVALID_WEB_LINK_MESSAGE);
  const target = rawTarget.trim();
  if (!/^https?:\/\//i.test(target)) throw new Error(INVALID_WEB_LINK_MESSAGE);
  let url: URL;
  try { url = new URL(target); } catch { throw new Error(INVALID_WEB_LINK_MESSAGE); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) throw new Error(INVALID_WEB_LINK_MESSAGE);
  return url.href;
}

/** A page link must not silently resolve to a different page in the saved PDF. */
export function validatedInternalPageTarget(rawTarget: string, pageCount: number): number {
  const target = rawTarget.trim();
  const page = Number(target);
  if (!/^\d+$/.test(target) || !Number.isSafeInteger(page) || page < 1 || page > pageCount) {
    throw new Error(`PDF export blocked: page links require an integer destination from 1 to ${pageCount}. Correct the link before exporting; other edits are retained.`);
  }
  return page;
}

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
    if (object.type === "link" && object.targetType === "url") validatedWebLinkTarget(object.target);
    if (object.type === "link" && object.targetType === "page") validatedInternalPageTarget(object.target, pageCount);
    if (object.type === "image") {
      const asset = availableAssets.get(object.assetId);
      if (!asset?.bytes?.byteLength) {
        throw new Error(`PDF export blocked: added image “${object.name}” has no stored image bytes. Restore the missing image, or explicitly remove the placement before exporting. Other edits were not discarded.`);
      }
    }
  }
}
