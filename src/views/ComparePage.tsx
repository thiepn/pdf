import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { alignPageFingerprints, type PageAlignmentRow, type PageHybridFingerprint } from "../comparison/alignment";
import { diffWords, type DiffToken } from "../comparison/diff";
import { boundedPairScale, type RgbaPlane } from "../comparison/visualDiff";
import { runVisualDiff } from "../comparison/visualDiffClient";
import { visualFingerprintFromRgba } from "../comparison/visualFingerprint";
import { extractPageText, openPdfWithPdfJs } from "../engines/pdfjs";

interface Loaded {
  file: File;
  document: PDFDocumentProxy;
}

interface PageSize {
  width: number;
  height: number;
}

const FINGERPRINT_MAX_PIXELS = 250_000;
const FINGERPRINT_MAX_EDGE = 2_048;

async function readPageSize(document: PDFDocumentProxy, pageNumber: number, signal?: AbortSignal): Promise<PageSize> {
  throwIfAborted(signal);
  if (pageNumber < 1 || pageNumber > document.numPages) throw new Error(`Page ${pageNumber} does not exist in this document.`);
  const page = await document.getPage(pageNumber);
  try {
    throwIfAborted(signal);
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
  } finally {
    page.cleanup();
  }
}

async function renderPage(document: PDFDocumentProxy, pageNumber: number, scale = 1, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  throwIfAborted(signal);
  if (pageNumber < 1 || pageNumber > document.numPages) throw new Error(`Page ${pageNumber} does not exist in this document.`);
  const page = await document.getPage(pageNumber);
  let canvas: HTMLCanvasElement | null = null;
  try {
    throwIfAborted(signal);
    const viewport = page.getViewport({ scale });
    canvas = window.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas unavailable.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const task = page.render({ canvas, canvasContext: context, viewport });
    const cancel = () => task.cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      await task.promise;
      throwIfAborted(signal);
      return canvas;
    } catch (reason) {
      if (signal?.aborted) throw new DOMException("Comparison cancelled.", "AbortError");
      throw reason;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  } catch (reason) {
    if (canvas) releaseCanvas(canvas);
    throw reason;
  } finally {
    page.cleanup();
  }
}

function blankCanvasLike(reference: HTMLCanvasElement | null): HTMLCanvasElement {
  const canvas = window.document.createElement("canvas");
  canvas.width = reference?.width ?? 612;
  canvas.height = reference?.height ?? 792;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas unavailable.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasPlane(canvas: HTMLCanvasElement): RgbaPlane {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas unavailable.");
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, pixels: image.data };
}

function createDiffCanvas(result: Awaited<ReturnType<typeof runVisualDiff>>): HTMLCanvasElement {
  const canvas = window.document.createElement("canvas");
  canvas.width = result.width;
  canvas.height = result.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable.");
  context.putImageData(new ImageData(result.pixels, result.width, result.height), 0, 0);
  return canvas;
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 1;
  canvas.height = 1;
}

function replaceCanvas(container: HTMLDivElement | null, canvas: HTMLCanvasElement): void {
  if (!container) {
    releaseCanvas(canvas);
    return;
  }
  for (const existing of container.querySelectorAll("canvas")) releaseCanvas(existing);
  container.replaceChildren(canvas);
}

function clearCanvasContainer(container: HTMLDivElement | null): void {
  if (!container) return;
  for (const canvas of container.querySelectorAll("canvas")) releaseCanvas(canvas);
  container.replaceChildren();
}

