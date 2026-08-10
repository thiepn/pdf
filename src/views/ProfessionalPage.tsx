import { useEffect, useMemo, useRef, useState } from "react";
import { extractPageText, inspectPdfBytes } from "../engines/pdfjs";
import { downloadBlob } from "../projects/download";
import { createDerivedProjectFromBytes, getProject, loadProjectBytes } from "../projects/projectRepository";
import { runProjectOperation } from "../operations/projectOperationCoordinator";
import { applyBatesNumbering, applyLayerVisibility, applyProfessionalEdits, inspectProfessionalPdf } from "../professional/professionalClient";
import { buildImposedPdf, type ImpositionOptions } from "../professional/imposition";
import { buildTextDocx } from "../professional/docx";
import type { BatesSettings, ImageReplacement, LayerInspection, ProfessionalExportReport, ProfessionalInspection, ProfessionalTextLine, TextReplacement } from "../types/professional";
import type { ProjectManifest } from "../types/project";
import { parsePageSelection } from "../organizer/pageSelection";
import { routeHref } from "../core/appRouter";

interface Props { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }
type Tab = "text" | "images" | "bates" | "imposition" | "layers" | "archive" | "convert";
interface PdfResult { bytes: Uint8Array; filename: string; report: ProfessionalExportReport | { operation: string; pageCount: number; outputBytes: number; changedPages: number[]; warnings: string[]; durationMs: number } }

const defaultBates: BatesSettings = { prefix: "BATES-", suffix: "", start: 1, digits: 6, pageRange: "all", position: "bottom-right", fontSize: 9, color: "#111111", includeFilename: false, filename: "", setPageLabels: false };
const defaultImposition: ImpositionOptions = { layout: "2-up", pageSize: "a4", quality: "standard", marginMm: 10, gutterMm: 5, drawBorders: true, cropMarks: false, registrationMarks: false, bookletDirection: "ltr" };

function tabLabel(tab: Tab): string { return ({ text: "Text", images: "Images", bates: "Document numbering", imposition: "Print layout", layers: "Layers", archive: "Archive check", convert: "DOCX" } as const)[tab]; }
function supportsStaticText(value: string): boolean { return [...value].every(character => character.charCodeAt(0) <= 255); }

