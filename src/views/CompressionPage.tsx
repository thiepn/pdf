import { useEffect, useRef, useState } from "react";
import "./compressionF4.css";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { inspectPdfBytes, openPdfWithPdfJs } from "../engines/pdfjs";
import { optimizePdf } from "../processing/processingClient";
import { smartOptimizePreservedPdf } from "../preservation/preservationClient";
import { SMART_MODES, SMART_PRESERVED_CATEGORIES, type SmartOptimizationMode } from "../optimization/smartOptimizer";
import type { PreservationContractReport } from "../types/preservation";
import { rasterCompressPdf, RASTER_PROFILES } from "../processing/rasterCompression";
import { downloadBlob } from "../projects/download";
import { createDerivedProjectFromBytes, getProject, loadProjectBytes } from "../projects/projectRepository";
import { runProjectOperation } from "../operations/projectOperationCoordinator";
import type { ProjectManifest } from "../types/project";
import { PageCanvas } from "../viewer/PageCanvas";
import { routeHref } from "../core/appRouter";

interface Props { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }
type ProfileId = "smart" | "lossless" | "screen" | "balanced" | "small" | "print";

export function CompressionPage({ projectId, onTitleChange }: Props) {
  const sourceDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const outputDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [outputDocument, setOutputDocument] = useState<PDFDocumentProxy | null>(null);
  const [profile, setProfile] = useState<ProfileId>("smart");
  const [smartMode, setSmartMode] = useState<SmartOptimizationMode>("careful");
  const [preservationReport, setPreservationReport] = useState<PreservationContractReport | null>(null);
  const [removeMetadata, setRemoveMetadata] = useState(false);
  const [status, setStatus] = useState("Opening project…");
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [output, setOutput] = useState<Uint8Array | null>(null);
  const [outputFingerprint, setOutputFingerprint] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);

  const compressionFingerprint = JSON.stringify({
    profile,
    smartMode: profile === "smart" ? smartMode : null,
    removeMetadata: profile === "lossless" ? removeMetadata : false
  });
  const validatedOutput = output && outputFingerprint === compressionFingerprint ? output : null;
  const validatedOutputDocument = validatedOutput ? outputDocument : null;

  function invalidateOutput(): void {
    const previous = outputDocumentRef.current;
    outputDocumentRef.current = null;
    setOutputDocument(null);
    setOutput(null);
    setOutputFingerprint(null);
    setWarnings([]);
    setPreservationReport(null);
    if (previous) void previous.loadingTask.destroy().catch(() => undefined);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const manifest = await getProject(projectId);
        if (!manifest) throw new Error("Project not found.");
        const bytes = await loadProjectBytes(manifest);
        if (cancelled) return;
        setProject(manifest);
        await open(manifest, bytes);
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Failed"); }
    })();
    return () => { cancelled = true; abortRef.current?.abort(); void sourceDocumentRef.current?.loadingTask.destroy(); void outputDocumentRef.current?.loadingTask.destroy(); };
  }, [projectId]);

  async function open(manifest: ProjectManifest, bytes: Uint8Array, suppliedPassword?: string) {
    try {
      const pdf = await openPdfWithPdfJs(bytes, suppliedPassword);
      sourceDocumentRef.current = pdf; setDocument(pdf); setPasswordRequired(false); setStatus("Ready");
      onTitleChange?.(`Optimize · ${manifest.name}`, `${pdf.numPages} pages · Choose structural preservation or image-based compression.`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message)) { setPasswordRequired(true); setError("Enter the PDF password. It is used only in this tab and is not saved."); }
      else throw reason;
    }
  }

  async function run() {
    if (!project || !document) return;
    const requestedFingerprint = compressionFingerprint;
    invalidateOutput();
    setProcessing(true); setError(null); setProgress(0); setStatus("Compressing…");
    abortRef.current = new AbortController();
    try {
      await runProjectOperation(project.id, { label: "Compressing PDF", signal: abortRef.current.signal }, async ({ signal, update }) => {
      update({ detail: profile === "smart" ? "Evaluating lossless structural rewrites and preservation evidence…" : profile === "lossless" ? "Reducing file size without converting pages to images…" : "Converting pages to images for stronger compression…", progress: 0.02 });
      const source = await loadProjectBytes(project);
      let resultBytes: Uint8Array;
      if (profile === "smart") {
        const result = await smartOptimizePreservedPdf(source, { mode: smartMode }, password || undefined, signal);
        if (!result.report.passed) throw new Error("Smart optimization did not meet the preservation contract.");
        resultBytes = result.bytes;
        setPreservationReport(result.report);
        setWarnings(result.report.warnings);
      } else if (profile === "lossless") {
        const result = await optimizePdf(source, { password: password || undefined, removeMetadata }, signal);
        resultBytes = result.bytes;
        setWarnings(result.report.warnings);
      } else {
        const selected = RASTER_PROFILES.find((item) => item.id === profile)!;
        resultBytes = await rasterCompressPdf(document, selected, signal, (completed, total) => { const value = completed / total; setProgress(value); setStatus(`Compressing page ${completed} of ${total}…`); update({ detail: `Compressing page ${completed} of ${total}…`, progress: Math.min(0.85, value * 0.85) }); });
        setWarnings(["Strong compression converts each page to an image. Search, forms, links, annotations, signatures, and sharp vector graphics are no longer preserved as interactive PDF content.", ...(removeMetadata ? [] : ["Image-based output contains only new basic document information."])]);
      }
      update({ stage: "validating", detail: "Checking compressed PDF…", progress: 0.9 });
      const summary = await inspectPdfBytes(resultBytes, (profile === "lossless" || profile === "smart") ? (password || undefined) : undefined);
      if (summary.pageCount !== document.numPages) throw new Error("The compressed PDF could not be verified because its page count changed.");
      const outputPdf = await openPdfWithPdfJs(resultBytes, (profile === "lossless" || profile === "smart") ? (password || undefined) : undefined);
      if (outputDocumentRef.current) await outputDocumentRef.current.loadingTask.destroy();
      outputDocumentRef.current = outputPdf; setOutputDocument(outputPdf); setOutput(resultBytes); setOutputFingerprint(requestedFingerprint); setStatus(profile === "smart" && resultBytes.byteLength >= source.byteLength ? "Original retained · no smaller verified copy" : "Compressed PDF checked and ready");
      update({ progress: 1 });
      });
    } catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Failed"); }
    finally { setProcessing(false); setProgress(0); }
  }

  async function save(asProject: boolean) {
    if (!validatedOutput || !project) return;
    if (asProject) {
      await runProjectOperation(project.id, { label: "Saving compressed PDF", cancellable: false, reserveBytes: project.byteLength }, async ({ update }) => {
        update({ stage: "committing", detail: "Checking local storage and saving as a new project…", progress: 0.4 });
        const created = await createDerivedProjectFromBytes(project.id, validatedOutput, `${project.name}-compressed.pdf`, `compress:${profile}`, "application/pdf", (profile === "lossless" || profile === "smart") ? (password || undefined) : undefined);
        update({ progress: 1 });
        window.location.hash = routeHref({ name: "workspace", projectId: created.id, mode: "viewer" }).slice(1);
      });
    } else downloadBlob(new Blob([toOwnedArrayBuffer(validatedOutput)], { type: "application/pdf" }), `${project.name}-compressed.pdf`);
  }

  const reduction = validatedOutput && project ? (1 - validatedOutput.byteLength / project.byteLength) * 100 : null;
  return <div className="compression-page">
    <aside className="compression-controls">
      <p className="eyebrow">Compression & optimization</p><h2>Make the PDF smaller without losing what matters</h2><p>Smart optimization verifies text, images, vectors, forms, comments, links, attachments and other PDF structures before accepting a smaller file. Image-based profiles intentionally flatten interactive content.</p>
      {error ? <div className="error-banner"><strong>Compression issue</strong><span>{error}</span></div> : null}
      {passwordRequired ? <section className="password-panel"><input autoFocus autoComplete="off" onChange={(event) => setPassword(event.target.value)} placeholder="PDF password" type="password" value={password}/><button className="button" disabled={!password || !project} onClick={() => project && void loadProjectBytes(project).then((bytes) => open(project, bytes, password))} type="button">Open PDF</button></section> : null}
      <div className="compression-profiles">
        <label className={profile === "smart" ? "compression-profile compression-profile--active" : "compression-profile"}><input checked={profile === "smart"} disabled={processing} onChange={() => { invalidateOutput(); setProfile("smart"); setStatus("Settings changed · optimize again."); }} type="radio"/><span><strong>Smart · preserve everything</strong><small>Try smaller native PDF rewrites only if every structural check passes. Never rasterizes; keeps the original if there is no verified saving.</small></span></label>
        {profile === "smart" ? <fieldset className="f4-optimizer-modes"><legend>Structural optimization strength</legend>{(Object.entries(SMART_MODES) as Array<[SmartOptimizationMode, typeof SMART_MODES[SmartOptimizationMode]]>).map(([mode, details]) => <label key={mode}><input checked={smartMode === mode} disabled={processing} type="radio" onChange={() => { invalidateOutput(); setSmartMode(mode); setStatus("Settings changed · optimize again."); }} /><span><strong>{details.label}</strong><small>{details.description}</small></span></label>)}</fieldset> : null}
        <label className={profile === "lossless" ? "compression-profile compression-profile--active" : "compression-profile"}><input checked={profile === "lossless"} disabled={processing} onChange={() => { invalidateOutput(); setProfile("lossless"); setStatus("Settings changed · compress again."); }} type="radio"/><span><strong>Keep text and forms</strong><small>Reduce file size without turning pages into images.</small></span></label>
        {RASTER_PROFILES.map((item) => <label className={profile === item.id ? "compression-profile compression-profile--active" : "compression-profile"} key={item.id}><input checked={profile === item.id} disabled={processing} onChange={() => { invalidateOutput(); setProfile(item.id as ProfileId); setStatus("Settings changed · compress again."); }} type="radio"/><span><strong>{item.label}</strong><small>{item.dpi} DPI · {item.description}</small></span></label>)}
      </div>
      <label><input checked={removeMetadata} disabled={processing || profile !== "lossless"} onChange={(event) => { invalidateOutput(); setRemoveMetadata(event.target.checked); setStatus("Settings changed · compress again."); }} type="checkbox"/> Remove document metadata</label>
      <button className="button button--wide" disabled={!document || processing} onClick={() => void run()} type="button">{processing ? "Processing…" : profile === "smart" ? "Run safe optimizer" : "Compress PDF"}</button>
      {processing ? <><progress max="1" value={progress}/><button className="button button--secondary button--wide" onClick={() => abortRef.current?.abort()} type="button">Cancel</button></> : null}
      {preservationReport && validatedOutput ? <section aria-label="Preservation verification" className="f4-verification"><strong>All structural checks passed</strong><p>{SMART_PRESERVED_CATEGORIES.length} preservation categories verified: {SMART_PRESERVED_CATEGORIES.join(", ")}.</p><p>{project && validatedOutput.byteLength < project.byteLength ? "A smaller, validated PDF was selected." : "No candidate was both smaller and fully verified. Original bytes were retained."}</p></section> : null}
      {warnings.length ? <div className="warning-list">{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
    </aside>
    <main className="compression-preview">
      <header className="processing-header"><div><strong>{status}</strong><span>{project ? `${(project.byteLength / 1024 / 1024).toFixed(2)} MB source` : ""}{validatedOutput ? ` → ${(validatedOutput.byteLength / 1024 / 1024).toFixed(2)} MB` : ""}</span></div>{reduction !== null ? <strong className={reduction >= 0 ? "size-positive" : "size-negative"}>{reduction >= 0 ? `${reduction.toFixed(1)}% smaller` : `${Math.abs(reduction).toFixed(1)}% larger`}</strong> : null}</header>
      <div className="compression-compare">{document ? <section><h3>Original</h3><div className="mini-page-preview"><PageCanvas document={document} pageNumber={1} zoom={0.55}/></div></section> : null}{validatedOutputDocument ? <section><h3>Output</h3><div className="mini-page-preview"><PageCanvas document={validatedOutputDocument} pageNumber={1} zoom={0.55}/></div></section> : <section className="empty-state"><strong>No output preview</strong><p>Run a profile to compare the first page.</p></section>}</div>
      {validatedOutput ? <footer className="output-bar"><div><strong>{profile === "smart" && reduction !== null && reduction <= 0 ? "Original preserved without changes" : "Compressed PDF checked and ready"}</strong><span>{validatedOutputDocument?.numPages} pages</span></div><button className="button button--secondary" onClick={() => void save(false)} type="button">Download</button><button className="button" onClick={() => void save(true)} type="button">Save as project</button></footer> : null}
    </main>
  </div>;
}
