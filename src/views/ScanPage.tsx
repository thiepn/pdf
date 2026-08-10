import { useEffect, useMemo, useRef, useState } from "react";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import { inspectPdfBytes, openPdfWithPdfJs, extractPageText } from "../engines/pdfjs";
import { OcrLanguagePanel } from "../ocr/OcrLanguagePanel";
import { createOcrSession } from "../ocr/ocrClient";
import { applyPreprocess, canvasToBlob, DEFAULT_OCR_PREPROCESS } from "../ocr/preprocess";
import { buildJpegPdf, imageBlobToJpegPage, type JpegPdfPage } from "../pdf/jpegPdf";
import { downloadBlob } from "../projects/download";
import { createProjectFromBytes } from "../projects/projectRepository";
import { mergePdfSources } from "../tools/pageOperationsClient";
import type { OcrPreprocessSettings } from "../types/ocr";
import { routeHref } from "../core/appRouter";

interface ScanItem { id: string; file: File; url: string; rotation: number }

async function normalizedImage(item: ScanItem, preprocess: OcrPreprocessSettings): Promise<Blob> {
  const bitmap = await createImageBitmap(item.file);
  try {
    const quarter = ((item.rotation % 360) + 360) % 360;
    const swapped = quarter === 90 || quarter === 270;
    const canvas = document.createElement("canvas");
    canvas.width = swapped ? bitmap.height : bitmap.width;
    canvas.height = swapped ? bitmap.width : bitmap.height;
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("Canvas scanning is unavailable.");
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(quarter * Math.PI / 180);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    context.setTransform(1, 0, 0, 1, 0, 0);
    applyPreprocess(canvas, preprocess);
    return canvasToBlob(canvas, "image/jpeg", 0.9);
  } finally { bitmap.close(); }
}

