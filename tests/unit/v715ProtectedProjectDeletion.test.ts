import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectManifest } from "../../src/types/project";

const db = vi.hoisted(() => ({
  get: vi.fn(),
  del: vi.fn(),
  commit: vi.fn(),
  put: vi.fn(),
  delByIndex: vi.fn()
}));
const files = vi.hoisted(() => ({ remove: vi.fn(), read: vi.fn() }));
vi.mock("../../src/storage/database", async (original) => ({
  ...await original<typeof import("../../src/storage/database")>(),
  idbGet: db.get,
  idbDelete: db.del,
  idbPut: db.put,
  idbDeleteProjectAndSource: db.commit,
  idbDeleteAllByIndex: db.delByIndex
}));
vi.mock("../../src/storage/projectFiles", async (original) => ({
  ...await original<typeof import("../../src/storage/projectFiles")>(),
  deleteProjectFiles: files.remove,
  readProjectSource: files.read
}));

vi.mock("../../src/core/checksum", () => ({ sha256: vi.fn(async () => "unit-source-checksum") }));

const ID = "v715-protected-delete";
const OTHER_ID = "v715-other-project";
const manifest = { id: ID, storageKind: "indexeddb", checksum: "unit-source-checksum", byteLength: 3 } as ProjectManifest;

describe("v7.1.5 project deletion and session credentials", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    db.get.mockImplementation(async (store: string) => store === "projects" ? manifest : undefined);
    db.del.mockResolvedValue(undefined);
    db.commit.mockResolvedValue(undefined);
    db.put.mockResolvedValue(undefined);
    db.delByIndex.mockResolvedValue(undefined);
    files.remove.mockResolvedValue(undefined);
    files.read.mockResolvedValue(Uint8Array.from([1, 2, 3]));
    const { forgetProjectSessionPassword } = await import("../../src/security/sessionPasswords");
    forgetProjectSessionPassword(ID);
    forgetProjectSessionPassword(OTHER_ID);
  });

  afterEach(async () => {
    const { forgetProjectSessionPassword } = await import("../../src/security/sessionPasswords");
    forgetProjectSessionPassword(ID);
    forgetProjectSessionPassword(OTHER_ID);
    vi.unstubAllGlobals();
  });

  it("releases only the successfully deleted project's in-memory credential", async () => {
    const { readProjectSessionPassword, rememberProjectSessionPassword } = await import("../../src/security/sessionPasswords");
    const { deleteProject } = await import("../../src/projects/projectRepository");
    rememberProjectSessionPassword(ID, "deletion-only-secret");
    rememberProjectSessionPassword(OTHER_ID, "unrelated-secret");

    await expect(deleteProject(ID)).resolves.toBeUndefined();

    expect(db.commit).toHaveBeenCalledWith(ID);
    expect(readProjectSessionPassword(ID)).toBeUndefined();
    expect(readProjectSessionPassword(OTHER_ID)).toBe("unrelated-secret");
  });

  it("preserves the project and session credential when atomic IndexedDB deletion fails", async () => {
    const { readProjectSessionPassword, rememberProjectSessionPassword } = await import("../../src/security/sessionPasswords");
    const { deleteProject } = await import("../../src/projects/projectRepository");
    rememberProjectSessionPassword(ID, "still-needed-secret");
    db.commit.mockRejectedValueOnce(new Error("IndexedDB source deletion blocked"));

    await expect(deleteProject(ID)).rejects.toThrow("IndexedDB source deletion blocked");

    expect(db.commit).toHaveBeenCalledWith(ID);
    expect(readProjectSessionPassword(ID)).toBe("still-needed-secret");
  });

  it("preserves an OPFS project's manifest and password when directory removal fails", async () => {
    vi.stubGlobal("navigator", { storage: { getDirectory: vi.fn() } });
    db.get.mockImplementation(async (store: string) =>
      store === "projects" ? { ...manifest, storageKind: "opfs" } : undefined
    );
    files.remove.mockRejectedValueOnce(new Error("OPFS directory locked"));
    const { rememberProjectSessionPassword, readProjectSessionPassword } = await import("../../src/security/sessionPasswords");
    const { deleteProject } = await import("../../src/projects/projectRepository");
    rememberProjectSessionPassword(ID, "recoverable-secret");

    await expect(deleteProject(ID)).rejects.toThrow("OPFS directory locked");

    expect(db.del).not.toHaveBeenCalledWith("projects", ID);
    expect(db.commit).not.toHaveBeenCalled();
    expect(readProjectSessionPassword(ID)).toBe("recoverable-secret");
  });
  
  it("refuses a future WorkspaceSession schema before touching OPFS source or staging any bytes", async () => {
    vi.stubGlobal("navigator", { storage: { getDirectory: vi.fn() } });
    db.get.mockImplementation(async (store: string) =>
      store === "projects" ? { ...manifest, storageKind: "opfs" } :
      store === "workspaceSessions" ? {
        id: "primary", schemaVersion: 999, tabs: [], recentlyClosed: [],
        futurePrivateMetadata: { preserve: true }
      } : undefined
    );
    const { readProjectSessionPassword, rememberProjectSessionPassword } = await import("../../src/security/sessionPasswords");
    const { deleteProject } = await import("../../src/projects/projectRepository");
    rememberProjectSessionPassword(ID, "future-state-safe-secret");

    await expect(deleteProject(ID)).rejects.toThrow("newer PDF Studio version");
    expect(files.read).not.toHaveBeenCalled();
    expect(db.put).not.toHaveBeenCalled();
    expect(files.remove).not.toHaveBeenCalled();
    expect(db.commit).not.toHaveBeenCalled();
    expect(readProjectSessionPassword(ID)).toBe("future-state-safe-secret");
  });


  it("does not destroy unowned historical records when the project manifest is absent", async () => {
    db.get.mockResolvedValue(undefined);
    const { deleteProject } = await import("../../src/projects/projectRepository");

    await expect(deleteProject(ID)).rejects.toThrow("verified project manifest");
    // A stale caller or repeated delete is not evidence that an orphan source,
    // historical checkpoint, security state or OPFS directory is disposable.
    expect(files.remove).not.toHaveBeenCalled();
    expect(db.del).not.toHaveBeenCalled();
    expect(db.delByIndex).not.toHaveBeenCalled();
    expect(db.commit).not.toHaveBeenCalled();
  });
});
