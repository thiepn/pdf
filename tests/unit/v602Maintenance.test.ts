import { describe, expect, it } from "vitest";
import { decodeProjectPackage } from "../../src/projects/projectPackage";
import type { ProjectManifest } from "../../src/types/project";

function framedPackage(header: Record<string, unknown>, payload: Uint8Array): Uint8Array {
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

function decode(header: Record<string, unknown>) {
  return decodeProjectPackage(framedPackage(header, new Uint8Array(8)));
}

describe("v6.0.2 maintenance hardening", () => {
  it("requires every editor asset to have a concrete payload range", () => {
    expect(() => decode({
      format: "local-pdf-studio-project", formatVersion: 8, manifest, pdfByteLength: 4,
      editorAssets: [{ id: "asset", name: "asset.png", mimeType: "image/png", createdAt: 1 }]
    })).toThrow(/range is missing/i);
  });

  it("rejects non-array project-package collections", () => {
    expect(() => decode({ format: "local-pdf-studio-project", formatVersion: 8, manifest, pdfByteLength: 4, editorAssets: {} }))
      .toThrow(/editor assets must be an array/i);
    expect(() => decode({ format: "local-pdf-studio-project", formatVersion: 8, manifest, pdfByteLength: 4, ocrPages: {} }))
      .toThrow(/OCR pages must be an array/i);
    expect(() => decode({ format: "local-pdf-studio-project", formatVersion: 8, manifest, pdfByteLength: 4, ocrJobs: {} }))
      .toThrow(/OCR jobs must be an array/i);
  });

  it("rejects malformed required manifest strings before reconstruction", () => {
    expect(() => decode({ format: "local-pdf-studio-project", formatVersion: 8, manifest: { ...manifest, id: "" }, pdfByteLength: 4 }))
      .toThrow(/manifest ID must be a non-empty string/i);
    expect(() => decode({ format: "local-pdf-studio-project", formatVersion: 8, manifest: { ...manifest, name: 42 }, pdfByteLength: 4 }))
      .toThrow(/manifest name must be a non-empty string/i);
  });
});
