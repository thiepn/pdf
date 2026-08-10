import * as mupdf from "mupdf";

interface OpenProbeRequest {
  type: "OPEN_PROBE";
  requestId: string;
  bytes: ArrayBuffer;
}

interface CancelRequest {
  type: "CANCEL";
  requestId: string;
}

type Request = OpenProbeRequest | CancelRequest;

const cancelled = new Set<string>();

function assertActive(requestId: string): void {
  if (cancelled.has(requestId)) {
    throw new DOMException("Operation cancelled.", "AbortError");
  }
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "CANCEL") {
    cancelled.add(request.requestId);
    return;
  }

  const startedAt = performance.now();
  try {
    assertActive(request.requestId);
    const document = mupdf.Document.openDocument(request.bytes, "application/pdf");
    try {
      assertActive(request.requestId);
      const pageCount = document.countPages();
      const isPdf = document.isPDF();
      const format = document.getMetaData("format") ?? "unknown";
      const title = document.getMetaData("info:Title") ?? "";

      let firstPageText = "";
      let firstPageBounds: number[] | null = null;
      if (pageCount > 0) {
        const page = document.loadPage(0);
        try {
          firstPageBounds = Array.from(page.getBounds());
          const text = page.toStructuredText();
          try {
            firstPageText = text.asText().slice(0, 4000);
          } finally {
            text.destroy();
          }
        } finally {
          page.destroy();
        }
      }

      assertActive(request.requestId);
      const pdf = document.asPDF();
      if (!pdf) throw new Error("MuPDF did not recognize the opened document as a PDF.");
      const canSaveIncrementally = pdf.canBeSavedIncrementally();
      const saved = pdf.saveToBuffer("garbage=2,compress=yes");
      let output: Uint8Array;
      try {
        output = new Uint8Array(saved.asUint8Array());
      } finally {
        saved.destroy();
      }

      const outputBuffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
      self.postMessage(
        {
          type: "PROBE_RESULT",
          requestId: request.requestId,
          result: {
            pageCount,
            isPdf,
            format,
            title,
            firstPageText,
            firstPageBounds,
            canSaveIncrementally,
            inputBytes: request.bytes.byteLength,
            outputBytes: output.byteLength,
            durationMs: performance.now() - startedAt
          },
          output: outputBuffer
        },
        [outputBuffer]
      );
    } finally {
      document.destroy();
    }
  } catch (error) {
    self.postMessage({
      type: "PROBE_ERROR",
      requestId: request.requestId,
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { name: "UnknownError", message: String(error) }
    });
  } finally {
    cancelled.delete(request.requestId);
  }
};

export {};
