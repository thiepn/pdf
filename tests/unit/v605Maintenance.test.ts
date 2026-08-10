import { describe, expect, it } from "vitest";
import { assertReadableProjectManifestSchema } from "../../src/projects/projectManifestMigration";
import { decodeProjectPackage } from "../../src/projects/projectPackage";
import type { ProjectManifest } from "../../src/types/project";

function framedPackage(header: Record<string, unknown>, payload = new Uint8Array(8)): Uint8Array {
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

describe("v6.0.5 project-schema downgrade protection", () => {
  it("accepts current manifests and rejects future manifests", () => {
    expect(assertReadableProjectManifestSchema(3, 3)).toBe(3);
    expect(() => assertReadableProjectManifestSchema(4, 3)).toThrow(/newer PDF Studio/);
  });

  it("rejects a future-schema manifest embedded in an otherwise supported package", () => {
    const header = {
      format: "local-pdf-studio-project",
      formatVersion: 8,
      manifest: { ...manifest, schemaVersion: 4 },
      pdfByteLength: 4
    };
    expect(() => decodeProjectPackage(framedPackage(header))).toThrow(/newer PDF Studio/);
  });
});
