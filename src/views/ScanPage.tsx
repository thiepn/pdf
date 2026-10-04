import { useEffect, useMemo, useRef, useState } from "react";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import { inspectPdfBytes, openPdfWithPdfJs, extractPageText } from "../engines/pdfjs";
import { OcrLanguagePanel } from "../ocr/OcrLanguagePanel";
import { createOcrSession } from "../ocr/ocrClient";
import { applyOcrTextLayer } from "../ocr/ocrLayerClient";
import type { OcrLayerPage } from "../ocr/ocrLayer";
import { applyPreprocess, canvasToBlob, DEFAULT_OCR_PREPROCESS } from "../ocr/preprocess";
import { buildJpegPdf, imageBlobToJpegPage, type JpegPdfPage } from "../pdf/jpegPdf";
import { downloadBlob } from "../projects/download";
import { createProjectFromBytes } from "../projects/projectRepository";
import { buildScanOutputFingerprint } from "../scan/scanOutputFingerprint";
import type { OcrPreprocessSettings } from "../types/ocr";
import { inspectIncomingFiles, isImageFile, takeTaskTransfer } from "../product/fileHandoff";
import { MAX_CANVAS_PIXELS, MAX_OUTPUT_BYTES, safeOutputName } from "../quick/quickModel";
import { routeHref } from "../core/appRouter";

interface ScanItem { id: string; file: File; url: string; rotation: number }

async function normalizedImage(item: ScanItem, preprocess: OcrPreprocessSettings, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(item.file);
  const canvas = document.createElement("canvas");
  try {
    signal.throwIfAborted();
    const quarter = ((item.rotation % 360) + 360) % 360;
    const swapped = quarter === 90 || quarter === 270;
    const scale = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (bitmap.width * bitmap.height)));
    const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.width = swapped ? height : width;
    canvas.height = swapped ? width : height;
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("Canvas scanning is unavailable.");
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(quarter * Math.PI / 180);
    context.drawImage(bitmap, -width / 2, -height / 2, width, height);
    context.setTransform(1, 0, 0, 1, 0, 0);
    applyPreprocess(canvas, preprocess);
    return await canvasToBlob(canvas, "image/jpeg", 0.9);
  } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
}