async function extractAllFingerprints(
  document: PDFDocumentProxy,
  onProgress: ((done: number, total: number) => void) | undefined,
  signal?: AbortSignal
): Promise<PageHybridFingerprint[]> {
  const fingerprints: PageHybridFingerprint[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    throwIfAborted(signal);
    const text = await extractPageText(document, pageNumber);
    throwIfAborted(signal);
    let visual: PageHybridFingerprint["visual"];
    if (text.trim().replace(/\s+/g, " ").length < 80) {
      const pageSize = await readPageSize(document, pageNumber, signal);
      const safeScale = Math.min(0.18, boundedPairScale(pageSize, null, FINGERPRINT_MAX_PIXELS, FINGERPRINT_MAX_EDGE));
      const rendered = await renderPage(document, pageNumber, safeScale, signal);
      try {
        const context = rendered.getContext("2d", { willReadFrequently: true });
        if (context) {
          const image = context.getImageData(0, 0, rendered.width, rendered.height);
          visual = visualFingerprintFromRgba(image.data, rendered.width, rendered.height);
        }
      } finally {
        releaseCanvas(rendered);
      }
    }
    fingerprints.push({ text, visual });
    onProgress?.(pageNumber, document.numPages);
    if (pageNumber % 4 === 0) await yieldToBrowser(signal);
  }
  return fingerprints;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Comparison cancelled.", "AbortError");
}

async function yieldToBrowser(signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  throwIfAborted(signal);
}

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}

