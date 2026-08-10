import { describe, expect, it } from "vitest";
import { decodeProjectPackage } from "../../src/projects/projectPackage";
import type { ProjectManifest } from "../../src/types/project";

function framedPackage(header: Record<string, unknown>, payload = new Uint8Array(32)): Uint8Array {
  const magic = new TextEncoder().encode("LPSP1\0");
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const output = new Uint8Array(10 + headerBytes.byteLength + payload.byteLength);
  output.set(magic, 0);
  new DataView(output.buffer).setUint32(6, headerBytes.byteLength, true);
  output.set(headerBytes, 10);
  output.set(payload, 10 + headerBytes.byteLength);
  return output;
}

const manifest: ProjectManifest = {
  schemaVersion: 3, id: "p", name: "Project", sourceFilename: "p.pdf", mimeType: "application/pdf",
  byteLength: 4, checksum: "x", createdAt: 1, updatedAt: 1, lastOpenedAt: 1, storageKind: "indexeddb",
  summary: { pageCount: 1, encrypted: false, hasOutline: false }, recovery: { dirty: false }
};

function base(extra: Record<string, unknown> = {}) {
  return { format: "local-pdf-studio-project", formatVersion: 8, manifest, pdfByteLength: 4, ...extra };
}

describe("v6.0.3 package semantic consistency", () => {
  it("rejects duplicate asset IDs and missing image asset references", () => {
    const asset = { id: "a", name: "a.png", mimeType: "image/png", width: 1, height: 1, byteLength: 2, offset: 4, createdAt: 1 };
    expect(() => decodeProjectPackage(framedPackage(base({ editorAssets: [asset, { ...asset, offset: 6 }] })))).toThrow(/duplicated/i);
    expect(() => decodeProjectPackage(framedPackage(base({
      editorAssets: [asset],
      editorState: { schemaVersion: 1, projectId: "p", objects: [{ id: "img", type: "image", assetId: "missing" }], updatedAt: 1 }
    })))).toThrow(/missing asset/i);
  });

  it("rejects duplicate OCR jobs and orphan/duplicate OCR pages", () => {
    const job = { schemaVersion: 2, id: "job", kind: "pdf", name: "OCR", languages: ["eng"], pageNumbers: [1], preprocess: { grayscale: true, contrast: 1, brightness: 0, threshold: null, invert: false, scale: 2 }, status: "paused", completedPages: 0, totalPages: 1, createdAt: 1, updatedAt: 1 };
    expect(() => decodeProjectPackage(framedPackage(base({ ocrJobs: [job, { ...job }] })))).toThrow(/OCR job ID.*duplicated/i);
    const page = { id: "x", jobId: "missing", pageNumber: 1, status: "complete", text: "", confidence: 1, words: [], width: 1, height: 1, updatedAt: 1 };
    expect(() => decodeProjectPackage(framedPackage(base({ ocrJobs: [job], ocrPages: [page] })))).toThrow(/references missing job/i);
    const validPage = { ...page, jobId: "job" };
    expect(() => decodeProjectPackage(framedPackage(base({ ocrJobs: [job], ocrPages: [validPage, { ...validPage, id: "y" }] })))).toThrow(/OCR page.*duplicated/i);
  });
});
