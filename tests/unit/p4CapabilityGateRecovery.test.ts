import { describe, expect, it } from "vitest";
import gateSource from "../../src/capabilities/CapabilityGatedWorkspace.tsx?raw";
import taskCapabilitySource from "../../src/capabilities/taskCapability.ts?raw";
import securityClientSource from "../../src/security/securityClient.ts?raw";
import securityIdentitySource from "../../src/security/securityInspectionIdentity.ts?raw";
import securityWorkerEntrySource from "../../src/workers/security-entry.worker.ts?raw";

describe("Recovery P4 capability gate decoupling", () => {
  it("keeps one safe workspace mounted while task preflight hands off to the requested tool", () => {
    expect(gateSource).toContain('capability-gated-workspace--checking');
    expect(gateSource).toMatch(/<UnifiedWorkspace key="workspace"[^>]+mode=\{checking \? "viewer" : mode\}/);
    expect(gateSource).toContain("taskId={checking ? undefined : taskId}");
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

  it("reuses equivalent immutable bytes for Protect and bounds completed inspection identities", () => {
    expect(securityIdentitySource).toContain("WeakMap<Uint8Array, Promise<string>>");
    expect(securityClientSource).toContain("Map<string, Map<string, InspectionEntry>>");
    expect(securityIdentitySource).toContain('subtle.digest("SHA-256"');
    expect(securityIdentitySource).toContain('name: "HMAC"');
    expect(securityIdentitySource).toContain('subtle.sign("HMAC"');
    expect(securityIdentitySource).toContain("protected-uncached");
    expect(securityClientSource).not.toContain("protected:${password}");
    expect(securityClientSource).toContain("securityInspectionCredentialIdentity(password)");
    expect(securityClientSource).toContain("MAX_INSPECTION_IDENTITIES");
    expect(securityClientSource).toContain("evictSettledIdentities");
    expect(securityClientSource).toContain("security.inspection.session.hit");
    expect(securityClientSource).toContain("security.inspection.session.miss");
    expect(securityClientSource).toContain("maybeAbortUnused");
    expect(securityClientSource).toContain("entry.controller.abort()");
    expect(securityClientSource).toContain("current.settled = true");
    expect(gateSource).toContain("preflight.abort(new DOMException");

    expect(securityClientSource).toContain("if (credential.cacheable)");
    expect(securityClientSource).toContain("const cachedSessions = inspectionsByIdentity.get(identity)");
    expect(securityClientSource).toContain("touchIdentity(identity, sessions)");
    expect(securityClientSource).toContain("sessions = new Map()");
    expect(securityClientSource).toContain("credential.cacheable ? sessions.get(key) : undefined");
    expect(securityClientSource).toContain("Protected inspection caching fails closed");
    expect(securityClientSource).toMatch(/if \(credential\.cacheable\) \{[\s\S]*?sessions\.set\(key, current\);[\s\S]*?evictSettledIdentities\(\);[\s\S]*?\}/);
    expect(securityClientSource).toContain("security.inspection.session.miss");
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
    expect(applySource).not.toContain("inspectionsByIdentity");
  });
});
