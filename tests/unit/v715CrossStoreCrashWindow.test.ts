import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectManifest } from "../../src/types/project";

const sim = vi.hoisted(() => ({
  get: vi.fn(), put: vi.fn(), del: vi.fn(), commit: vi.fn(), delByIndex: vi.fn(),
  opfsRead: vi.fn(), opfsDelete: vi.fn()
}));
vi.mock("../../src/storage/database", async original => ({
  ...await original<typeof import("../../src/storage/database")>(),
  idbGet: sim.get,
  idbPut: sim.put,
  idbDeleteProjectAndSource: sim.commit,
  idbDelete: sim.del,
  idbDeleteAllByIndex: sim.delByIndex
}));
vi.mock("../../src/storage/projectFiles", async original => ({
  ...await original<typeof import("../../src/storage/projectFiles")>(),
  readProjectSource: sim.opfsRead,
  deleteProjectFiles: sim.opfsDelete
}));

const id = "crash-window-existing-opfs";
const original = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 55, 10, 79, 80, 70, 83]);
const manifest = {
  id, storageKind: "opfs", checksum: "preserved-source-checksum",
  byteLength: original.byteLength, schemaVersion: 3, name: "recoverable",
  sourceFilename: "recoverable.pdf", mimeType: "application/pdf",
  createdAt: 1, updatedAt: 1, lastOpenedAt: 1,
  summary: { pageCount: 1, encrypted: false, hasOutline: false },
  recovery: { dirty: false }
} as ProjectManifest;

describe("OPFS/IndexedDB deletion interruption recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("navigator", { storage: { getDirectory: vi.fn() } });
    let opfsExists = true;
    const records = new Map<string, unknown>([["projects:" + id, manifest]]);
    sim.get.mockImplementation(async (store: string, key: string) => records.get(store + ":" + key));
    sim.put.mockImplementation(async (store: string, value: { id?: string; projectId?: string }) => {
      records.set(store + ":" + (value.id ?? value.projectId), value);
    });
    sim.del.mockImplementation(async (store: string, key: string) => { records.delete(store + ":" + key); });
    sim.commit.mockRejectedValue(new Error("Synthetic IndexedDB project deletion rejected"));
    sim.delByIndex.mockResolvedValue(undefined);
    sim.opfsRead.mockImplementation(async () => {
      if (!opfsExists) throw new DOMException("Original PDF no longer exists", "NotFoundError");
      return original.slice();
    });
    sim.opfsDelete.mockImplementation(async () => { opfsExists = false; });
  });

  it("retains a durably readable source after OPFS deletion but an IndexedDB manifest failure", async () => {
    const { deleteProject, loadProjectBytes } = await import("../../src/projects/projectRepository");
    await expect(deleteProject(id)).rejects.toThrow("Synthetic IndexedDB project deletion rejected");
    const surviving = await sim.get("projects", id) as ProjectManifest;
    expect(surviving).toBeDefined();
    // A visible surviving manifest must never reference missing PDF bytes.
    await expect(loadProjectBytes(surviving)).resolves.toEqual(original);
  });
});
