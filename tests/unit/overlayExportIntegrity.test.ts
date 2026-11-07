import { describe, expect, it } from "vitest";
import { assertOverlayExportCanPreserveObjects, validatedInternalPageTarget, validatedWebLinkTarget } from "../../src/editor/overlayExportIntegrity";
import type { EditorExportAsset, EditorObject } from "../../src/types/editor";

const text = (pageNumber: number, hidden = false) =>
  ({ id: "text", type: "text", pageNumber, hidden }) as EditorObject;
const image = (hidden = false) =>
  ({ id: "image", type: "image", pageNumber: 1, hidden, assetId: "image-data", name: "diagram.png" }) as EditorObject;
const asset = (bytes: number[]) =>
  ({ id: "image-data", mimeType: "image/png", bytes: Uint8Array.from(bytes).buffer }) satisfies EditorExportAsset;
const link = (target: string, hidden = false) =>
  ({ id: "web-link", type: "link", targetType: "url", target, pageNumber: 1, hidden }) as EditorObject;
const pageLink = (target: string, hidden = false) =>
  ({ id: "page-link", type: "link", targetType: "page", target, pageNumber: 1, hidden }) as EditorObject;

describe("overlay PDF export integrity", () => {
  it("exports supported page placements and images with stored bytes", () => {
    const objects = [text(2), image()];
    const assets = [asset([137, 80, 78, 71])];
    expect(() => assertOverlayExportCanPreserveObjects(objects, assets, 2)).not.toThrow();
    expect(objects).toHaveLength(2);
    expect(assets[0].bytes.byteLength).toBe(4);
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

  it("exports ordinary HTTP(S) web links with normalized safe targets", () => {
    expect(validatedWebLinkTarget("https://example.org/report.pdf?q=1")).toBe("https://example.org/report.pdf?q=1");
    expect(validatedWebLinkTarget("http://example.org")).toBe("http://example.org/");
    expect(() => assertOverlayExportCanPreserveObjects([link("https://example.org")], [], 1)).not.toThrow();
  });

  it("refuses unsafe or malformed PDF URI actions without discarding other edits", () => {
    for (const target of [
      "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,hello",
      "file:///private/report.pdf", "blob:https://example.org/id", "ftp://example.org",
      "//example.org/path", "https://", "https://trusted.example\\@attacker.example",
      "https://example.org\nlogin", "http://[bad"
    ]) {
      expect(() => assertOverlayExportCanPreserveObjects([text(1), link(target)], [], 1))
        .toThrow(/PDF export blocked: web links must use a valid http:\/\/ or https:\/\/ URL/);
    }
  });

  it("exports only exact, in-range internal page destinations", () => {
    expect(validatedInternalPageTarget("2", 3)).toBe(2);
    expect(validatedInternalPageTarget(" 3 ", 3)).toBe(3);
    expect(() => assertOverlayExportCanPreserveObjects([text(1), pageLink("2")], [], 3)).not.toThrow();
  });

  it("blocks internal page links that would silently point to the wrong PDF page", () => {
    for (const target of ["", "0", "999", "not-a-page", "2.5", "-1", "1e0", "Infinity", "NaN"]) {
      expect(() => assertOverlayExportCanPreserveObjects([text(1), pageLink(target)], [], 3))
        .toThrow(/page links require an integer destination from 1 to 3/);
    }
    expect(() => assertOverlayExportCanPreserveObjects([pageLink("3")], [], 2))
      .toThrow(/from 1 to 2/);
  });

  it("does not export hidden invalid page links or mutate their stored targets", () => {
    const hidden = pageLink("999", true);
    expect(() => assertOverlayExportCanPreserveObjects([text(1), hidden], [], 3)).not.toThrow();
    expect(hidden.target).toBe("999");
  });

  it("ignores intentionally hidden unsafe links and preserves unrelated objects", () => {
    expect(() => assertOverlayExportCanPreserveObjects([text(1), link("javascript:alert(1)", true)], [], 1)).not.toThrow();
  });
});