export function ScanPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const sessionRef = useRef<Awaited<ReturnType<typeof createOcrSession>> | null>(null);
  const itemsRef = useRef<ScanItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const [outputName, setOutputName] = useState("scan");
  const [items, setItems] = useState<ScanItem[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [searchable, setSearchable] = useState(false);
  const [preprocess, setPreprocess] = useState<OcrPreprocessSettings>({ ...DEFAULT_OCR_PREPROCESS, scale: 1 });
  const [status, setStatus] = useState("Add document images or use the camera.");
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<Uint8Array | null>(null);
  const [outputFingerprint, setOutputFingerprint] = useState<string | null>(null);

  const scanFingerprint = useMemo(() => buildScanOutputFingerprint({
    pages: items.map((item) => ({
      id: item.id,
      name: item.file.name,
      size: item.file.size,
      lastModified: item.file.lastModified,
      type: item.file.type,
      rotation: item.rotation
    })),
    searchable,
    languages,
    preprocess
  }), [items, languages, preprocess, searchable]);
  const validatedOutput = output && outputFingerprint === scanFingerprint ? output : null;

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => {
    alive.current = true; let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) { const transfer = takeTaskTransfer("scan-to-pdf"); if (transfer) addFiles(transfer.files); } });
    return () => { cancelled = true; alive.current = false; abortRef.current?.abort(); itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url)); void sessionRef.current?.terminate().catch(() => {}); };
  }, []);

  function invalidateOutput(): void {
    if (output) setStatus("Scan changed · create the PDF again.");
    setOutput(null);
    setOutputFingerprint(null);
  }

  function addFiles(files: FileList | File[]) {
    try {
      const incoming = [...files]; if (!incoming.length) return;
      if (!incoming.every(isImageFile)) throw new Error("Choose JPG, PNG, or WebP images. No files were added.");
      const combined = [...itemsRef.current.map((item) => item.file), ...incoming];
      inspectIncomingFiles(combined);
      if (combined.length > 200) throw new Error("Scan up to 200 images at a time. Split larger batches before adding more pages.");
      const next = [...itemsRef.current, ...incoming.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), rotation: 0 }))];
      itemsRef.current = next; setItems(next); invalidateOutput(); setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    invalidateOutput();
  }

  function rotate(id: string): void {
    setItems((current) => current.map((entry) => entry.id === id ? { ...entry, rotation: (entry.rotation + 90) % 360 } : entry));
    invalidateOutput();
  }

  function remove(id: string): void {
    const item = items.find((entry) => entry.id === id);
    if (item) URL.revokeObjectURL(item.url);
    setItems((current) => current.filter((entry) => entry.id !== id));
    invalidateOutput();
  }

  function changeSearchable(value: boolean): void {
    setSearchable(value);
    invalidateOutput();
  }

  function changePreprocess(patch: Partial<OcrPreprocessSettings>): void {
    setPreprocess((current) => ({ ...current, ...patch }));
    invalidateOutput();
  }

  function changeLanguages(value: string[]): void {
    setLanguages(value);
    invalidateOutput();
  }

  function cancel(): void {
    abortRef.current?.abort(); void sessionRef.current?.terminate().catch(() => {});
    setStatus("Cancelling… Your original images are unchanged.");
  }
  async function build() {
    if (!items.length || processing) return;
    if (searchable && !languages.length) { setError("Install and select at least one OCR language."); return; }
    const requestedFingerprint = scanFingerprint;
    const abort = new AbortController(); abortRef.current = abort;
    setProcessing(true); setError(null); setOutput(null); setOutputFingerprint(null); setProgress(0);
    let session: Awaited<ReturnType<typeof createOcrSession>> | null = null;
    try {
      if (searchable) {
        session = await createOcrSession(languages, (message) => { if (alive.current && !abort.signal.aborted) setStatus(`${message.status} · ${Math.round(message.progress * 100)}%`); });
        sessionRef.current = session;
      }
      const recognized: Array<{ name: string; bytes: Uint8Array }> = []; const images: JpegPdfPage[] = [];
      let outputBytes = 0;
      // Normalize/recognize one image at a time rather than keeping every full-
      // resolution canvas and normalized bitmap alive simultaneously.
      for (const [index, item] of items.entries()) {
        abort.signal.throwIfAborted();
        setStatus(`Preparing page ${index + 1} of ${items.length}…`);
        const normalized = await normalizedImage(item, preprocess, abort.signal);
        abort.signal.throwIfAborted();
        if (session) {
          setStatus(`Recognizing page ${index + 1} of ${items.length}…`);
          const result = await session.recognize(normalized, `scan-${index + 1}`);
          abort.signal.throwIfAborted();
          if (!result.searchablePdf) throw new Error("Text recognition did not produce a PDF. Try again or turn off searchable text.");
          outputBytes += result.searchablePdf.byteLength; recognized.push({ name: `scan-${index + 1}.pdf`, bytes: result.searchablePdf });
        } else {
          const image = await imageBlobToJpegPage(normalized, 0.88); outputBytes += image.jpeg.byteLength; images.push(image);
        }
        if (outputBytes > MAX_OUTPUT_BYTES) throw new Error("The output is too large for this browser. Convert a smaller batch.");
        abort.signal.throwIfAborted(); setProgress((index + 1) / items.length);
      }
      const bytes = session ? (await mergePdfSources(recognized, abort.signal)).bytes : buildJpegPdf(images, { title: outputName.trim() || "Scanned document" });
      abort.signal.throwIfAborted();
      if (bytes.byteLength > MAX_OUTPUT_BYTES) throw new Error("The PDF exceeds the safe browser output size. Convert fewer images.");
      const summary = await inspectPdfBytes(bytes); abort.signal.throwIfAborted();
      if (summary.pageCount !== items.length) throw new Error("Scan output validation failed: page count mismatch.");
      if (searchable) {
        const pdf = await openPdfWithPdfJs(bytes);
        try {
          let found = false;
          for (let number = 1; number <= pdf.numPages; number++) { abort.signal.throwIfAborted(); if ((await extractPageText(pdf, number)).trim()) { found = true; break; } }
          if (!found) throw new Error("No searchable text was found. Check the scan quality or turn off searchable text to save an image PDF.");
        } finally { await pdf.loadingTask.destroy(); }
      }
      abort.signal.throwIfAborted();
      if (alive.current) { setOutput(bytes); setOutputFingerprint(requestedFingerprint); setStatus(searchable ? "Searchable scan ready" : "Image PDF ready"); }
    } catch (reason) {
      if (alive.current) { setError(abort.signal.aborted ? null : reason instanceof Error ? reason.message : String(reason)); setStatus(abort.signal.aborted ? "Cancelled. Your images and settings are unchanged." : "Could not create this scan"); }
    } finally {
      try { await session?.terminate(); } catch { /* A user cancellation may already have terminated the OCR worker. */ }
      sessionRef.current = null; abortRef.current = null;
      if (alive.current) { setProcessing(false); setProgress(0); }
    }
  }
  async function save(asProject: boolean) {
    if (!validatedOutput) return;
    const filename = safeOutputName(outputName, "pdf");
    try {
      if (asProject) {
        const project = await createProjectFromBytes(validatedOutput, filename);
        window.location.hash = routeHref({ name: "workspace", projectId: project.id, mode: "editor" }).slice(1);
      } else downloadBlob(new Blob([toOwnedArrayBuffer(validatedOutput)], { type: "application/pdf" }), filename);
    } catch (reason) { setError(`Could not save a local project: ${reason instanceof Error ? reason.message : String(reason)}. The finished PDF is still available to download.`); }
  }

  const totalMb = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0) / 1024 / 1024, [items]);
  return <div className="scan-page">
    <section className="tools-hero"><p className="eyebrow">Scan to PDF</p><h2>Turn local images or camera captures into a PDF.</h2><p>Rotate, enhance, reorder, and optionally OCR every page without uploading the images.</p></section>
    {error ? <div className="error-banner" role="alert"><strong>Scan needs attention</strong><span>{error}</span></div> : null}
    <div className="scan-layout">
      <aside className="scan-settings">
        <button className="button" disabled={processing} onClick={() => inputRef.current?.click()} type="button">Add images</button>
        <button className="button button--secondary" disabled={processing} onClick={() => cameraRef.current?.click()} type="button">Use camera</button>
        <input ref={inputRef} accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden multiple onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} type="file"/>
        <input ref={cameraRef} accept="image/*" capture="environment" hidden onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} type="file"/>
        <label><input checked={searchable} disabled={processing} onChange={(event) => changeSearchable(event.target.checked)} type="checkbox"/> Make text searchable with OCR</label>
        <label><input checked={preprocess.grayscale} disabled={processing} onChange={(event) => changePreprocess({ grayscale: event.target.checked })} type="checkbox"/> Grayscale enhancement</label>
        <label>Contrast<input disabled={processing} max="2" min="0.5" onChange={(event) => changePreprocess({ contrast: Number(event.target.value) })} step="0.05" type="range" value={preprocess.contrast}/></label>
        {searchable ? <OcrLanguagePanel disabled={processing} onChange={changeLanguages} selected={languages}/> : null}
        <label>Output filename<input value={outputName} onChange={(event) => setOutputName(event.target.value)} disabled={processing} maxLength={140}/></label>
        <button className="button button--wide" disabled={!items.length || processing} onClick={() => void build()} type="button">{processing ? "Processing…" : "Create PDF"}</button>
        {processing ? <button className="button button--secondary" onClick={cancel} type="button">Cancel scan</button> : null}
      </aside>
      <main className="scan-main">
        <header className="processing-header"><div><strong role="status" aria-live="polite">{status}</strong><span>{items.length} pages · {totalMb.toFixed(1)} MB source</span></div>{processing ? <progress max="1" value={progress}/> : null}</header>
        <div className="scan-grid">{items.map((item, index) => <article className="scan-card" key={item.id}><img alt={`Scan page ${index + 1}`} src={item.url} style={{ transform: `rotate(${item.rotation}deg)` }}/><div><strong>Page {index + 1}</strong><span>{item.file.name}</span></div><div className="scan-card__actions"><button aria-label={`Move scan page ${index + 1} up`} disabled={processing || index === 0} onClick={() => move(index, -1)} type="button">↑</button><button aria-label={`Move scan page ${index + 1} down`} disabled={processing || index === items.length - 1} onClick={() => move(index, 1)} type="button">↓</button><button aria-label={`Rotate scan page ${index + 1}`} disabled={processing} onClick={() => rotate(item.id)} type="button">↻</button><button aria-label={`Remove scan page ${index + 1}`} disabled={processing} onClick={() => remove(item.id)} type="button">×</button></div></article>)}</div>
        {!items.length ? <div className="empty-state"><strong>No scan pages</strong><p>Add images from storage or capture pages with the device camera.</p></div> : null}
        {validatedOutput ? <footer className="output-bar"><div><strong>Output validated</strong><span>{(validatedOutput.byteLength / 1024 / 1024).toFixed(2)} MB</span></div><button className="button button--secondary" onClick={() => void save(false)} type="button">Download PDF</button><button className="button" onClick={() => void save(true)} type="button">Open in editor</button></footer> : null}
      </main>
    </div>
  </div>;
}
