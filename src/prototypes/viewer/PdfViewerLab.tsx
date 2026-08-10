import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Panel } from "../../components/Panel";
import { createMinimalPdf } from "../../fixtures/minimalPdf";
import { extractPageText, openPdfWithPdfJs } from "../../engines/pdfjs";
import { validatePdfBytes, type PdfByteValidation } from "../../validation/pdfValidator";

interface ViewerState {
  filename: string;
  byteLength: number;
  pageCount: number;
  pageNumber: number;
  zoom: number;
  text: string;
  renderMs?: number;
  openMs?: number;
  validation?: PdfByteValidation;
}

const initialState: ViewerState = {
  filename: "No document",
  byteLength: 0,
  pageCount: 0,
  pageNumber: 1,
  zoom: 1,
  text: ""
};

export function PdfViewerLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const sourceRef = useRef<{ bytes: Uint8Array; filename: string } | null>(null);
  const [state, setState] = useState<ViewerState>(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  useEffect(() => {
    return () => {
      renderTaskRef.current?.cancel();
      void documentRef.current?.destroy();
    };
  }, []);

  async function loadBytes(bytes: Uint8Array, filename: string, documentPassword = password): Promise<void> {
    sourceRef.current = { bytes, filename };
    setBusy(true);
    setError(null);
    renderTaskRef.current?.cancel();
    await documentRef.current?.destroy();
    documentRef.current = null;

    try {
      const validation = validatePdfBytes(bytes);
      const openStart = performance.now();
      const document = await openPdfWithPdfJs(bytes, documentPassword || undefined);
      const openMs = performance.now() - openStart;
      documentRef.current = document;
      setPassword("");

      setState({
        filename,
        byteLength: bytes.byteLength,
        pageCount: document.numPages,
        pageNumber: 1,
        zoom: 1,
        text: "",
        openMs,
        validation
      });

      await renderPage(document, 1, 1, filename, bytes.byteLength, openMs, validation);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setBusy(false);
    }
  }

  async function renderPage(
    document: PDFDocumentProxy,
    pageNumber: number,
    zoom: number,
    filename = state.filename,
    byteLength = state.byteLength,
    openMs = state.openMs,
    validation = state.validation
  ): Promise<void> {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Viewer canvas is unavailable.");

    renderTaskRef.current?.cancel();
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: zoom });
    const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * deviceScale);
    canvas.height = Math.floor(viewport.height * deviceScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("2D canvas context is unavailable.");

    const started = performance.now();
    const renderTask = page.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: deviceScale === 1 ? undefined : [deviceScale, 0, 0, deviceScale, 0, 0]
    });
    renderTaskRef.current = renderTask;
    await renderTask.promise;
    const renderMs = performance.now() - started;
    const text = await extractPageText(document as Awaited<ReturnType<typeof openPdfWithPdfJs>>, pageNumber);

    setState({
      filename,
      byteLength,
      pageCount: document.numPages,
      pageNumber,
      zoom,
      text,
      renderMs,
      openMs,
      validation
    });
  }

  async function updatePage(pageNumber: number, zoom = state.zoom): Promise<void> {
    const document = documentRef.current;
    if (!document) return;
    const bounded = Math.max(1, Math.min(document.numPages, pageNumber));
    setBusy(true);
    setError(null);
    try {
      await renderPage(document, bounded, zoom);
    } catch (renderError) {
      const message = renderError instanceof Error ? renderError.message : String(renderError);
      if (!/cancel/i.test(message)) setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined): Promise<void> {
    if (!file) return;
    await loadBytes(new Uint8Array(await file.arrayBuffer()), file.name);
  }

  async function retryWithPassword(): Promise<void> {
    const source = sourceRef.current;
    if (!source) return;
    await loadBytes(source.bytes, source.filename, password);
  }

  function cancelRender(): void {
    renderTaskRef.current?.cancel();
    setBusy(false);
  }

  return (
    <div className="stack">
      <Panel
        title="PDF.js viewer baseline"
        eyebrow="P0-02"
        actions={
          <div className="button-row">
            <label className="button button--secondary file-button">
              Open PDF
              <input accept="application/pdf,.pdf" onChange={(event: { target: HTMLInputElement }) => void onFile(event.target.files?.[0])} type="file" />
            </label>
            <button className="button" disabled={busy} onClick={() => void loadBytes(createMinimalPdf(), "phase-0-fixture.pdf")} type="button">
              Load fixture
            </button>
          </div>
        }
      >
        <div className="viewer-toolbar">
          <button disabled={!documentRef.current || state.pageNumber <= 1 || busy} onClick={() => void updatePage(state.pageNumber - 1)} type="button">Previous</button>
          <label>
            Page
            <input
              min="1"
              max={Math.max(1, state.pageCount)}
              value={state.pageNumber}
              onChange={(event: { target: HTMLInputElement }) => void updatePage(Number(event.target.value))}
              type="number"
            />
            <span>/ {state.pageCount || "—"}</span>
          </label>
          <label>
            Zoom
            <select value={state.zoom} onChange={(event: { target: HTMLSelectElement }) => void updatePage(state.pageNumber, Number(event.target.value))}>
              <option value="0.5">50%</option>
              <option value="0.75">75%</option>
              <option value="1">100%</option>
              <option value="1.5">150%</option>
              <option value="2">200%</option>
            </select>
          </label>
          <button disabled={!documentRef.current || state.pageNumber >= state.pageCount || busy} onClick={() => void updatePage(state.pageNumber + 1)} type="button">Next</button>
          <label>
            Password
            <input
              autoComplete="off"
              placeholder="Only when required"
              type="password"
              value={password}
              onChange={(event: { target: HTMLInputElement }) => setPassword(event.target.value)}
            />
          </label>
          <button disabled={!sourceRef.current || !password || busy} onClick={() => void retryWithPassword()} type="button">Retry password</button>
          <button className="danger-control" disabled={!busy} onClick={cancelRender} type="button">Cancel render</button>
        </div>

        {error ? <div className="error-banner"><strong>Viewer error</strong><span>{error}</span></div> : null}

        <div className="viewer-grid">
          <div className="canvas-stage">
            {!documentRef.current ? <div className="canvas-placeholder">Load the generated fixture or select a PDF.</div> : null}
            <canvas ref={canvasRef} />
          </div>
          <aside className="inspection-panel">
            <dl>
              <div><dt>File</dt><dd>{state.filename}</dd></div>
              <div><dt>Bytes</dt><dd>{state.byteLength.toLocaleString()}</dd></div>
              <div><dt>Open</dt><dd>{state.openMs ? `${Math.round(state.openMs)} ms` : "—"}</dd></div>
              <div><dt>Render</dt><dd>{state.renderMs ? `${Math.round(state.renderMs)} ms` : "—"}</dd></div>
              <div><dt>Header</dt><dd>{state.validation ? String(state.validation.hasHeader) : "—"}</dd></div>
              <div><dt>EOF</dt><dd>{state.validation ? String(state.validation.hasEofMarker) : "—"}</dd></div>
            </dl>
            <h3>Extracted text</h3>
            <pre>{state.text || "No text extracted."}</pre>
          </aside>
        </div>
      </Panel>
    </div>
  );
}
