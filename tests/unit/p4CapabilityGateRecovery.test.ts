import { describe, expect, it } from "vitest";
import gateSource from "../../src/capabilities/CapabilityGatedWorkspace.tsx?raw";
import securityClientSource from "../../src/security/securityClient.ts?raw";

describe("Recovery P4 capability gate decoupling", () => {
  it("keeps a safe Read workspace mounted while task preflight is pending", () => {
    expect(gateSource).toContain('capability-gated-workspace--checking');
    expect(gateSource).toContain('<UnifiedWorkspace mode="viewer"');
    expect(gateSource).toContain("You can keep reading or switch tools while this local check finishes.");
  });

  it("preserves the deep fail-closed capability gate before protected tasks mount", () => {
    expect(gateSource).toContain("buildTaskCapabilityContext(projectId, { inspectSecurity: true })");
    expect(gateSource).toContain("if (task && capability && !canStartTask(capability))");
    expect(gateSource).toContain("<TaskCapabilityBlocker");
    expect(gateSource).toContain("<UnifiedWorkspace mode={mode}");
  });

  it("reuses completed security inspection and cancels unused pending inspection", () => {
    expect(securityClientSource).toContain("WeakMap<Uint8Array, Map<string, InspectionEntry>>");
    expect(securityClientSource).toContain("security.inspection.session.hit");
    expect(securityClientSource).toContain("security.inspection.session.miss");
    expect(securityClientSource).toContain("maybeAbortUnused");
    expect(securityClientSource).toContain("entry.controller.abort()");
    expect(securityClientSource).toContain("current.settled = true");
  });

  it("does not cache security transformations", () => {
    const applyStart = securityClientSource.indexOf("export async function applySecurity");
    expect(applyStart).toBeGreaterThanOrEqual(0);
    const applySource = securityClientSource.slice(applyStart);
    expect(applySource).toContain('type: "APPLY_SECURITY"');
    expect(applySource).toContain("return runWorker");
    expect(applySource).not.toContain("inspectionsByBytes");
  });
});
