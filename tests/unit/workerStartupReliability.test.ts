import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSearchablePdf } from "../../src/creator/creatorClient";
import { WORKER_STARTUP_TIMEOUT_MS } from "../../src/workers/workerReliability";
import type { CreatorBuildRequest } from "../../src/types/creator";
import creatorSource from "../../src/creator/creatorClient.ts?raw";
import editorSource from "../../src/editor/editorExportClient.ts?raw";
import nativeSource from "../../src/native/nativeClientBase.ts?raw";
import securitySource from "../../src/security/securityClient.ts?raw";
import processingSource from "../../src/processing/processingClient.ts?raw";
import toolboxSource from "../../src/toolbox/toolboxClient.ts?raw";
import pageOperationsSource from "../../src/tools/pageOperationsClient.ts?raw";

class SilentWorker {
  static latest: SilentWorker | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    SilentWorker.latest = this;
  }

  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitMessageError(): void {
    this.onmessageerror?.({} as MessageEvent);
  }
}

describe("worker startup reliability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    SilentWorker.latest = null;
    vi.stubGlobal("Worker", SilentWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fails Creator startup instead of leaving a promise pending forever", async () => {
    const promise = buildSearchablePdf({} as CreatorBuildRequest);
    const assertion = expect(promise).rejects.toThrow("PDF creator engine could not start");

    await vi.advanceTimersByTimeAsync(WORKER_STARTUP_TIMEOUT_MS);
    await assertion;

    expect(SilentWorker.latest?.postMessage).not.toHaveBeenCalled();
    expect(SilentWorker.latest?.terminate).toHaveBeenCalledOnce();
  });

  it("clears the startup deadline after READY and permits a long operation", async () => {
    const promise = buildSearchablePdf({} as CreatorBuildRequest);
    const worker = SilentWorker.latest;
    expect(worker).not.toBeNull();

    worker?.emit({ type: "READY" });
    const request = worker?.postMessage.mock.calls[0]?.[0] as { requestId?: string; type?: string } | undefined;
    expect(request?.type).toBe("CREATE");

    await vi.advanceTimersByTimeAsync(WORKER_STARTUP_TIMEOUT_MS * 2);
    expect(worker?.terminate).not.toHaveBeenCalled();

    worker?.emit({
      type: "CREATOR_RESULT",
      requestId: request?.requestId,
      output: new ArrayBuffer(0),
      report: {}
    });

    await expect(promise).resolves.toMatchObject({ bytes: expect.any(Uint8Array) });
    expect(worker?.terminate).toHaveBeenCalledOnce();
  });

  it("rejects unreadable Creator responses and releases the worker", async () => {
    const promise = buildSearchablePdf({} as CreatorBuildRequest);
    const assertion = expect(promise).rejects.toThrow("unreadable response");

    SilentWorker.latest?.emitMessageError();
    await assertion;

    expect(SilentWorker.latest?.terminate).toHaveBeenCalledOnce();
  });

  it("applies the shared startup budget to every READY-handshake client", () => {
    for (const source of [creatorSource, editorSource, nativeSource, securitySource]) {
      expect(source).toContain("WORKER_STARTUP_TIMEOUT_MS");
      expect(source).toContain("clearTimeout(startupTimeout)");
    }

    expect(creatorSource).toContain("worker.onmessageerror");
    expect(editorSource).toContain("worker.onmessageerror");
    expect(nativeSource).toContain("worker.onmessageerror");
    expect(securitySource).toContain("worker.onmessageerror");
  });

  it("keeps the established processing engines on the same shared budget", () => {
    for (const source of [processingSource, toolboxSource, pageOperationsSource]) {
      expect(source).toContain("WORKER_STARTUP_TIMEOUT_MS");
      expect(source).not.toContain("}, 45_000);");
    }
  });
});
