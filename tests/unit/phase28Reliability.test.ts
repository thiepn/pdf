import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginWorkspaceHeartbeat, readInterruptedWorkspaceSession } from "../../src/recovery/sessionHeartbeat";
import { matchInterruptedTransactions } from "../../src/revisions/transactionRecovery";
import type { ProjectManifest } from "../../src/types/project";
import type { DocumentTransaction } from "../../src/types/revision";

const baseProject = (id: string, createdAt: number): ProjectManifest => ({
  schemaVersion: 3,
  id,
  name: id,
  sourceFilename: `${id}.pdf`,
  mimeType: "application/pdf",
  byteLength: 10,
  checksum: `sum-${id}`,
  createdAt,
  updatedAt: createdAt,
  lastOpenedAt: createdAt,
  storageKind: "indexeddb",
  summary: { pageCount: 1, encrypted: false, hasOutline: false },
  recovery: { dirty: false, lastValidSnapshotAt: createdAt },
  lineage: { rootProjectId: "root", parentProjectId: "parent", origin: "derived", sourceRevisionId: "source-r1" },
  revision: { id: `rev-${id}`, sequence: 1, createdAt, operation: "editor", parentRevisionId: "source-r1" }
});

const tx = (id: string, startedAt: number): DocumentTransaction => ({
  id,
  projectId: "parent",
  sourceRevisionId: "source-r1",
  operation: "editor",
  status: "preparing",
  startedAt
});

describe("Phase 28 recovery safety", () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-08T18:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

  it("keeps crash heartbeats isolated between browser tabs", () => {
    const stopA = beginWorkspaceHeartbeat("project-a", "viewer");
    const stopB = beginWorkspaceHeartbeat("project-b", "editor");
    expect(readInterruptedWorkspaceSession("project-a")?.projectId).toBe("project-a");
    expect(readInterruptedWorkspaceSession("project-b")?.projectId).toBe("project-b");
    stopA();
    expect(readInterruptedWorkspaceSession("project-a")).toBeNull();
    expect(readInterruptedWorkspaceSession("project-b")?.projectId).toBe("project-b");
    stopB();
    expect(readInterruptedWorkspaceSession()).toBeNull();
  });

  it("never assigns one derived output to two interrupted transactions", () => {
    const output = baseProject("output-1", 300);
    const matches = matchInterruptedTransactions("parent", [tx("older", 100), tx("newer", 200)], [output]);
    expect(matches).toHaveLength(2);
    expect(matches.filter((item) => item.output?.id === "output-1")).toHaveLength(1);
    expect(matches.find((item) => item.transaction.id === "newer")?.output?.id).toBe("output-1");
    expect(matches.find((item) => item.transaction.id === "older")?.output).toBeUndefined();
  });

  it("matches multiple interrupted transactions to unique compatible outputs", () => {
    const matches = matchInterruptedTransactions("parent", [tx("older", 100), tx("newer", 200)], [baseProject("one", 220), baseProject("two", 320)]);
    expect(new Set(matches.flatMap((item) => item.output ? [item.output.id] : [])).size).toBe(2);
  });
});