export function ComparePage() {
  const leftRef = useRef<HTMLInputElement | null>(null);
  const rightRef = useRef<HTMLInputElement | null>(null);
  const documentsRef = useRef<{ left: PDFDocumentProxy | null; right: PDFDocumentProxy | null }>({ left: null, right: null });
  const leftCanvas = useRef<HTMLDivElement | null>(null);
  const rightCanvas = useRef<HTMLDivElement | null>(null);
  const diffCanvas = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [left, setLeft] = useState<Loaded | null>(null);
  const [right, setRight] = useState<Loaded | null>(null);
  const [leftPage, setLeftPage] = useState<number | null>(1);
  const [rightPage, setRightPage] = useState<number | null>(1);
  const [mode, setMode] = useState<"visual" | "text">("visual");
  const [tokens, setTokens] = useState<DiffToken[]>([]);
  const [changed, setChanged] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState("");
  const [visualResolution, setVisualResolution] = useState<string | null>(null);
  const [alignment, setAlignment] = useState<PageAlignmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    clearCanvasContainer(leftCanvas.current);
    clearCanvasContainer(rightCanvas.current);
    clearCanvasContainer(diffCanvas.current);
    void documentsRef.current.left?.loadingTask.destroy();
    void documentsRef.current.right?.loadingTask.destroy();
  }, []);

  function clearComparisonOutput(): void {
    setTokens([]);
    setChanged(null);
    setVisualResolution(null);
    clearCanvasContainer(leftCanvas.current);
    clearCanvasContainer(rightCanvas.current);
    clearCanvasContainer(diffCanvas.current);
  }

  async function load(file: File, side: "left" | "right") {
    abortRef.current?.abort();
    setError(null);
    setAlignment([]);
    setAnalysisProgress("");
    clearComparisonOutput();
    try {
      const pdf = await openPdfWithPdfJs(new Uint8Array(await file.arrayBuffer()));
      if (side === "left") {
        if (documentsRef.current.left) await documentsRef.current.left.loadingTask.destroy();
        documentsRef.current.left = pdf;
        setLeft({ file, document: pdf });
        setLeftPage(1);
      } else {
        if (documentsRef.current.right) await documentsRef.current.right.loadingTask.destroy();
        documentsRef.current.right = pdf;
        setRight({ file, document: pdf });
        setRightPage(1);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function compare(pair = { leftPage, rightPage }) {
    if (!left || !right) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setAnalysisProgress("");
    let leftRendered: HTMLCanvasElement | null = null;
    let rightRendered: HTMLCanvasElement | null = null;
    let outputCommitted = false;
    try {
      if (mode === "text") {
        const [a, b] = await Promise.all([
          pair.leftPage ? extractPageText(left.document, pair.leftPage) : Promise.resolve(""),
          pair.rightPage ? extractPageText(right.document, pair.rightPage) : Promise.resolve("")
        ]);
        throwIfAborted(controller.signal);
        setTokens(diffWords(a, b, 1200));
        setChanged(null);
        setVisualResolution(null);
        return;
      }

      const [leftSize, rightSize] = await Promise.all([
        pair.leftPage ? readPageSize(left.document, pair.leftPage, controller.signal) : Promise.resolve(null),
        pair.rightPage ? readPageSize(right.document, pair.rightPage, controller.signal) : Promise.resolve(null)
      ]);
      const scale = boundedPairScale(leftSize, rightSize);
      [leftRendered, rightRendered] = await Promise.all([
        pair.leftPage ? renderPage(left.document, pair.leftPage, scale, controller.signal) : Promise.resolve(null),
        pair.rightPage ? renderPage(right.document, pair.rightPage, scale, controller.signal) : Promise.resolve(null)
      ]);
      throwIfAborted(controller.signal);

      const a = leftRendered ?? blankCanvasLike(rightRendered);
      const b = rightRendered ?? blankCanvasLike(leftRendered);
      leftRendered = a;
      rightRendered = b;
      const result = await runVisualDiff(canvasPlane(a), canvasPlane(b), controller.signal);
      throwIfAborted(controller.signal);
      const output = createDiffCanvas(result);
      replaceCanvas(leftCanvas.current, a);
      replaceCanvas(rightCanvas.current, b);
      replaceCanvas(diffCanvas.current, output);
      outputCommitted = true;
      setChanged(result.changedRatio);
      setTokens([]);
      setVisualResolution(scale < 0.999 ? `Visual comparison sampled at ${Math.round(scale * 100)}% to keep browser memory bounded.` : null);
    } catch (reason) {
      if (!isAbortError(reason)) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (!outputCommitted) {
        if (leftRendered) releaseCanvas(leftRendered);
        if (rightRendered && rightRendered !== leftRendered) releaseCanvas(rightRendered);
      }
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  }

  async function analyze() {
    if (!left || !right) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setAnalysisProgress("Fingerprinting original pages…");
    try {
      const leftPrints = await extractAllFingerprints(left.document, (done, total) => setAnalysisProgress(`Original ${done}/${total}`), controller.signal);
      setAnalysisProgress("Fingerprinting revised pages…");
      const rightPrints = await extractAllFingerprints(right.document, (done, total) => setAnalysisProgress(`Revised ${done}/${total}`), controller.signal);
      throwIfAborted(controller.signal);
      setAnalysisProgress("Aligning text and visual page sequence…");
      await yieldToBrowser(controller.signal);
      const rows = alignPageFingerprints(leftPrints, rightPrints);
      throwIfAborted(controller.signal);
      setAlignment(rows);
      const firstChanged = rows.find((row) => row.status !== "same") ?? rows[0];
      if (firstChanged) {
        setLeftPage(firstChanged.leftPage);
        setRightPage(firstChanged.rightPage);
      }
    } catch (reason) {
      if (!isAbortError(reason)) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
        setAnalysisProgress("");
      }
    }
  }

  function cancelActive() {
    abortRef.current?.abort();
  }

  function chooseRow(row: PageAlignmentRow) {
    if (busy) return;
    setLeftPage(row.leftPage);
    setRightPage(row.rightPage);
    void compare({ leftPage: row.leftPage, rightPage: row.rightPage });
  }

  function changeMode(nextMode: typeof mode) {
    setMode(nextMode);
    clearComparisonOutput();
  }

  return <div className="compare-page">
    <section className="tools-hero">
      <p className="eyebrow">Compare PDFs</p>
      <h2>Compare text PDFs and scanned documents page by page.</h2>
      <p>Pages are matched automatically, including scanned pages, so inserted or deleted pages do not throw off the rest of the comparison. Large visual comparisons are sampled to a bounded local working size. Nothing leaves the browser.</p>
    </section>
    {error ? <div className="error-banner"><strong>Comparison issue</strong><span>{error}</span></div> : null}

    <div className="compare-inputs">
      <button className="file-slot" disabled={busy} onClick={() => leftRef.current?.click()} type="button"><strong>{left?.file.name ?? "Choose original PDF"}</strong><span>{left ? `${left.document.numPages} pages` : "Left document"}</span></button>
      <button className="file-slot" disabled={busy} onClick={() => rightRef.current?.click()} type="button"><strong>{right?.file.name ?? "Choose revised PDF"}</strong><span>{right ? `${right.document.numPages} pages` : "Right document"}</span></button>
      <input ref={leftRef} accept="application/pdf,.pdf" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void load(file, "left"); event.target.value = ""; }} type="file" />
      <input ref={rightRef} accept="application/pdf,.pdf" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void load(file, "right"); event.target.value = ""; }} type="file" />
    </div>

    <div className="compare-toolbar">
      <label>Mode<select disabled={busy} onChange={(event) => changeMode(event.target.value as typeof mode)} value={mode}><option value="visual">Visual pixels</option><option value="text">Extracted text</option></select></label>
      <label>Original page<input max={left?.document.numPages ?? 1} min="1" disabled={busy || leftPage === null} onChange={(event) => setLeftPage(Math.max(1, Math.min(left?.document.numPages ?? 1, Number(event.target.value))))} type="number" value={leftPage ?? ""} /></label>
      <label>Revised page<input max={right?.document.numPages ?? 1} min="1" disabled={busy || rightPage === null} onChange={(event) => setRightPage(Math.max(1, Math.min(right?.document.numPages ?? 1, Number(event.target.value))))} type="number" value={rightPage ?? ""} /></label>
      <button className="button" disabled={!left || !right || busy} onClick={() => void compare()} type="button">Compare pair</button>
      <button className="button button--secondary" disabled={!left || !right || busy} onClick={() => void analyze()} type="button">Analyze document</button>
      {busy ? <button className="button button--danger-ghost" onClick={cancelActive} type="button">Cancel comparison</button> : null}
      {changed !== null ? <strong>{(changed * 100).toFixed(2)}% changed pixels</strong> : null}
    </div>
    {busy ? <div aria-live="polite" className="notice-banner" role="status">{analysisProgress || "Comparing selected pages…"}</div> : null}
    {visualResolution ? <div className="notice-banner" role="status">{visualResolution}</div> : null}

    {alignment.length ? <section className="compare-alignment">
      <div className="section-heading"><div><p className="eyebrow">Page map</p><h3>{alignment.filter((row) => row.status !== "same").length} changed sequence row(s)</h3></div></div>
      <div className="compare-alignment__list">{alignment.map((row, index) => <button className={`compare-alignment__row compare-alignment__row--${row.status}`} disabled={busy} key={`${row.leftPage ?? "x"}-${row.rightPage ?? "x"}-${index}`} onClick={() => chooseRow(row)} type="button"><span>{row.leftPage ? `Original ${row.leftPage}` : "—"}</span><strong>{row.status}</strong><span>{row.rightPage ? `Revised ${row.rightPage}` : "—"}</span><small>{row.leftPage && row.rightPage ? `${Math.round(row.similarity * 100)}%${row.basis ? ` · ${row.basis}` : ""} similarity` : "sequence change"}</small></button>)}</div>
    </section> : null}

    {mode === "visual" ? <div className="visual-compare-grid">
      <section><h3>Original{leftPage === null ? " · page missing" : leftPage ? ` · page ${leftPage}` : ""}</h3><div className="compare-canvas" ref={leftCanvas} /></section>
      <section><h3>Revised{rightPage === null ? " · page missing" : rightPage ? ` · page ${rightPage}` : ""}</h3><div className="compare-canvas" ref={rightCanvas} /></section>
      <section><h3>Difference</h3><div className="compare-canvas" ref={diffCanvas} /></section>
    </div> : <div className="text-diff">{tokens.length ? tokens.map((token, index) => <span className={`diff-${token.kind}`} key={`${index}-${token.text}`}>{token.text}</span>) : <div className="empty-state"><strong>No text comparison yet</strong><p>Choose both PDFs, optionally analyze their page alignment, then compare a selected pair.</p></div>}</div>}
  </div>;
}
