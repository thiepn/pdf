import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectCompliance } from "../../src/compliance/complianceClient";
import { buildSearchablePdf } from "../../src/creator/creatorClient";
import { inspectPreservationGraph } from "../../src/preservation/preservationClient";
import { inspectProfessionalPdf } from "../../src/professional/professionalClient";
import type { CreatorBuildRequest } from "../../src/types/creator";

class FakeWorker {
  static latest: FakeWorker | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    FakeWorker.latest = this;
  }
}

describe("worker message lifecycle", () => {
  beforeEach(() => {
    FakeWorker.latest = null;
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects unreadable Compliance responses and terminates the worker", async () => {
    const promise = inspectCompliance(new Uint8Array([1, 2, 3]));
    FakeWorker.latest?.onmessageerror?.({} as MessageEvent);

    await expect(promise).rejects.toThrow("Compliance worker returned an unreadable response.");
    expect(FakeWorker.latest?.terminate).toHaveBeenCalledOnce();
  });

  it("rejects unreadable Preservation responses and terminates the worker", async () => {
    const promise = inspectPreservationGraph(new Uint8Array([1, 2, 3]));
    FakeWorker.latest?.onmessageerror?.({} as MessageEvent);

    await expect(promise).rejects.toThrow("Preservation worker returned an unreadable response.");
    expect(FakeWorker.latest?.terminate).toHaveBeenCalledOnce();
  });

  it("rejects unreadable Professional responses and terminates the worker", async () => {
    const promise = inspectProfessionalPdf(new Uint8Array([1, 2, 3]));
    FakeWorker.latest?.onmessageerror?.({} as MessageEvent);

    await expect(promise).rejects.toThrow("Professional worker returned an unreadable response.");
    expect(FakeWorker.latest?.terminate).toHaveBeenCalledOnce();
  });

  it("rejects unreadable Creator responses and terminates the worker", async () => {
    const promise = buildSearchablePdf({} as CreatorBuildRequest);
    FakeWorker.latest?.onmessageerror?.({} as MessageEvent);

    await expect(promise).rejects.toThrow("PDF creator worker returned an unreadable response.");
    expect(FakeWorker.latest?.terminate).toHaveBeenCalledOnce();
  });

  it("cleans up when Compliance postMessage throws synchronously", async () => {
    const worker = new FakeWorker();
    worker.postMessage.mockImplementation(() => {
      throw new Error("postMessage failed");
    });
    vi.stubGlobal("Worker", class {
      onmessage = worker.onmessage;
      onmessageerror = worker.onmessageerror;
      onerror = worker.onerror;
      postMessage = worker.postMessage;
      terminate = worker.terminate;
    });

    await expect(inspectCompliance(new Uint8Array([1, 2, 3]))).rejects.toThrow("postMessage failed");
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
