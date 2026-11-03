import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectManifest } from "../../src/types/project";

const db = vi.hoisted(() => ({
  get: vi.fn(),
  del: vi.fn(),
  delByIndex: vi.fn()
}));
const files = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock("../../src/storage/database", async (original) => ({
  ...await original<typeof import("../../src/storage/database")>(),
  idbGet: db.get,
  idbDelete: db.del,
  idbDeleteAllByIndex: db.delByIndex
}));
vi.mock("../../src/storage/projectFiles", async (original) => ({
  ...await original<typeof import("../../src/storage/projectFiles")>(),
  deleteProjectFiles: files.remove
}));

const ID = "v715-protected-delete";
const OTHER_ID = "v715-other-project";
const manifest = { id: ID, storageKind: "indexeddb" } as ProjectManifest;

describe("v7.1.5 project deletion and session credentials", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    db.get.mockImplementation(async (store: string) => store === "projects" ? manifest : undefined);
    db.del.mockResolvedValue(undefined);
    db.delByIndex.mockResolvedValue(undefined);
    files.remove.mockResolvedValue(undefined);
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

    expect(db.del).toHaveBeenCalledWith("sourceFiles", ID);
    expect(db.del).toHaveBeenCalledWith("projects", ID);
    expect(readProjectSessionPassword(ID)).toBeUndefined();
    expect(readProjectSessionPassword(OTHER_ID)).toBe("unrelated-secret");
  });

  it("preserves the project and session credential when source deletion fails", async () => {
    const { readProjectSessionPassword, rememberProjectSessionPassword } = await import("../../src/security/sessionPasswords");
    const { deleteProject } = await import("../../src/projects/projectRepository");
    rememberProjectSessionPassword(ID, "still-needed-secret");
    db.del.mockImplementation(async (store: string) => {
      if (store === "sourceFiles") throw new Error("IndexedDB source deletion blocked");
    });

    await expect(deleteProject(ID)).rejects.toThrow("IndexedDB source deletion blocked");

    expect(db.del).not.toHaveBeenCalledWith("projects", ID);
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
    expect(db.del).not.toHaveBeenCalledWith("sourceFiles", ID);
    expect(readProjectSessionPassword(ID)).toBe("recoverable-secret");
  });
});
