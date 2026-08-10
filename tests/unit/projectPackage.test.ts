import { describe, expect, it } from "vitest";
import { decodeProjectPackage, encodeProjectPackage, verifyProjectPackageIntegrity } from "../../src/projects/projectPackage";
import type { EditorAssetRecord } from "../../src/types/editor";
import { createEditorState } from "../../src/editor/editorModel";
import type { ProjectManifest } from "../../src/types/project";
import { createSecurityState } from "../../src/security/securityModel";

const manifest: ProjectManifest = {
  schemaVersion: 1,
  id: "test",
  name: "Test",
  sourceFilename: "test.pdf",
  mimeType: "application/pdf",
  byteLength: 4,
  checksum: "abcd",
  createdAt: 1,
  updatedAt: 1,
  lastOpenedAt: 1,
  storageKind: "indexeddb",
  summary: { pageCount: 1, encrypted: false, hasOutline: false },
  recovery: { dirty: false }
};

describe("project package", () => {
  it("round-trips manifest and PDF bytes", async () => {
    const blob = await encodeProjectPackage(manifest, new Uint8Array([37, 80, 68, 70]));
    const result = decodeProjectPackage(new Uint8Array(await blob.arrayBuffer()));
    expect(result.header.manifest.sourceFilename).toBe("test.pdf");
    expect(Array.from(result.pdfBytes)).toEqual([37, 80, 68, 70]);
  });

  it("round-trips editor state, secure settings, and binary image assets", async () => {
    const state = { ...createEditorState("test"), objects: [] };
    const security = { ...createSecurityState("test"), formValues: { customer: "Jonathan" }, encryption: { ...createSecurityState("test").encryption, mode: "aes-256" as const, userPassword: "temporary", ownerPassword: "secret" } };
    const asset: EditorAssetRecord = { id: "asset-1", projectId: "test", name: "pixel.png", mimeType: "image/png", width: 1, height: 1, byteLength: 3, bytes: new Uint8Array([7, 8, 9]).buffer, createdAt: 2 };
    const blob = await encodeProjectPackage(manifest, new Uint8Array([37, 80, 68, 70]), undefined, state, [asset], security);
    const result = decodeProjectPackage(new Uint8Array(await blob.arrayBuffer()));
    expect(result.header.formatVersion).toBe(9);
    expect(result.header.editorState?.projectId).toBe("test");
    expect(result.header.securityState?.formValues.customer).toBe("Jonathan");
    expect(result.header.securityState?.encryption.userPassword).toBe("");
    expect(result.header.securityState?.encryption.ownerPassword).toBe("");
    expect(result.assets).toHaveLength(1);
    expect(Array.from(new Uint8Array(result.assets[0].bytes))).toEqual([7, 8, 9]);
  });

  it("round-trips resumable OCR page binaries without persisting passwords", async () => {
    const ocrJob = { schemaVersion: 1, id: "job-1", kind: "pdf" as const, projectId: "test", name: "OCR", languages: ["eng"], pageNumbers: [1], preprocess: { grayscale: true, contrast: 1, brightness: 0, threshold: null, invert: false, scale: 2 }, status: "paused" as const, completedPages: 1, totalPages: 1, createdAt: 1, updatedAt: 2 };
    const ocrPage = { id: "job-1:1", jobId: "job-1", projectId: "test", pageNumber: 1, status: "complete" as const, text: "hello", confidence: 90, words: [], searchablePdf: new Uint8Array([37,80,68,70]).buffer, width: 100, height: 100, updatedAt: 2 };
    const blob = await encodeProjectPackage(manifest, new Uint8Array([37,80,68,70]), undefined, undefined, [], undefined, [ocrJob], [ocrPage]);
    const result = decodeProjectPackage(new Uint8Array(await blob.arrayBuffer()));
    expect(result.ocrJobs).toHaveLength(1);
    expect(result.ocrPages[0].text).toBe("hello");
    expect(Array.from(new Uint8Array(result.ocrPages[0].searchablePdf!))).toEqual([37,80,68,70]);
  });

  it("verifies version 9 payload and metadata integrity and rejects corruption", async () => {
    const blob = await encodeProjectPackage(manifest, new Uint8Array([37, 80, 68, 70, 45, 49]));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const decoded = decodeProjectPackage(bytes);
    await expect(verifyProjectPackageIntegrity(decoded)).resolves.toBeUndefined();
    bytes[bytes.length - 1] ^= 0xff;
    await expect(verifyProjectPackageIntegrity(decodeProjectPackage(bytes))).rejects.toThrow(/integrity/i);

    const metadataBlob = await encodeProjectPackage(manifest, new Uint8Array([37, 80, 68, 70, 45, 49]));
    const metadataBytes = new Uint8Array(await metadataBlob.arrayBuffer());
    const headerLength = new DataView(metadataBytes.buffer, metadataBytes.byteOffset + 6, 4).getUint32(0, true);
    const headerStart = 10;
    const headerText = new TextDecoder().decode(metadataBytes.slice(headerStart, headerStart + headerLength));
    const marker = '"name":"Test"';
    const markerOffset = headerText.indexOf(marker);
    expect(markerOffset).toBeGreaterThanOrEqual(0);
    const byteOffset = new TextEncoder().encode(headerText.slice(0, markerOffset + marker.indexOf("Test"))).byteLength;
    metadataBytes[headerStart + byteOffset] = "F".charCodeAt(0);
    await expect(verifyProjectPackageIntegrity(decodeProjectPackage(metadataBytes))).rejects.toThrow(/metadata integrity/i);
  });

  it("rejects invalid input", () => {
    expect(() => decodeProjectPackage(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
