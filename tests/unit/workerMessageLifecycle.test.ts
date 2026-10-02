import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectCompliance } from "../../src/compliance/complianceClient";
import { buildSearchablePdf } from "../../src/creator/creatorClient";
import { inspectPreservationGraph } from "../../src/preservation/preservationClient";
import { inspectProfessionalPdf } from "../../src/professional/professionalClient";
import type { CreatorBuildRequest } from "../../src/types/creator";
import visualDiffSource from "../../src/comparison/visualDiffClient.ts?raw";
import editorExportSource from "../../src/editor/editorExportClient.ts?raw";
import nativeClientBaseSource from "../../src/native/nativeClientBase.ts?raw";
import processingClientSource from "../../src/processing/processingClient.ts?raw";
import securityClientSource from "../../src/security/securityClient.ts?raw";
import toolboxClientSource from "../../src/toolbox/toolboxClient.ts?raw";
import pageOperationsSource from "../../src/tools/pageOperationsClient.ts?raw";

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

  it("hardens all remaining worker clients against unreadable responses and postMessage failures", () => {
    const contracts = [
      [visualDiffSource, "Visual comparison worker returned an unreadable response."],
      [editorExportSource, "Editor export worker returned an unreadable response."],
      [nativeClientBaseSource, "Native editor worker returned an unreadable response."],
      [processingClientSource, "The processing engine returned an unreadable response."],
      [securityClientSource, "Security worker returned an unreadable response."],
      [toolboxClientSource, "The toolbox engine returned an unreadable response."],
      [pageOperationsSource, "The page engine returned an unreadable response."]
    ] as const;

    for (const [source, unreadableMessage] of contracts) {
      expect(source).toContain("onmessageerror");
      expect(source).toContain(unreadableMessage);
      expect(source).toContain("catch (reason)");
      expect(source).toContain("terminate()");
    }
  });

  it("keeps the page-operation READY branch syntactically structured around one guarded postMessage", () => {
    expect(pageOperationsSource).toContain('if (event.data.type === "READY")');
    expect(pageOperationsSource).toContain("try {");
    expect(pageOperationsSource).toContain("worker.postMessage({ ...payload, requestId }, transfers)");
    expect(pageOperationsSource).toContain("} catch (reason) {");
    expect(pageOperationsSource).toContain("fail(reason)");
  });
});
