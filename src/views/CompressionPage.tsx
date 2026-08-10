import { useEffect, useRef, useState } from "react";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { inspectPdfBytes, openPdfWithPdfJs } from "../engines/pdfjs";
import { optimizePdf } from "../processing/processingClient";
import { rasterCompressPdf, RASTER_PROFILES } from "../processing/rasterCompression";
import { downloadBlob } from "../projects/download";
import { createDerivedProjectFromBytes, getProject, loadProjectBytes } from "../projects/projectRepository";
import { runProjectOperation } from "../operations/projectOperationCoordinator";
import type { ProjectManifest } from "../types/project";
import { PageCanvas } from "../viewer/PageCanvas";
import { routeHref } from "../core/appRouter";

interface Props { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }
type ProfileId = "lossless" | "screen" | "balanced" | "small" | "print";

export function CompressionPage({ projectId, onTitleChange }: Props) {
  const sourceDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const outputDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [outputDocument, setOutputDocument] = useState<PDFDocumentProxy | null>(null);
  const [profile, setProfile] = useState<ProfileId>("lossless");
  const [removeMetadata, setRemoveMetadata] = useState(false);
  const [status, setStatus] = useState("Opening project…");
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [output, setOutput] = useState<Uint8Array | null>(null);
  const [password, setPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);

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
      onTitleChange?.(`Compress · ${manifest.name}`, `${pdf.numPages} pages · Local structural or raster compression.`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message)) { setPasswordRequired(true); setError("Enter the PDF password. It remains in memory only."); }
      else throw reason;
    }
  }

  async function run() {
    if (!project || !document) return;
    setProcessing(true); setError(null); setWarnings([]); setOutput(null); setProgress(0); setStatus("Compressing…");
    abortRef.current = new AbortController();
    try {
      await runProjectOperation(project.id, { label: "Compressing PDF", signal: abortRef.current.signal }, async ({ signal, update }) => {
      update({ detail: profile === "lossless" ? "Optimizing PDF structure…" : "Rasterizing pages…", progress: 0.02 });
      const source = await loadProjectBytes(project);
      let resultBytes: Uint8Array;
      if (profile === "lossless") {
        const result = await optimizePdf(source, { password: password || undefined, removeMetadata }, signal);
        resultBytes = result.bytes;
        setWarnings(result.report.warnings);
      } else {
        const selected = RASTER_PROFILES.find((item) => item.id === profile)!;
        resultBytes = await rasterCompressPdf(document, selected, signal, (completed, total) => { const value = completed / total; setProgress(value); setStatus(`Rasterizing page ${completed} of ${total}…`); update({ detail: `Rasterizing page ${completed} of ${total}…`, progress: Math.min(0.85, value * 0.85) }); });
        setWarnings(["Raster compression converts pages to images. Searchable text, forms, links, annotations, signatures, and vector quality are not preserved.", ...(removeMetadata ? [] : ["Raster output contains only new basic metadata."])]);
      }
      update({ stage: "validating", detail: "Reopening compressed output…", progress: 0.9 });
      const summary = await inspectPdfBytes(resultBytes, profile === "lossless" ? (password || undefined) : undefined);
      if (summary.pageCount !== document.numPages) throw new Error("Compression validation failed: page count changed.");
      const outputPdf = await openPdfWithPdfJs(resultBytes, profile === "lossless" ? (password || undefined) : undefined);
      if (outputDocumentRef.current) await outputDocumentRef.current.loadingTask.destroy();
      outputDocumentRef.current = outputPdf; setOutputDocument(outputPdf); setOutput(resultBytes); setStatus("Compressed output validated");
      update({ progress: 1 });
      });
    } catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Failed"); }
    finally { setProcessing(false); setProgress(0); }
  }

  async function save(asProject: boolean) {
    if (!output || !project) return;
    if (asProject) {
      await runProjectOperation(project.id, { label: "Saving compressed revision", cancellable: false, reserveBytes: project.byteLength }, async ({ update }) => {
        update({ stage: "committing", detail: "Validating storage and writing a new revision…", progress: 0.4 });
        const created = await createDerivedProjectFromBytes(project.id, output, `${project.name}-compressed.pdf`, `compress:${profile}`, "application/pdf", profile === "lossless" ? (password || undefined) : undefined);
        update({ progress: 1 });
        window.location.hash = routeHref({ name: "workspace", projectId: created.id, mode: "viewer" }).slice(1);
      });
    } else downloadBlob(new Blob([toOwnedArrayBuffer(output)], { type: "application/pdf" }), `${project.name}-compressed.pdf`);
  }

  const reduction = output && project ? (1 - output.byteLength / project.byteLength) * 100 : null;
  return <div className="compression-page">
    <aside className="compression-controls">
      <p className="eyebrow">Compression</p><h2>Optimize or raster-compress</h2><p>Lossless mode cleans PDF structure. Raster profiles trade editability and searchability for stronger size reduction.</p>
      {error ? <div className="error-banner"><strong>Compression issue</strong><span>{error}</span></div> : null}
      {passwordRequired ? <section className="password-panel"><input autoFocus autoComplete="off" onChange={(event) => setPassword(event.target.value)} placeholder="PDF password" type="password" value={password}/><button className="button" disabled={!password || !project} onClick={() => project && void loadProjectBytes(project).then((bytes) => open(project, bytes, password))} type="button">Open PDF</button></section> : null}
      <div className="compression-profiles">
        <label className={profile === "lossless" ? "compression-profile compression-profile--active" : "compression-profile"}><input checked={profile === "lossless"} disabled={processing} onChange={() => setProfile("lossless")} type="radio"/><span><strong>Lossless optimization</strong><small>Clean revisions and compress streams without rasterizing pages.</small></span></label>
        {RASTER_PROFILES.map((item) => <label className={profile === item.id ? "compression-profile compression-profile--active" : "compression-profile"} key={item.id}><input checked={profile === item.id} disabled={processing} onChange={() => setProfile(item.id as ProfileId)} type="radio"/><span><strong>{item.label}</strong><small>{item.dpi} DPI · {item.description}</small></span></label>)}
      </div>
      <label><input checked={removeMetadata} disabled={processing || profile !== "lossless"} onChange={(event) => setRemoveMetadata(event.target.checked)} type="checkbox"/> Remove document metadata</label>
      <button className="button button--wide" disabled={!document || processing} onClick={() => void run()} type="button">{processing ? "Processing…" : "Optimize PDF"}</button>
      {processing ? <><progress max="1" value={progress}/><button className="button button--secondary button--wide" onClick={() => abortRef.current?.abort()} type="button">Cancel</button></> : null}
      {warnings.length ? <div className="warning-list">{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
    </aside>
    <main className="compression-preview">
      <header className="processing-header"><div><strong>{status}</strong><span>{project ? `${(project.byteLength / 1024 / 1024).toFixed(2)} MB source` : ""}{output ? ` → ${(output.byteLength / 1024 / 1024).toFixed(2)} MB` : ""}</span></div>{reduction !== null ? <strong className={reduction >= 0 ? "size-positive" : "size-negative"}>{reduction >= 0 ? `${reduction.toFixed(1)}% smaller` : `${Math.abs(reduction).toFixed(1)}% larger`}</strong> : null}</header>
      <div className="compression-compare">{document ? <section><h3>Original</h3><div className="mini-page-preview"><PageCanvas document={document} pageNumber={1} zoom={0.55}/></div></section> : null}{outputDocument ? <section><h3>Output</h3><div className="mini-page-preview"><PageCanvas document={outputDocument} pageNumber={1} zoom={0.55}/></div></section> : <section className="empty-state"><strong>No output preview</strong><p>Run a profile to compare the first page.</p></section>}</div>
      {output ? <footer className="output-bar"><div><strong>Output reopened and validated</strong><span>{outputDocument?.numPages} pages</span></div><button className="button button--secondary" onClick={() => void save(false)} type="button">Download</button><button className="button" onClick={() => void save(true)} type="button">Save as project</button></footer> : null}
    </main>
  </div>;
}