export function ProfessionalPage({ projectId, onTitleChange }: Props) {
  const abortRef = useRef<AbortController | null>(null);
  const [project, setProject] = useState<ProjectManifest | null>(null), [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null), [inspection, setInspection] = useState<ProfessionalInspection | null>(null);
  const [password, setPassword] = useState(""), [passwordRequired, setPasswordRequired] = useState(false), [tab, setTab] = useState<Tab>("text"), [status, setStatus] = useState("Opening…"), [error, setError] = useState<string | null>(null), [progress, setProgress] = useState(0);
  const [textPage, setTextPage] = useState(1), [selectedLineId, setSelectedLineId] = useState(""), [replacementText, setReplacementText] = useState(""), [replacementMode, setReplacementMode] = useState<TextReplacement["mode"]>("redact-replace"), [textQueue, setTextQueue] = useState<TextReplacement[]>([]);
  const [selectedImageId, setSelectedImageId] = useState(""), [imageQueue, setImageQueue] = useState<ImageReplacement[]>([]);
  const [bates, setBates] = useState<BatesSettings>(defaultBates), [layers, setLayers] = useState<LayerInspection[]>([]), [imposition, setImposition] = useState<ImpositionOptions>(defaultImposition);
  const [result, setResult] = useState<PdfResult | null>(null), [saving, setSaving] = useState(false);

  useEffect(() => { let disposed = false; void (async () => { try { const manifest = await getProject(projectId); if (!manifest) throw new Error("Project not found."); const bytes = await loadProjectBytes(manifest); if (disposed) return; setProject(manifest); setSourceBytes(bytes); setBates(value => ({ ...value, filename: manifest.sourceFilename })); await inspect(manifest, bytes); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Failed"); } })(); return () => { disposed = true; abortRef.current?.abort(); }; }, [projectId]);

  async function inspect(manifest: ProjectManifest, bytes: Uint8Array, suppliedPassword?: string) {
    setError(null); setStatus("Inspecting professional capabilities…"); setProgress(0);
    try { const controller = new AbortController(); abortRef.current = controller; const report = await inspectProfessionalPdf(bytes, suppliedPassword, controller.signal); setInspection(report); setLayers(report.layers); setPasswordRequired(false); setStatus("Ready"); setProgress(1); onTitleChange?.(`Print & Advanced · ${manifest.name}`, `${report.pageCount} pages · Existing-content replacement, document numbering, print layout, layers, and archive readiness.`); }
    catch (reason) { const message = reason instanceof Error ? reason.message : String(reason); if (/password|encrypted/i.test(message)) { setPasswordRequired(true); setError("Enter the PDF password. It remains in memory only."); } else throw reason; }
  }

  const pageLines = useMemo(() => inspection?.textLines.filter(line => line.pageNumber === textPage) ?? [], [inspection, textPage]);
  const selectedLine = inspection?.textLines.find(line => line.id === selectedLineId);
  const pageImages = useMemo(() => inspection?.imageRegions.filter(image => image.pageNumber === textPage) ?? [], [inspection, textPage]);

  function selectLine(line: ProfessionalTextLine) { setSelectedLineId(line.id); setReplacementText(line.text); setReplacementMode(line.classification === "redact-and-replace" ? "redact-replace" : "overlay"); }
  function queueTextReplacement() {
    if (!selectedLine || !replacementText.trim()) return;
    if (!supportsStaticText(replacementText)) { setError("Static replacement currently supports Latin-1 text. Use the visual editor for Korean, Chinese, Arabic, or other scripts until embedded-font shaping is implemented."); return; }
    const fontFamily = selectedLine.fontFamily === "serif" ? "Times-Roman" : selectedLine.fontFamily === "monospace" ? "Courier" : "Helvetica";
    const replacement: TextReplacement = { lineId: selectedLine.id, pageNumber: selectedLine.pageNumber, bounds: selectedLine.bounds, originalText: selectedLine.text, replacementText: replacementText.trim(), mode: replacementMode, fontFamily, fontSize: Math.max(6, Math.min(72, selectedLine.fontSize)), color: "#111111", backgroundColor: "#ffffff" };
    setTextQueue(queue => [...queue.filter(item => item.lineId !== replacement.lineId), replacement]); setError(null);
  }
  async function queueImage(file: File | null) {
    if (!file || !selectedImageId || !inspection) return; const region = inspection.imageRegions.find(value => value.id === selectedImageId); if (!region) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) { setError("Image replacement supports PNG, JPEG, and WebP files."); return; }
    const imageBytes = new Uint8Array(await file.arrayBuffer());
    setImageQueue(queue => [...queue.filter(item => item.regionId !== region.id), { regionId: region.id, pageNumber: region.pageNumber, bounds: region.bounds, bytes: imageBytes, mimeType: file.type, removeUnderlying: true }]); setError(null);
  }

  async function validateProfessionalOutput(
    output: Uint8Array,
    replacements: TextReplacement[] = [],
    expectedPageCount = inspection?.pageCount,
    outputPassword: string | null | undefined = password || undefined,
  ) {
    const validationPassword = outputPassword ?? undefined;
    const summary = await inspectPdfBytes(output, validationPassword);
    if (expectedPageCount != null && summary.pageCount !== expectedPageCount) throw new Error("Output page count validation failed.");
    if (!replacements.length || !sourceBytes) return;
    const { openPdfWithPdfJs } = await import("../engines/pdfjs");
    const [sourceDocument, outputDocument] = await Promise.all([
      openPdfWithPdfJs(sourceBytes, password || undefined),
      openPdfWithPdfJs(output, validationPassword),
    ]);
    try {
      const pages = [...new Set(replacements.map(item => item.pageNumber))];
      for (const pageNumber of pages) {
        const [before, after] = await Promise.all([extractPageText(sourceDocument, pageNumber), extractPageText(outputDocument, pageNumber)]);
        for (const item of replacements.filter(value => value.pageNumber === pageNumber)) {
          if (!after.includes(item.replacementText)) throw new Error(`Replacement text was not found on page ${pageNumber}.`);
          if (item.mode === "redact-replace" && item.originalText !== item.replacementText) {
            const count = (text: string, needle: string) => needle ? text.split(needle).length - 1 : 0;
            if (count(after, item.originalText) >= count(before, item.originalText)) throw new Error(`The original text count did not decrease on page ${pageNumber}.`);
          }
        }
      }
    } finally { await Promise.all([sourceDocument.loadingTask.destroy(), outputDocument.loadingTask.destroy()]); }
  }

  async function runPdfOperation(
    label: string,
    filename: string,
    operation: (signal: AbortSignal) => Promise<{ bytes: Uint8Array; report: ProfessionalExportReport }>,
    replacements: TextReplacement[] = [],
    extraValidation?: (bytes: Uint8Array) => Promise<void>,
  ) {
    if (!project) return;
    setError(null); setResult(null); setStatus(label); setProgress(0); const controller = new AbortController(); abortRef.current = controller;
    try {
      await runProjectOperation(project.id, { label: label.replace(/…$/, ""), signal: controller.signal }, async ({ signal, update }) => {
        update({ detail: label, progress: 0.05 });
        const value = await operation(signal);
        setStatus("Validating output…"); update({ stage: "validating", detail: "Reopening and validating professional output…", progress: 0.88 });
        await validateProfessionalOutput(value.bytes, replacements); await extraValidation?.(value.bytes);
        setResult({ ...value, filename }); setStatus("Output validated"); setProgress(1); update({ progress: 1 });
      });
    } catch (reason) { if (reason instanceof DOMException && reason.name === "AbortError") setStatus("Cancelled"); else { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Failed"); } }
  }
  async function applyEdits() { if (!sourceBytes || (!textQueue.length && !imageQueue.length)) return; await runPdfOperation("Applying content replacements…", `${project?.name ?? "document"}-professional.pdf`, signal => applyProfessionalEdits(sourceBytes, { text: textQueue, images: imageQueue }, password || undefined, signal), textQueue); }
  async function applyBates() {
    if (!sourceBytes || !inspection) return;
    const parsed = parsePageSelection(bates.pageRange.trim() || "all", inspection.pageCount);
    if (parsed.errors.length || !parsed.pages.size) { setError(parsed.errors.join(" ") || "The numbering page range selected no pages."); return; }
    const firstPage = [...parsed.pages].sort((left, right) => left - right)[0];
    const expectedLabel = `${bates.prefix}${String(bates.start).padStart(bates.digits, "0")}${bates.suffix}${bates.includeFilename ? ` · ${bates.filename}` : ""}`;
    await runPdfOperation(
      "Applying document numbering…",
      `${project?.name ?? "document"}-bates.pdf`,
      signal => applyBatesNumbering(sourceBytes, bates, password || undefined, signal),
      [],
      async output => {
        const { openPdfWithPdfJs } = await import("../engines/pdfjs");
        const document = await openPdfWithPdfJs(output, password || undefined);
        try { const text = await extractPageText(document, firstPage); if (!text.includes(expectedLabel)) throw new Error(`The first document number was not found on page ${firstPage}.`); }
        finally { await document.loadingTask.destroy(); }
      },
    );
  }
  async function applyLayers() { if (!sourceBytes) return; await runPdfOperation("Saving layer visibility…", `${project?.name ?? "document"}-layers.pdf`, signal => applyLayerVisibility(sourceBytes, layers, password || undefined, signal)); }
  async function impose() { if (!sourceBytes || !project) return; setError(null); setResult(null); setStatus("Building print-layout sheets…"); const controller = new AbortController(); abortRef.current = controller; try { await runProjectOperation(project.id, { label: "Building imposed sheets", signal: controller.signal }, async ({ signal, update }) => { const started = performance.now(); const value = await buildImposedPdf(sourceBytes, imposition, password || undefined, signal, (done, total) => { const progressValue = done / total; setProgress(progressValue); update({ detail: `Building sheet ${done}/${total}…`, progress: Math.min(.85, progressValue * .85) }); }); update({ stage: "validating", detail: "Validating imposed output…", progress: .9 }); await validateProfessionalOutput(value.bytes, [], value.sheetCount, null); setResult({ bytes: value.bytes, filename: `${project.name}-${imposition.layout}.pdf`, report: { operation: "imposition", pageCount: value.sheetCount, outputBytes: value.bytes.byteLength, changedPages: Array.from({ length: value.sheetCount }, (_, i) => i + 1), warnings: value.warnings, durationMs: performance.now() - started } }); setStatus("Print-layout PDF validated"); update({ progress: 1 }); }); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Failed"); } }
  async function exportDocx() { if (!sourceBytes || !project) return; setError(null); setStatus("Extracting editable text…"); const controller = new AbortController(); abortRef.current = controller; try { await runProjectOperation(project.id, { label: "Exporting editable DOCX", signal: controller.signal }, async ({ signal, update }) => { const value = await buildTextDocx(sourceBytes, project.name, password || undefined, signal, (done, total) => { const progressValue = done / total; setProgress(progressValue); update({ detail: `Extracting page ${done}/${total}…`, progress: progressValue }); }); downloadBlob(new Blob([value.bytes.slice().buffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), `${project.name}-text.docx`); setStatus("DOCX exported"); update({ progress: 1 }); }); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Failed"); } }
  async function saveResultProject() { if (!result || !project) return; setSaving(true); try { await runProjectOperation(projectId, { label: "Saving professional revision", cancellable: false, reserveBytes: project.byteLength }, async ({ update }) => { update({ stage: "committing", detail: "Validating storage and writing a new revision…", progress: .4 }); const created = await createDerivedProjectFromBytes(projectId, result.bytes, result.filename, `professional:${result.report.operation}`, "application/pdf", password || undefined); update({ progress: 1 }); window.location.hash = routeHref({ name: "workspace", projectId: created.id, mode: "viewer" }).slice(1); }); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setSaving(false); } }

  if (!project || !sourceBytes) return <div className="empty-state"><strong>{status}</strong><p>{error ?? "Loading local project data."}</p></div>;
  return <div className="professional-page">
    <aside className="professional-sidebar"><p className="eyebrow">Print & Advanced</p><h2>Specialist document tools</h2><p>These tools modify existing content or prepare specialist print/archive output. The source project remains unchanged.</p>
      <nav className="professional-tabs">{(["text","images","bates","imposition","layers","archive","convert"] as Tab[]).map(value => <button className={tab === value ? "professional-tab professional-tab--active" : "professional-tab"} key={value} onClick={() => setTab(value)} type="button">{tabLabel(value)}</button>)}</nav>
      <div className="professional-status"><strong>{status}</strong>{progress > 0 && progress < 1 ? <progress max="1" value={progress}/> : null}<span>{inspection ? `${inspection.pageCount} pages · ${inspection.pdfVersion}` : "Inspection pending"}</span></div>
      {passwordRequired ? <div className="password-panel"><input autoComplete="off" onChange={event => setPassword(event.target.value)} placeholder="PDF password" type="password" value={password}/><button className="button" disabled={!password} onClick={() => void inspect(project, sourceBytes, password)} type="button">Unlock</button></div> : null}
      {error ? <div className="error-banner"><strong>Print & Advanced issue</strong><span>{error}</span></div> : null}
      {result ? <section className="professional-result"><strong>Validated output</strong><span>{(result.bytes.byteLength / 1024 / 1024).toFixed(2)} MB · {result.report.operation}</span>{result.report.warnings.map(warning => <small key={warning}>{warning}</small>)}<button className="button button--wide" onClick={() => downloadBlob(new Blob([result.bytes.slice().buffer], { type: "application/pdf" }), result.filename)} type="button">Download PDF</button><button className="button button--secondary button--wide" disabled={saving} onClick={() => void saveResultProject()} type="button">{saving ? "Saving…" : "Save as local project"}</button></section> : null}
    </aside>
    <main className="professional-workspace">
      {tab === "text" ? <section className="professional-panel"><header><div><p className="eyebrow">Existing text</p><h2>Redact and replace selected lines</h2></div><button className="button" disabled={!textQueue.length} onClick={() => void applyEdits()} type="button">Apply {textQueue.length || ""} replacement{textQueue.length === 1 ? "" : "s"}</button></header><div className="professional-toolbar"><label>Page<input max={inspection?.pageCount ?? 1} min="1" onChange={event => setTextPage(Number(event.target.value))} type="number" value={textPage}/></label><span>{pageLines.length} detected lines</span></div><div className="professional-split"><div className="detected-list">{pageLines.map(line => <button className={selectedLineId === line.id ? "detected-item detected-item--active" : "detected-item"} key={line.id} onClick={() => selectLine(line)} type="button"><strong>{line.text}</strong><span>{line.fontName} · {line.fontSize.toFixed(1)} pt</span><small>{line.classification} · x {line.bounds.x.toFixed(0)}, y {line.bounds.y.toFixed(0)}</small></button>)}{!pageLines.length ? <div className="empty-state"><strong>No editable text lines</strong><p>This page may be scanned, contain vector outlines, or use an unsupported encoding.</p></div> : null}</div><aside className="replacement-editor">{selectedLine ? <><h3>Replacement</h3><p>{selectedLine.reason}</p><textarea onChange={event => setReplacementText(event.target.value)} rows={5} value={replacementText}/><label>Mode<select onChange={event => setReplacementMode(event.target.value as TextReplacement["mode"])} value={replacementMode}><option disabled={selectedLine.classification !== "redact-and-replace"} value="redact-replace">Remove original and replace</option><option value="overlay">Cover visually and overlay</option></select></label><button className="button button--wide" onClick={queueTextReplacement} type="button">Add to replacement queue</button></> : <p>Select a detected text line.</p>}<div className="queue-list">{textQueue.map(item => <div key={item.lineId}><strong>Page {item.pageNumber}</strong><span>{item.originalText} → {item.replacementText}</span><button onClick={() => setTextQueue(queue => queue.filter(value => value.lineId !== item.lineId))} type="button">Remove</button></div>)}</div></aside></div></section> : null}
      {tab === "images" ? <section className="professional-panel"><header><div><p className="eyebrow">Existing image regions</p><h2>Remove and replace detected raster regions</h2></div><button className="button" disabled={!imageQueue.length} onClick={() => void applyEdits()} type="button">Apply {imageQueue.length || ""} image replacement{imageQueue.length === 1 ? "" : "s"}</button></header><div className="professional-toolbar"><label>Page<input max={inspection?.pageCount ?? 1} min="1" onChange={event => setTextPage(Number(event.target.value))} type="number" value={textPage}/></label><span>{pageImages.length} detected image regions</span></div><div className="image-region-grid">{pageImages.map(region => <label className={selectedImageId === region.id ? "image-region-card image-region-card--active" : "image-region-card"} key={region.id}><input checked={selectedImageId === region.id} name="image-region" onChange={() => setSelectedImageId(region.id)} type="radio"/><strong>Image region</strong><span>{region.bounds.w.toFixed(0)} × {region.bounds.h.toFixed(0)} pt</span><small>x {region.bounds.x.toFixed(0)}, y {region.bounds.y.toFixed(0)}</small></label>)}</div><label className="file-drop file-drop--compact"><input accept="image/png,image/jpeg,image/webp" disabled={!selectedImageId} onChange={event => void queueImage(event.target.files?.[0] ?? null)} type="file"/><strong>Choose replacement image</strong><span>The selected underlying region will be permanently removed.</span></label><div className="queue-list">{imageQueue.map(item => <div key={item.regionId}><strong>Page {item.pageNumber}</strong><span>{item.mimeType} · {(item.bytes.byteLength / 1024).toFixed(0)} KB</span><button onClick={() => setImageQueue(queue => queue.filter(value => value.regionId !== item.regionId))} type="button">Remove</button></div>)}</div></section> : null}
      {tab === "bates" ? <section className="professional-panel"><header><div><p className="eyebrow">Legal numbering</p><h2>Add document numbers (Bates)</h2></div><button className="button" onClick={() => void applyBates()} type="button">Add document numbers</button></header><div className="form-grid form-grid--three"><label>Prefix<input onChange={event => setBates(value => ({ ...value, prefix: event.target.value }))} value={bates.prefix}/></label><label>Starting number<input min="0" onChange={event => setBates(value => ({ ...value, start: Number(event.target.value) }))} type="number" value={bates.start}/></label><label>Digits<input max="12" min="1" onChange={event => setBates(value => ({ ...value, digits: Number(event.target.value) }))} type="number" value={bates.digits}/></label><label>Suffix<input onChange={event => setBates(value => ({ ...value, suffix: event.target.value }))} value={bates.suffix}/></label><label>Page range<input onChange={event => setBates(value => ({ ...value, pageRange: event.target.value }))} placeholder="all, 1-20, odd" value={bates.pageRange}/></label><label>Position<select onChange={event => setBates(value => ({ ...value, position: event.target.value as BatesSettings["position"] }))} value={bates.position}>{["top-left","top-center","top-right","bottom-left","bottom-center","bottom-right"].map(value => <option key={value}>{value}</option>)}</select></label><label>Font size<input max="24" min="6" onChange={event => setBates(value => ({ ...value, fontSize: Number(event.target.value) }))} type="number" value={bates.fontSize}/></label><label>Color<input onChange={event => setBates(value => ({ ...value, color: event.target.value }))} type="color" value={bates.color}/></label><label className="checkbox-row"><input checked={bates.includeFilename} onChange={event => setBates(value => ({ ...value, includeFilename: event.target.checked }))} type="checkbox"/> Include filename</label><label className="checkbox-row"><input checked={bates.setPageLabels} onChange={event => setBates(value => ({ ...value, setPageLabels: event.target.checked }))} type="checkbox"/> Update internal page labels when all pages are numbered</label></div><div className="bates-preview"><span>Preview</span><strong>{bates.prefix}{String(bates.start).padStart(bates.digits,"0")}{bates.suffix}{bates.includeFilename ? ` · ${project.sourceFilename}` : ""}</strong></div></section> : null}
      {tab === "imposition" ? <section className="professional-panel"><header><div><p className="eyebrow">Print production</p><h2>Print layout / booklet</h2></div><button className="button" onClick={() => void impose()} type="button">Create print-layout PDF</button></header><div className="form-grid form-grid--three"><label>Layout<select onChange={event => setImposition(value => ({ ...value, layout: event.target.value as ImpositionOptions["layout"] }))} value={imposition.layout}><option value="2-up">2-up</option><option value="4-up">4-up</option><option value="booklet">Booklet order</option></select></label><label>Sheet size<select onChange={event => setImposition(value => ({ ...value, pageSize: event.target.value as ImpositionOptions["pageSize"] }))} value={imposition.pageSize}><option value="a4">A4</option><option value="a3">A3</option></select></label><label>Render quality<select onChange={event => setImposition(value => ({ ...value, quality: event.target.value as ImpositionOptions["quality"] }))} value={imposition.quality}><option value="draft">Draft</option><option value="standard">Standard</option><option value="print">Print</option></select></label><label>Margin (mm)<input min="0" step="0.5" onChange={event => setImposition(value => ({ ...value, marginMm: Number(event.target.value) }))} type="number" value={imposition.marginMm}/></label><label>Gutter (mm)<input min="0" step="0.5" onChange={event => setImposition(value => ({ ...value, gutterMm: Number(event.target.value) }))} type="number" value={imposition.gutterMm}/></label><label>Booklet direction<select disabled={imposition.layout !== "booklet"} onChange={event => setImposition(value => ({ ...value, bookletDirection: event.target.value as ImpositionOptions["bookletDirection"] }))} value={imposition.bookletDirection}><option value="ltr">Left-to-right</option><option value="rtl">Right-to-left</option></select></label><label className="checkbox-row"><input checked={imposition.drawBorders} onChange={event => setImposition(value => ({ ...value, drawBorders: event.target.checked }))} type="checkbox"/> Draw page borders</label><label className="checkbox-row"><input checked={imposition.cropMarks} onChange={event => setImposition(value => ({ ...value, cropMarks: event.target.checked }))} type="checkbox"/> Crop marks</label><label className="checkbox-row"><input checked={imposition.registrationMarks} onChange={event => setImposition(value => ({ ...value, registrationMarks: event.target.checked }))} type="checkbox"/> Registration marks</label></div><div className="warning-banner"><strong>What changes in this print-layout copy</strong><span>This print-layout tool creates raster sheet pages. It intentionally does not preserve forms, links, annotations, signatures, layers, searchable text, or vector editability. Use the print standards check in Accessibility before production.</span></div></section> : null}
      {tab === "layers" ? <section className="professional-panel"><header><div><p className="eyebrow">Document layers</p><h2>Show or hide PDF layers</h2></div><button className="button" disabled={!layers.length} onClick={() => void applyLayers()} type="button">Save visibility state</button></header>{layers.length ? <div className="layer-list">{layers.map(layer => <label key={layer.index}><input checked={layer.visible} disabled={false} onChange={event => setLayers(values => values.map(value => value.index === layer.index ? { ...value, visible: event.target.checked } : value))} type="checkbox"/><strong>{layer.name}</strong><span>Layer {layer.index + 1}</span></label>)}</div> : <div className="empty-state"><strong>No document layers</strong><p>The document does not expose PDF layer controls.</p></div>}<p className="scope-note">Saving visibility does not flatten or remove layers. It changes the selected layer visibility only.</p></section> : null}
      {tab === "archive" ? <section className="professional-panel"><header><div><p className="eyebrow">Archive readiness</p><h2>Check PDF/A archive risks</h2></div></header><div className="archival-summary"><div><strong>{inspection?.pdfVersion}</strong><span>Format</span></div><div><strong>{inspection?.layerCount ?? 0}</strong><span>Layers</span></div><div><strong>{inspection?.tagged ? "Yes" : "No"}</strong><span>Tagged</span></div><div><strong>{inspection?.language || "Missing"}</strong><span>Language</span></div></div><div className="finding-list">{inspection?.findings.map(finding => <article className={`finding finding--${finding.severity}`} key={finding.id}><span>{finding.severity}</span><div><strong>{finding.title}</strong><p>{finding.detail}</p></div></article>)}</div></section> : null}
      {tab === "convert" ? <section className="professional-panel"><header><div><p className="eyebrow">Experimental conversion</p><h2>Export editable text to DOCX</h2></div><button className="button" onClick={() => void exportDocx()} type="button">Export text DOCX</button></header><div className="warning-banner"><strong>Text-focused conversion</strong><span>This creates a valid DOCX containing extracted page text in reading order. It does not reproduce the original PDF layout, tables, images, floating objects, fonts, or exact pagination.</span></div><ul className="scope-list"><li>Useful for recovering and editing document text.</li><li>Page boundaries are represented by page headings.</li><li>Scanned pages require OCR before this conversion.</li><li>Visual-layout DOCX reconstruction remains experimental and is not claimed here.</li></ul></section> : null}
    </main>
  </div>;
}
