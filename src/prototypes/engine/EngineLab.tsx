import { useRef, useState } from "react";
import { Panel } from "../../components/Panel";
import { createMinimalPdf } from "../../fixtures/minimalPdf";
import { extractPageText, openPdfWithPdfJs } from "../../engines/pdfjs";
import { validatePdfBytes, type PdfByteValidation } from "../../validation/pdfValidator";

interface ProbeResult {
  pageCount: number;
  isPdf: boolean;
  format: string;
  title: string;
  firstPageText: string;
  firstPageBounds: number[] | null;
  canSaveIncrementally: boolean;
  inputBytes: number;
  outputBytes: number;
  durationMs: number;
}

interface ProbeState {
  filename: string;
  status: "idle" | "running" | "passed" | "failed" | "cancelled";
  result?: ProbeResult;
  validation?: PdfByteValidation;
  reopen?: {
    pageCount: number;
    firstPageText: string;
    pageCountMatches: boolean;
    textMatches: boolean;
  };
  error?: string;
}

export function EngineLab() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const outputRef = useRef<Uint8Array | null>(null);
  const [state, setState] = useState<ProbeState>({ filename: "No document", status: "idle" });

  async function runProbe(bytes: Uint8Array, filename: string): Promise<void> {
    workerRef.current?.terminate();
    const worker = new Worker(new URL("../../workers/mupdf.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    outputRef.current = null;
    setState({ filename, status: "running" });

    worker.onmessage = (event: MessageEvent) => {
      void (async () => {
        if (event.data.requestId !== requestId) return;
        try {
          if (event.data.type === "PROBE_RESULT") {
            const result = event.data.result as ProbeResult;
            const output = new Uint8Array(event.data.output as ArrayBuffer);
            outputRef.current = output;
            const validation = validatePdfBytes(output);
            const reopened = await openPdfWithPdfJs(output);
            try {
              const firstPageText = reopened.numPages > 0 ? await extractPageText(reopened, 1) : "";
              const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
              const reopen = {
                pageCount: reopened.numPages,
                firstPageText,
                pageCountMatches: reopened.numPages === result.pageCount,
                textMatches: normalize(firstPageText) === normalize(result.firstPageText)
              };
              setState({
                filename,
                status: validation.valid && reopen.pageCountMatches ? "passed" : "failed",
                result,
                validation,
                reopen
              });
            } finally {
              await reopened.loadingTask.destroy();
            }
          } else if (event.data.type === "PROBE_ERROR") {
            setState({ filename, status: "failed", error: event.data.error?.message ?? "Unknown worker error." });
          }
        } catch (reopenError) {
          setState({
            filename,
            status: "failed",
            error: reopenError instanceof Error ? reopenError.message : String(reopenError)
          });
        } finally {
          worker.terminate();
          workerRef.current = null;
          requestIdRef.current = null;
        }
      })();
    };

    worker.onerror = (event) => {
      setState({ filename, status: "failed", error: event.message });
      worker.terminate();
      workerRef.current = null;
      requestIdRef.current = null;
    };

    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    worker.postMessage({ type: "OPEN_PROBE", requestId, bytes: buffer }, [buffer]);
  }

  async function onFile(file: File | undefined): Promise<void> {
    if (!file) return;
    await runProbe(new Uint8Array(await file.arrayBuffer()), file.name);
  }

  function cancel(): void {
    const worker = workerRef.current;
    const requestId = requestIdRef.current;
    if (worker && requestId) {
      worker.postMessage({ type: "CANCEL", requestId });
      worker.terminate();
    }
    workerRef.current = null;
    requestIdRef.current = null;
    setState((current) => ({ ...current, status: "cancelled" }));
  }

  function downloadOutput(): void {
    const output = outputRef.current;
    if (!output) return;
    const stableBytes = output.slice().buffer;
    const url = URL.createObjectURL(new Blob([stableBytes], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = state.filename.replace(/\.pdf$/i, "") + "-mupdf-clean.pdf";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack">
      <Panel
        title="MuPDF document-engine probe"
        eyebrow="P0-03"
        actions={
          <div className="button-row">
            <label className="button button--secondary file-button">
              Open PDF
              <input accept="application/pdf,.pdf" onChange={(event: { target: HTMLInputElement }) => void onFile(event.target.files?.[0])} type="file" />
            </label>
            <button className="button" disabled={state.status === "running"} onClick={() => void runProbe(createMinimalPdf(), "phase-0-fixture.pdf")} type="button">
              Run fixture probe
            </button>
            <button className="button button--danger" disabled={state.status !== "running"} onClick={cancel} type="button">Cancel</button>
          </div>
        }
      >
        <p className="panel-intro">
          Opens the PDF inside a dedicated MuPDF WebAssembly worker, extracts page information and text, performs a clean full save, then validates the returned bytes.
        </p>

        {state.error ? <div className="error-banner"><strong>Engine failure</strong><span>{state.error}</span></div> : null}

        <div className="engine-summary">
          <article><span>Status</span><strong>{state.status}</strong></article>
          <article><span>File</span><strong>{state.filename}</strong></article>
          <article><span>Pages</span><strong>{state.result?.pageCount ?? "—"}</strong></article>
          <article><span>Round-trip</span><strong>{state.validation?.valid === true && state.reopen?.pageCountMatches ? "dual-engine valid" : state.validation ? "invalid" : "—"}</strong></article>
        </div>

        {state.result ? (
          <div className="result-grid">
            <dl className="key-values">
              <div><dt>Format</dt><dd>{state.result.format}</dd></div>
              <div><dt>PDF</dt><dd>{String(state.result.isPdf)}</dd></div>
              <div><dt>Bounds</dt><dd>{state.result.firstPageBounds?.join(", ") ?? "—"}</dd></div>
              <div><dt>Input</dt><dd>{state.result.inputBytes.toLocaleString()} bytes</dd></div>
              <div><dt>Output</dt><dd>{state.result.outputBytes.toLocaleString()} bytes</dd></div>
              <div><dt>Duration</dt><dd>{Math.round(state.result.durationMs)} ms</dd></div>
              <div><dt>Incremental save possible</dt><dd>{String(state.result.canSaveIncrementally)}</dd></div>
              <div><dt>PDF.js reopen pages</dt><dd>{state.reopen?.pageCount ?? "—"}</dd></div>
              <div><dt>Page count matches</dt><dd>{state.reopen ? String(state.reopen.pageCountMatches) : "—"}</dd></div>
              <div><dt>Extracted text matches</dt><dd>{state.reopen ? String(state.reopen.textMatches) : "—"}</dd></div>
            </dl>
            <div>
              <h3>Extracted first-page text</h3>
              <pre>{state.result.firstPageText || "No text extracted."}</pre>
              <button className="button button--secondary" disabled={!outputRef.current} onClick={downloadOutput} type="button">Download clean round-trip PDF</button>
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
