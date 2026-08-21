import { describe, expect, it } from "vitest";
import { decodeProjectPackage, encodeProjectPackage, verifyProjectPackageIntegrity } from "../../src/projects/projectPackage";
import { APP_VERSION, PROJECT_PACKAGE_VERSION, SUPPORTED_PROJECT_PACKAGE_VERSIONS } from "../../src/core/release";
import type { ProjectManifest, ProjectPackageHeader } from "../../src/types/project";

const MAGIC = new TextEncoder().encode("LPSP1\0");
function legacyPackage(formatVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, payload: Uint8Array): Uint8Array {
  const manifest: ProjectManifest = {
    schemaVersion: 1, id: `legacy-${formatVersion}`, name: "Legacy", sourceFilename: "legacy.pdf", mimeType: "application/pdf",
    byteLength: payload.byteLength, checksum: "legacy", createdAt: 1, updatedAt: 1, lastOpenedAt: 1, storageKind: "indexeddb",
    summary: { pageCount: 1, encrypted: false, hasOutline: false }, recovery: { dirty: false }
  };
  const header: ProjectPackageHeader = {
    format: "local-pdf-studio-project", formatVersion, exportedAt: 1, manifest,
    ...(formatVersion === 1 ? {} : { pdfByteLength: payload.byteLength })
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, headerBytes.byteLength, true);
  const result = new Uint8Array(MAGIC.byteLength + length.byteLength + headerBytes.byteLength + payload.byteLength);
  let offset = 0;
  for (const part of [MAGIC, length, headerBytes, payload]) { result.set(part, offset); offset += part.byteLength; }
  return result;
}

const manifest: ProjectManifest = {
  schemaVersion: 3, id: "phase30", name: "Phase 30", sourceFilename: "phase30.pdf", mimeType: "application/pdf",
  byteLength: 4, checksum: "test", createdAt: 1, updatedAt: 1, lastOpenedAt: 1, storageKind: "indexeddb",
  summary: { pageCount: 1, encrypted: false, hasOutline: false }, recovery: { dirty: false },
  lineage: { rootProjectId: "phase30", origin: "import" }, revision: { id: "r1", sequence: 0, createdAt: 1, operation: "source-import" }
};

describe("Phase 30 release freeze", () => {
  it("keeps the qualified release line and project package v9", () => {
    expect(APP_VERSION).toMatch(/^[67]\.\d+\.\d+$/);
    expect(PROJECT_PACKAGE_VERSION).toBe(9);
    expect([...SUPPORTED_PROJECT_PACKAGE_VERSIONS]).toEqual([1,2,3,4,5,6,7,8,9]);
  });

  it("decodes legacy package formats 1 through 8", () => {
    const payload = new Uint8Array([37, 80, 68, 70]);
    for (const version of [1,2,3,4,5,6,7,8] as const) {
      const decoded = decodeProjectPackage(legacyPackage(version, payload));
      expect(decoded.header.formatVersion).toBe(version);
      expect(Array.from(decoded.pdfBytes)).toEqual(Array.from(payload));
    }
  });

  it("writes and verifies current v9 backups", async () => {
    const blob = await encodeProjectPackage(manifest, new Uint8Array([37,80,68,70]));
    const decoded = decodeProjectPackage(new Uint8Array(await blob.arrayBuffer()));
    expect(decoded.header.formatVersion).toBe(9);
    await expect(verifyProjectPackageIntegrity(decoded)).resolves.toBeUndefined();
    expect(decoded.header.integrity?.metadataChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects future package versions instead of guessing", () => {
    const payload = new Uint8Array([37,80,68,70]);
    const bytes = legacyPackage(8, payload);
    const headerLength = new DataView(bytes.buffer, 6, 4).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(bytes.slice(10, 10 + headerLength)));
    header.formatVersion = 10;
    const headerBytes = new TextEncoder().encode(JSON.stringify(header));
    const length = new Uint8Array(4); new DataView(length.buffer).setUint32(0, headerBytes.byteLength, true);
    const future = new Uint8Array(6 + 4 + headerBytes.byteLength + payload.byteLength);
    future.set(MAGIC, 0); future.set(length, 6); future.set(headerBytes, 10); future.set(payload, 10 + headerBytes.byteLength);
    expect(() => decodeProjectPackage(future)).toThrow(/Unsupported project package version/);
  });
});
