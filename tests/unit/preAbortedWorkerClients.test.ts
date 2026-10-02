import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectCompliance, applyCompliance } from "../../src/compliance/complianceClient";
import { buildSearchablePdf } from "../../src/creator/creatorClient";
import { inspectPreservationGraph } from "../../src/preservation/preservationClient";
import { inspectProfessionalPdf } from "../../src/professional/professionalClient";
import type { ComplianceOptions } from "../../src/types/compliance";
import type { CreatorBuildRequest } from "../../src/types/creator";
import nativeClientSource from "../../src/native/nativeClient.ts?raw";

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
});
