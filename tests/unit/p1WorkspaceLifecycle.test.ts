import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(new URL("../../src/workspace/UnifiedWorkspace.tsx", import.meta.url), "utf8");
const leaseSource = readFileSync(new URL("../../src/projects/projectLease.ts", import.meta.url), "utf8");

describe("Recovery P1 workspace lifecycle architecture", () => {
  it("loads document modes lazily inside the persistent workspace shell", () => {
    expect(workspaceSource).toContain('lazy(() => import("../views/ViewerPage")');
    expect(workspaceSource).toContain('lazy(() => import("../views/EditorPage")');
    expect(workspaceSource).toContain('lazy(() => import("../views/OrganizerPage")');
    expect(workspaceSource).toContain('lazy(() => import("../views/DocumentToolsPage")');
    expect(workspaceSource).not.toMatch(/import\s+\{\s*ViewerPage\s*\}\s+from\s+"\.\.\/views\/ViewerPage"/);
    expect(workspaceSource).not.toMatch(/import\s+\{\s*EditorPage\s*\}\s+from\s+"\.\.\/views\/EditorPage"/);
  });

  it("does not couple project initialization to mode changes or eager timeline refresh", () => {
    expect(workspaceSource).not.toContain("setProject(null)");
    expect(workspaceSource).not.toContain("readWorkspaceSession");
    expect(workspaceSource).toContain("if (session?.timelineOpen");
    expect(workspaceSource).toContain("void ensureTimeline()");
  });

  it("represents lease negotiation separately from confirmed read-only state", () => {
    expect(leaseSource).toContain('export type ProjectLeaseMode = "acquiring" | "owner" | "read-only"');
    expect(leaseSource).toContain('let mode: ProjectLeaseMode = "acquiring"');
    expect(workspaceSource).toContain('useState<ProjectLeaseMode>("acquiring")');
    expect(workspaceSource).toContain('leaseMode === "acquiring"');
    expect(workspaceSource).toContain('leaseMode === "read-only" && modeRequiresOwnership');
  });
});
