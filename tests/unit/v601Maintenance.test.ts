import { describe, expect, it } from "vitest";
import { assertNonOverlappingPayloadRanges, validatePayloadRange } from "../../src/projects/packageValidation";
import { migrateProjectManifestForSchema } from "../../src/projects/projectManifestMigration";
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
  byteLength: 1, checksum: "x", createdAt: 1, updatedAt: 1, lastOpenedAt: 1, storageKind: "indexeddb",
  summary: { pageCount: 1, encrypted: false, hasOutline: false }, recovery: { dirty: false }
};

describe("v6.0.1 maintenance hardening", () => {
  it("rejects coercive or truncated package ranges", () => {
    expect(validatePayloadRange(10, 5, 10, 20, "asset")).toEqual({ start: 10, end: 15, label: "asset" });
    expect(() => validatePayloadRange("10", 5, 10, 20, "asset")).toThrow();
    expect(() => validatePayloadRange(10, "5", 10, 20, "asset")).toThrow();
    expect(() => validatePayloadRange(-1, 5, 10, 20, "asset")).toThrow();
    expect(() => validatePayloadRange(18, 5, 10, 20, "asset")).toThrow(/truncated/i);
    expect(() => validatePayloadRange(undefined, 5, 10, 20, "asset")).toThrow(/incomplete/i);
  });

  it("rejects overlapping project-package payload slices", () => {
    expect(() => assertNonOverlappingPayloadRanges([
      { start: 10, end: 15, label: "asset A" },
      { start: 14, end: 18, label: "asset B" }
    ])).toThrow(/overlaps/i);
  });

  it("rejects malformed legacy package offsets before reconstructing assets", () => {
    const header = {
      format: "local-pdf-studio-project", formatVersion: 8, exportedAt: 1, manifest, pdfByteLength: 4,
      editorAssets: [{ id: "a", name: "a.png", mimeType: "image/png", width: 1, height: 1, byteLength: 2, offset: "4", createdAt: 1 }]
    };
    expect(() => decodeProjectPackage(framedPackage(header, new Uint8Array(8)))).toThrow(/offset.*integer/i);
  });

  it("rejects overlapping ranges in decoded legacy packages", () => {
    const header = {
      format: "local-pdf-studio-project", formatVersion: 8, exportedAt: 1, manifest, pdfByteLength: 4,
      editorAssets: [
        { id: "a", name: "a.png", mimeType: "image/png", width: 1, height: 1, byteLength: 2, offset: 4, createdAt: 1 },
        { id: "b", name: "b.png", mimeType: "image/png", width: 1, height: 1, byteLength: 2, offset: 5, createdAt: 1 }
      ]
    };
    expect(() => decodeProjectPackage(framedPackage(header, new Uint8Array(8)))).toThrow(/overlaps/i);
  });

  it("never downgrades a future local project manifest", () => {
    expect(() => migrateProjectManifestForSchema({ ...manifest, schemaVersion: 4 }, 3, () => "r"))
      .toThrow(/newer PDF Studio/i);
  });

  it("keeps supported forward migration intact", () => {
    const migrated = migrateProjectManifestForSchema({ ...manifest, schemaVersion: 1 }, 3, () => "r", 100);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.revision?.id).toBe("r");
    expect(migrated.updatedAt).toBe(100);
  });
});