export function ScanPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const sessionRef = useRef<Awaited<ReturnType<typeof createOcrSession>> | null>(null);
  const itemsRef = useRef<ScanItem[]>([]);
  const [items, setItems] = useState<ScanItem[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [searchable, setSearchable] = useState(false);
  const [preprocess, setPreprocess] = useState<OcrPreprocessSettings>({ ...DEFAULT_OCR_PREPROCESS, scale: 1 });
  const [status, setStatus] = useState("Add document images or use the camera.");
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<Uint8Array | null>(null);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => { itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url)); void sessionRef.current?.terminate(); }, []);

  function addFiles(files: FileList | File[]) {
    const accepted = [...files].filter((file) => file.type.startsWith("image/"));
    setItems((current) => [...current, ...accepted.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), rotation: 0 }))]);
    setOutput(null); setError(null);
  }

  function move(index: number, delta: number) {
    setItems((current) => { const next = [...current]; const target = index + delta; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }

  async function build() {
    if (!items.length) return;
    if (searchable && !languages.length) { setError("Install and select at least one OCR language."); return; }
    setProcessing(true); setError(null); setOutput(null); setProgress(0);
    try {
      const normalized: Blob[] = [];
      for (let index = 0; index < items.length; index += 1) {
        setStatus(`Preparing image ${index + 1} of ${items.length}…`);
        normalized.push(await normalizedImage(items[index], preprocess));
        setProgress((index + 0.25) / items.length);
      }
      let bytes: Uint8Array;
      if (searchable) {
        const session = await createOcrSession(languages, (message) => setStatus(`${message.status} · ${Math.round(message.progress * 100)}%`));
        sessionRef.current = session;
        try {
          const pages = [] as Array<{ name: string; bytes: Uint8Array }>;
          for (let index = 0; index < normalized.length; index += 1) {
            setStatus(`Recognizing scan ${index + 1} of ${normalized.length}…`);
            const result = await session.recognize(normalized[index], `scan-${index + 1}`);
            if (!result.searchablePdf) throw new Error("Tesseract did not produce searchable PDF output.");
            pages.push({ name: `scan-${index + 1}.pdf`, bytes: result.searchablePdf });
            setProgress((index + 1) / normalized.length);
          }
          bytes = (await mergePdfSources(pages)).bytes;
        } finally { await session.terminate(); sessionRef.current = null; }
      } else {
        const pages: JpegPdfPage[] = [];
        for (let index = 0; index < normalized.length; index += 1) {
          pages.push(await imageBlobToJpegPage(normalized[index], 0.88));
          setProgress((index + 1) / normalized.length);
        }
        bytes = buildJpegPdf(pages, { title: "Scanned document" });
      }
      const summary = await inspectPdfBytes(bytes);
      if (summary.pageCount !== items.length) throw new Error("Scan output validation failed: page count mismatch.");
      if (searchable) {
        const pdf = await openPdfWithPdfJs(bytes);
        try {
          let foundSearchableText = false;
          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            if ((await extractPageText(pdf, pageNumber)).trim()) { foundSearchableText = true; break; }
          }
          if (!foundSearchableText) throw new Error("Searchable scan validation failed: no text was extracted from any page.");
        } finally { await pdf.loadingTask.destroy(); }
      }
      setOutput(bytes); setStatus(searchable ? "Searchable scan ready" : "Image PDF ready");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Failed"); }
    finally { setProcessing(false); setProgress(0); }
  }

  async function save(asProject: boolean) {
    if (!output) return;
    if (asProject) {
      const project = await createProjectFromBytes(output, searchable ? "searchable-scan.pdf" : "scan.pdf");
      window.location.hash = routeHref({ name: "workspace", projectId: project.id, mode: "viewer" }).slice(1);
    } else downloadBlob(new Blob([toOwnedArrayBuffer(output)], { type: "application/pdf" }), searchable ? "searchable-scan.pdf" : "scan.pdf");
  }

  const totalMb = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0) / 1024 / 1024, [items]);
  return <div className="scan-page">
    <section className="tools-hero"><p className="eyebrow">Scan to PDF</p><h2>Turn local images or camera captures into a PDF.</h2><p>Rotate, enhance, reorder, and optionally OCR every page without uploading the images.</p></section>
    {error ? <div className="error-banner"><strong>Scan failed</strong><span>{error}</span></div> : null}
    <div className="scan-layout">
      <aside className="scan-settings">
        <button className="button" disabled={processing} onClick={() => inputRef.current?.click()} type="button">Add images</button>
        <button className="button button--secondary" disabled={processing} onClick={() => cameraRef.current?.click()} type="button">Use camera</button>
        <input ref={inputRef} accept="image/*" hidden multiple onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} type="file"/>
        <input ref={cameraRef} accept="image/*" capture="environment" hidden onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} type="file"/>
        <label><input checked={searchable} disabled={processing} onChange={(event) => setSearchable(event.target.checked)} type="checkbox"/> Make text searchable with OCR</label>
        <label><input checked={preprocess.grayscale} disabled={processing} onChange={(event) => setPreprocess({ ...preprocess, grayscale: event.target.checked })} type="checkbox"/> Grayscale enhancement</label>
        <label>Contrast<input disabled={processing} max="2" min="0.5" onChange={(event) => setPreprocess({ ...preprocess, contrast: Number(event.target.value) })} step="0.05" type="range" value={preprocess.contrast}/></label>
        {searchable ? <OcrLanguagePanel disabled={processing} onChange={setLanguages} selected={languages}/> : null}
        <button className="button button--wide" disabled={!items.length || processing} onClick={() => void build()} type="button">{processing ? "Processing…" : "Create PDF"}</button>
      </aside>
      <main className="scan-main">
        <header className="processing-header"><div><strong>{status}</strong><span>{items.length} pages · {totalMb.toFixed(1)} MB source</span></div>{processing ? <progress max="1" value={progress}/> : null}</header>
        <div className="scan-grid">{items.map((item, index) => <article className="scan-card" key={item.id}><img alt={`Scan page ${index + 1}`} src={item.url}/><div><strong>Page {index + 1}</strong><span>{item.file.name}</span></div><div className="scan-card__actions"><button disabled={processing || index === 0} onClick={() => move(index, -1)} type="button">↑</button><button disabled={processing || index === items.length - 1} onClick={() => move(index, 1)} type="button">↓</button><button disabled={processing} onClick={() => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, rotation: (entry.rotation + 90) % 360 } : entry))} type="button">↻</button><button disabled={processing} onClick={() => { URL.revokeObjectURL(item.url); setItems((current) => current.filter((entry) => entry.id !== item.id)); }} type="button">×</button></div></article>)}</div>
        {!items.length ? <div className="empty-state"><strong>No scan pages</strong><p>Add images from storage or capture pages with the device camera.</p></div> : null}
        {output ? <footer className="output-bar"><div><strong>Output validated</strong><span>{(output.byteLength / 1024 / 1024).toFixed(2)} MB</span></div><button className="button button--secondary" onClick={() => void save(false)} type="button">Download</button><button className="button" onClick={() => void save(true)} type="button">Save as project</button></footer> : null}
      </main>
    </div>
  </div>;
}
