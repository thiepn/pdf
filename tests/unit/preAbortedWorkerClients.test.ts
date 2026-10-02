import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectCompliance, applyCompliance } from "../../src/compliance/complianceClient";
import { buildSearchablePdf } from "../../src/creator/creatorClient";
import { inspectPreservationGraph } from "../../src/preservation/preservationClient";
import { inspectProfessionalPdf } from "../../src/professional/professionalClient";
import type { ComplianceOptions } from "../../src/types/compliance";
import type { CreatorBuildRequest } from "../../src/types/creator";
import nativeClientSource from "../../src/native/nativeClient.ts?raw";
import nativeClientBaseSource from "../../src/native/nativeClientBase.ts?raw";
import visualDiffSource from "../../src/comparison/visualDiffClient.ts?raw";
import editorExportSource from "../../src/editor/editorExportClient.ts?raw";
import securityClientSource from "../../src/security/securityClient.ts?raw";

const workerConstructed = vi.fn();

class FakeWorker {
  constructor() {
    workerConstructed();
  }
  postMessage() {}
  terminate() {}
}

function abortedSignal(): AbortSignal {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
}

describe("pre-aborted worker clients", () => {
  beforeEach(() => {
    workerConstructed.mockClear();
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not start Compliance inspection work after cancellation", async () => {
    await expect(
      inspectCompliance(new Uint8Array([1, 2, 3]), undefined, abortedSignal())
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(workerConstructed).not.toHaveBeenCalled();
  });

  it("does not fetch archival assets or start Compliance export work after cancellation", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      applyCompliance(
        new Uint8Array([1, 2, 3]),
        {
          prepareArchival: true,
          archivalLevel: "PDF/A-2b",
          addOutputIntent: true
        } as ComplianceOptions,
        undefined,
        abortedSignal()
      )
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(workerConstructed).not.toHaveBeenCalled();
  });

  it("does not start Creator work after cancellation", async () => {
    await expect(
      buildSearchablePdf({} as CreatorBuildRequest, abortedSignal())
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(workerConstructed).not.toHaveBeenCalled();
  });

  it("does not start Preservation work after cancellation", async () => {
    await expect(
      inspectPreservationGraph(new Uint8Array([1, 2, 3]), undefined, abortedSignal())
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(workerConstructed).not.toHaveBeenCalled();
  });

  it("does not start Professional work after cancellation", async () => {
    await expect(
      inspectProfessionalPdf(new Uint8Array([1, 2, 3]), undefined, abortedSignal())
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(workerConstructed).not.toHaveBeenCalled();
  });

  it("rejects Native inspection before creating cache/session work", () => {
    const functionStart = nativeClientSource.indexOf("export async function inspectNativePdf");
    const guard = nativeClientSource.indexOf("if (signal?.aborted) throw abortError();", functionStart);
    const cacheLookup = nativeClientSource.indexOf("inspectionsByBytes.get(bytes)", functionStart);

    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThan(functionStart);
    expect(cacheLookup).toBeGreaterThan(guard);
  });

  it("places remaining pre-abort guards before worker construction or native worker calls", () => {
    const visualStart = visualDiffSource.indexOf("export function runVisualDiff");
    expect(visualDiffSource.indexOf("if (signal?.aborted)", visualStart)).toBeLessThan(
      visualDiffSource.indexOf("new Worker", visualStart)
    );

    const editorStart = editorExportSource.indexOf("async function exportOverlayPdf");
    expect(editorExportSource.indexOf("if (signal?.aborted)", editorStart)).toBeLessThan(
      editorExportSource.indexOf("new Worker", editorStart)
    );

    const securityStart = securityClientSource.indexOf("function runWorker");
    expect(securityClientSource.indexOf("if (signal?.aborted)", securityStart)).toBeLessThan(
      securityClientSource.indexOf("new Worker", securityStart)
    );

    const nativeInspectStart = nativeClientBaseSource.indexOf("export async function inspectNativePdf");
    expect(nativeClientBaseSource.indexOf("if (signal?.aborted)", nativeInspectStart)).toBeLessThan(
      nativeClientBaseSource.indexOf("nativeWorker()", nativeInspectStart)
    );

    const nativeApplyStart = nativeClientBaseSource.indexOf("export async function applyNativeEdits");
    expect(nativeClientBaseSource.indexOf("if (signal?.aborted)", nativeApplyStart)).toBeLessThan(
      nativeClientBaseSource.indexOf("nativeWorker()", nativeApplyStart)
    );
  });
});
