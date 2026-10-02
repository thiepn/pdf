import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectProfessionalPdf } from "../../src/professional/professionalClient";
import visualSource from "../../src/comparison/visualDiffClient.ts?raw";
import complianceSource from "../../src/compliance/complianceClient.ts?raw";
import preservationSource from "../../src/preservation/preservationClient.ts?raw";
import professionalSource from "../../src/professional/professionalClient.ts?raw";

class FakeWorker {
  static latest: FakeWorker | null = null;
  static throwOnPost = false;

  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn(() => {
    if (FakeWorker.throwOnPost) throw new Error("dispatch failed");
  });
  terminate = vi.fn();

  constructor() {
    FakeWorker.latest = this;
  }

  emitMessageError(): void {
    this.onmessageerror?.({} as MessageEvent);
  }
}

describe("direct-response worker cleanup", () => {
  beforeEach(() => {
    FakeWorker.latest = null;
    FakeWorker.throwOnPost = false;
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects and terminates if the initial worker dispatch throws", async () => {
    FakeWorker.throwOnPost = true;

    await expect(
      inspectProfessionalPdf(new Uint8Array([1, 2, 3]))
    ).rejects.toThrow("dispatch failed");

    expect(FakeWorker.latest?.terminate).toHaveBeenCalledOnce();
  });

  it("rejects unreadable responses and releases the worker", async () => {
    const promise = inspectProfessionalPdf(new Uint8Array([1, 2, 3]));
    const assertion = expect(promise).rejects.toThrow("unreadable response");

    FakeWorker.latest?.emitMessageError();
    await assertion;

    expect(FakeWorker.latest?.terminate).toHaveBeenCalledOnce();
  });

  it("still rejects cancellation when the worker can no longer accept CANCEL", async () => {
    const controller = new AbortController();
    const promise = inspectProfessionalPdf(new Uint8Array([1, 2, 3]), undefined, controller.signal);
    const worker = FakeWorker.latest;

    FakeWorker.throwOnPost = true;
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(worker?.terminate).toHaveBeenCalledOnce();
  });

  it("applies direct-message cleanup to every audited worker family", () => {
    for (const source of [visualSource, complianceSource, preservationSource, professionalSource]) {
      expect(source).toContain("worker.onmessageerror");
      expect(source).toContain("try");
      expect(source).toContain("worker.postMessage");
      expect(source).toContain("worker.terminate()");
    }
  });
});
