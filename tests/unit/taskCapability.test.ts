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
    sourceRedactionsChecked: false,
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
  it("blocks form filling when the PDF has no supported form fields", () => {
    const capability = evaluateTaskCapability(task("fill-forms"), context());
    expect(capability.state).toBe("unsupported-for-document");
    expect(capability.alternativeTaskId).toBe("edit-pdf");
    expect(canStartTask(capability)).toBe(false);
  });

  it("allows form filling when fields exist", () => {
    const capability = evaluateTaskCapability(task("fill-forms"), context({ project: project(1, 3) }));
    expect(capability.state).toBe("available");
    expect(canStartTask(capability)).toBe(true);
  });

  it("blocks splitting a one-page PDF and warns for a multi-page PDF", () => {
    expect(evaluateTaskCapability(task("split-pdf"), context()).state).toBe("unsupported-for-document");
    expect(evaluateTaskCapability(task("split-pdf"), context({ project: project(3) })).state).toBe("available-with-warning");
  });

  it("blocks permanent redaction only after source and editor marks are conclusively absent", () => {
    const blocked = evaluateTaskCapability(task("apply-redactions"), context({ sourceRedactionsChecked: true, sourceRedactionMarkCount: 0 }));
    expect(blocked.state).toBe("unsupported-for-document");
    expect(blocked.alternativeTaskId).toBe("mark-redaction");

    const marked = evaluateTaskCapability(task("apply-redactions"), context({ sourceRedactionsChecked: true, sourceRedactionMarkCount: 1 }));
    expect(marked.state).toBe("available-with-warning");

    const inconclusive = evaluateTaskCapability(task("apply-redactions"), context({ sourceRedactionsChecked: false }));
    expect(inconclusive.state).toBe("available-with-warning");
  });

  it("makes OCR temporarily unavailable when required browser runtime is absent", () => {
    const capability = evaluateTaskCapability(task("ocr-pdf"), context({ runtime: { worker: false, webAssembly: true } }));
    expect(capability.state).toBe("temporarily-unavailable");
    expect(canStartTask(capability)).toBe(false);
  });

  it("surfaces material-loss and certification boundaries before execution", () => {
    expect(evaluateTaskCapability(task("visual-signature"), context()).state).toBe("available-with-warning");
    expect(evaluateTaskCapability(task("crop-pages"), context()).reason).toMatch(/does not securely erase/i);
    expect(evaluateTaskCapability(task("grayscale-pdf"), context()).reason).toMatch(/rasterizes/i);
    expect(evaluateTaskCapability(task("accessibility-check"), context()).reason).toMatch(/does not claim.*PDF\/UA/i);
    expect(evaluateTaskCapability(task("archive-readiness"), context()).state).toBe("experimental");
  });
});
