import { describe, expect, it } from "vitest";
import gateSource from "../../src/capabilities/CapabilityGatedWorkspace.tsx?raw";
import taskCapabilitySource from "../../src/capabilities/taskCapability.ts?raw";
import securityClientSource from "../../src/security/securityClient.ts?raw";
import securityWorkerEntrySource from "../../src/workers/security-entry.worker.ts?raw";

describe("Recovery P4 capability gate decoupling", () => {
  it("keeps one safe workspace mounted while task preflight hands off to the requested tool", () => {
    expect(gateSource).toContain('capability-gated-workspace--checking');
    expect(gateSource).toContain('key="workspace" mode={checking ? "viewer" : mode}');
    expect(gateSource).toContain('key="gate-status"');
    expect(gateSource).toContain("You can keep reading while this local check finishes.");
  });

  it("preserves the deep fail-closed capability gate before protected tasks mount", () => {
    expect(gateSource).toContain("taskNeedsDeepSecurityInspection(task)");
    expect(gateSource).toContain("inspectSecurity: true");
    expect(gateSource).toContain("signal: preflight.signal");
    expect(gateSource).toContain("if (task && capability && !canStartTask(capability))");
    expect(gateSource).toContain("<TaskCapabilityBlocker");
    expect(taskCapabilitySource).toContain("SECURITY_PREFLIGHT_TIMEOUT_MS = 15_000");
    expect(taskCapabilitySource).toContain("signal?: AbortSignal");
  });

  it("retains completed security inspection reuse for Protect itself", () => {
    expect(securityClientSource).toContain("WeakMap<Uint8Array, Map<string, InspectionEntry>>");
    expect(securityClientSource).toContain("security.inspection.session.hit");
    expect(securityClientSource).toContain("security.inspection.session.miss");
    expect(securityClientSource).toContain("maybeAbortUnused");
    expect(securityClientSource).toContain("entry.controller.abort()");
    expect(securityClientSource).toContain("current.settled = true");
    expect(gateSource).toContain("preflight.abort(new DOMException");
  });

  it("waits for MuPDF worker initialization before transferring security input", () => {
    expect(securityClientSource).toContain('event.data.type === "READY"');
    expect(securityClientSource).toContain('security-entry.worker.ts');
    expect(securityClientSource).toContain('worker.postMessage({ ...message, bytes: source }, [source])');
    expect(securityWorkerEntrySource).toContain('import "./security.worker"');
    expect(securityWorkerEntrySource).toContain('self.postMessage({ type: "READY" })');
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
