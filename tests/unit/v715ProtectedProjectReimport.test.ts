import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectManifest } from "../../src/types/project";

const storage = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  put: vi.fn()
}));
const parsing = vi.hoisted(() => ({ inspect: vi.fn() }));

vi.mock("../../src/core/checksum", () => ({ sha256: vi.fn(async () => "same-encrypted-pdf") }));
vi.mock("../../src/engines/pdfjs", async (original) => ({
  ...await original<typeof import("../../src/engines/pdfjs")>(),
  inspectPdfBytes: parsing.inspect
}));
vi.mock("../../src/storage/database", async (original) => ({
  ...await original<typeof import("../../src/storage/database")>(),
  idbGetAll: storage.list,
  idbGet: storage.get,
  idbPut: storage.put
}));

const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
const existing: ProjectManifest = {
  id: "existing-encrypted-project",
  schemaVersion: 3,
  name: "protected",
  sourceFilename: "protected.pdf",
  mimeType: "application/pdf",
  byteLength: bytes.byteLength,
  checksum: "same-encrypted-pdf",
  createdAt: 1,
  updatedAt: 1,
  lastOpenedAt: 1,
  storageKind: "indexeddb",
  summary: { pageCount: 1, encrypted: true, hasOutline: false },
  recovery: { dirty: false }
};

describe("v7.1.5 protected project deduplication credential safety", () => {
  beforeEach(() => {
    storage.list.mockReset().mockResolvedValue([existing]);
    storage.get.mockReset().mockImplementation(async (name: string) =>
      name === "sourceFiles" ? { projectId: existing.id, bytes: bytes.buffer.slice(0) } : undefined
    );
    storage.put.mockReset().mockResolvedValue(undefined);
    parsing.inspect.mockReset().mockImplementation(async (_bytes: Uint8Array, password?: string) => {
      if (password !== "correct-password") throw new Error("Incorrect PDF password");
      return existing.summary;
    });
  });

  afterEach(async () => {
    const { forgetProjectSessionPassword } = await import("../../src/security/sessionPasswords");
    forgetProjectSessionPassword(existing.id);
  });

  it("does not overwrite a valid session credential or touch a saved manifest after a wrong-password reimport", async () => {
    const { rememberProjectSessionPassword, readProjectSessionPassword } = await import("../../src/security/sessionPasswords");
    const { createProjectFromBytes } = await import("../../src/projects/projectRepository");
    rememberProjectSessionPassword(existing.id, "correct-password");

    await expect(createProjectFromBytes(bytes, "protected.pdf", "application/pdf", "incorrect-password"))
      .rejects.toThrow("Incorrect PDF password");
    expect(readProjectSessionPassword(existing.id)).toBe("correct-password");
    expect(storage.put).not.toHaveBeenCalledWith("projects", expect.anything());
  });

  it("accepts a valid reimport without creating another project or losing its original identity", async () => {
    const { createProjectFromBytes } = await import("../../src/projects/projectRepository");
    const { readProjectSessionPassword } = await import("../../src/security/sessionPasswords");
    const reused = await createProjectFromBytes(bytes, "protected.pdf", "application/pdf", "correct-password");

    expect(reused.id).toBe(existing.id);
    expect(readProjectSessionPassword(existing.id)).toBe("correct-password");
    expect(parsing.inspect).toHaveBeenCalledWith(bytes, "correct-password");
  });
});
