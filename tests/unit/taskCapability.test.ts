import { describe, expect, it } from "vitest";
import { getTask } from "../../src/ia/taskCatalog";
import { canStartTask, evaluateTaskCapability, type TaskCapabilityContext } from "../../src/capabilities/taskCapability";
import type { ProjectManifest } from "../../src/types/project";

function project(pageCount = 1, formFieldCount = 0): ProjectManifest {
  return {
    schemaVersion: 3,
    id: "p1",
    name: "Fixture",
    sourceFilename: "fixture.pdf",
    mimeType: "application/pdf",
    byteLength: 1024,
    checksum: "abc",
    createdAt: 1,
    updatedAt: 1,
    lastOpenedAt: 1,
    storageKind: "indexeddb",
    summary: { pageCount, encrypted: false, hasOutline: false, formFieldCount },
    recovery: { dirty: false }
  };
}

function context(overrides: Partial<TaskCapabilityContext> = {}): TaskCapabilityContext {
  return {
    project: project(),
    editorRedactionMarkCount: 0,
    securityEvidenceChecked: false,
    runtime: { worker: true, webAssembly: true },
    ...overrides
  };
}

function task(id: string) {
  const value = getTask(id);
  if (!value) throw new Error(`Missing task ${id}`);
  return value;
}

describe("R4 task capability preflight", () => {
  it("blocks form filling when the PDF has no form widgets", () => {
    const capability = evaluateTaskCapability(task("fill-forms"), context());
    expect(capability.state).toBe("unsupported-for-document");
    expect(capability.alternativeTaskId).toBe("edit-pdf");
    expect(canStartTask(capability)).toBe(false);
  });

  it("blocks form filling when widgets exist but deep inspection finds nothing writable", () => {
    const capability = evaluateTaskCapability(task("fill-forms"), context({
      project: project(1, 3),
      securityEvidenceChecked: true,
      securityEvidence: { fillableFormFieldCount: 0, redactionMarkCount: 0, flattenableObjectCount: 2 }
    }));
    expect(capability.state).toBe("unsupported-for-document");
    expect(capability.reason).toMatch(/none are supported writable fields/i);
  });

  it("allows form filling when a writable field exists", () => {
    const capability = evaluateTaskCapability(task("fill-forms"), context({
      project: project(1, 3),
      securityEvidenceChecked: true,
      securityEvidence: { fillableFormFieldCount: 2, redactionMarkCount: 0, flattenableObjectCount: 3 }
    }));
    expect(capability.state).toBe("available");
    expect(canStartTask(capability)).toBe(true);
  });

  it("blocks splitting a one-page PDF and warns for a multi-page PDF", () => {
    expect(evaluateTaskCapability(task("split-pdf"), context()).state).toBe("unsupported-for-document");
    expect(evaluateTaskCapability(task("split-pdf"), context({ project: project(3) })).state).toBe("available-with-warning");
  });

  it("blocks permanent redaction only after deep evidence and editor marks are conclusively absent", () => {
    const blocked = evaluateTaskCapability(task("apply-redactions"), context({
      securityEvidenceChecked: true,
      securityEvidence: { fillableFormFieldCount: 0, redactionMarkCount: 0, flattenableObjectCount: 0 }
    }));
    expect(blocked.state).toBe("unsupported-for-document");
    expect(blocked.alternativeTaskId).toBe("mark-redaction");
    expect(blocked.reason).toBe("No saved editor redaction marks or existing PDF redaction annotations were found.");

    const marked = evaluateTaskCapability(task("apply-redactions"), context({
      securityEvidenceChecked: true,
      securityEvidence: { fillableFormFieldCount: 0, redactionMarkCount: 1, flattenableObjectCount: 1 }
    }));
    expect(marked.state).toBe("available-with-warning");

    const inconclusive = evaluateTaskCapability(task("apply-redactions"), context({ securityEvidenceChecked: false }));
    expect(inconclusive.state).toBe("available-with-warning");
  });

  it("blocks flatten when deep inspection finds no supported forms or annotations", () => {
    const capability = evaluateTaskCapability(task("flatten-pdf"), context({
      securityEvidenceChecked: true,
      securityEvidence: { fillableFormFieldCount: 0, redactionMarkCount: 0, flattenableObjectCount: 0 }
    }));
    expect(capability.state).toBe("unsupported-for-document");
    expect(capability.reason).toMatch(/No supported non-signature form fields or page annotations/i);
  });

  it("warns when flattening has something supported to flatten", () => {
    const capability = evaluateTaskCapability(task("flatten-pdf"), context({
      securityEvidenceChecked: true,
      securityEvidence: { fillableFormFieldCount: 1, redactionMarkCount: 0, flattenableObjectCount: 2 }
    }));
    expect(capability.state).toBe("available-with-warning");
  });

  it("makes OCR and Protect tasks temporarily unavailable when required browser runtime is absent", () => {
    expect(evaluateTaskCapability(task("ocr-pdf"), context({ runtime: { worker: false, webAssembly: true } })).state).toBe("temporarily-unavailable");
    const protect = evaluateTaskCapability(task("sanitize-pdf"), context({ runtime: { worker: true, webAssembly: false } }));
    expect(protect.state).toBe("temporarily-unavailable");
    expect(canStartTask(protect)).toBe(false);
  });

  it("surfaces material-loss and certification boundaries before execution", () => {
    expect(evaluateTaskCapability(task("visual-signature"), context()).state).toBe("available-with-warning");
    expect(evaluateTaskCapability(task("apply-redactions"), { ...context(), project: undefined }).state).toBe("available-with-warning");
    expect(evaluateTaskCapability(task("crop-pages"), context()).reason).toMatch(/does not securely erase/i);
    expect(evaluateTaskCapability(task("grayscale-pdf"), context()).reason).toMatch(/rasterizes/i);
    expect(evaluateTaskCapability(task("accessibility-check"), context()).reason).toMatch(/does not claim.*PDF\/UA/i);
    expect(evaluateTaskCapability(task("archive-readiness"), context()).state).toBe("experimental");
  });
});
