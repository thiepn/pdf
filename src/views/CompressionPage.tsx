import { useEffect, useRef, useState } from "react";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { inspectPdfBytes, openPdfWithPdfJs } from "../engines/pdfjs";
import { validatePdfFidelity } from "../fidelity/pdfFidelityClient";
import { optimizePdf } from "../processing/processingClient";
import { rasterCompressPdf, RASTER_PROFILES } from "../processing/rasterCompression";
import {
  compressPdfToTarget,
  MIN_TARGET_SIZE_BYTES,
  type TargetSizeCompressionResult,
  type TargetSizePreservation
} from "../processing/targetSizeCompression";
import { downloadBlob } from "../projects/download";
import { createDerivedProjectFromBytes, getProject, loadProjectBytes } from "../projects/projectRepository";
import { runProjectOperation } from "../operations/projectOperationCoordinator";
import type { ProjectManifest } from "../types/project";
import { PageCanvas } from "../viewer/PageCanvas";
import { routeHref } from "../core/appRouter";

interface Props { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }
type ProfileId = "lossless" | "screen" | "balanced" | "small" | "print";
type CompressionMode = "target" | "profile";
type TargetUnit = "B" | "KB" | "MB";

function targetBytes(value: string, unit: TargetUnit): number {
  const numeric = Number(value);
  const multiplier = unit === "MB" ? 1_000_000 : unit === "KB" ? 1_000 : 1;
  return Math.round(numeric * multiplier);
}

function formatBytes(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} MB`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} KB`;
  return `${value} B`;
}

function suggestedTargetMb(sourceBytes: number): string {
  return Math.max(MIN_TARGET_SIZE_BYTES, Math.round(sourceBytes * 0.7)) / 1_000_000 < 0.01
    ? (Math.max(MIN_TARGET_SIZE_BYTES, Math.round(sourceBytes * 0.7)) / 1_000_000).toFixed(4)
    : (Math.max(MIN_TARGET_SIZE_BYTES, Math.round(sourceBytes * 0.7)) / 1_000_000).toFixed(2);
}

export function CompressionPage({ projectId, onTitleChange }: Props) {
  const sourceDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const outputDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [outputDocument, setOutputDocument] = useState<PDFDocumentProxy | null>(null);
  const [mode, setMode] = useState<CompressionMode>("target");
  const [profile, setProfile] = useState<ProfileId>("lossless");
  const [targetValue, setTargetValue] = useState("");
  const [targetUnit, setTargetUnit] = useState<TargetUnit>("MB");
  const [preservation, setPreservation] = useState<TargetSizePreservation>("preserve-structure");
  const [targetResult, setTargetResult] = useState<TargetSizeCompressionResult | null>(null);
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

  const requestedTargetBytes = targetBytes(targetValue, targetUnit);
  const compressionFingerprint = JSON.stringify({
    mode,
    profile: mode === "profile" ? profile : undefined,
    targetValue: mode === "target" ? targetValue : undefined,
    targetUnit: mode === "target" ? targetUnit : undefined,
    preservation: mode === "target" ? preservation : undefined,
    removeMetadata: mode === "target" || profile === "lossless" ? removeMetadata : false
  });
  const validatedOutput = output && outputFingerprint === compressionFingerprint ? output : null;
  const validatedOutputDocument = validatedOutput ? outputDocument : null;

  function invalidateOutput(): void {
    const previous = outputDocumentRef.current;
    outputDocumentRef.current = null;
    setOutputDocument(null);
    setOutput(null);
    setOutputFingerprint(null);
    setTargetResult(null);
    setWarnings([]);
    if (previous) void previous.loadingTask.destroy().catch(() => undefined);
  }

  function settingsChanged(): void {
    invalidateOutput();
    setError(null);
    setStatus("Settings changed · compress again.");
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
        setTargetValue(suggestedTargetMb(manifest.byteLength));
        setTargetUnit("MB");
        await open(manifest, bytes);
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Failed"); }
    })();
    return () => { cancelled = true; abortRef.current?.abort(); void sourceDocumentRef.current?.loadingTask.destroy(); void outputDocumentRef.current?.loadingTask.destroy(); };
  }, [projectId]);

  async function open(manifest: ProjectManifest, bytes: Uint8Array, suppliedPassword?: string) {
    try {
      const pdf = await openPdfWithPdfJs(bytes, suppliedPassword);
      sourceDocumentRef.current = pdf; setDocument(pdf); setPasswordRequired(false); setStatus("Ready");
      onTitleChange?.(`Compress · ${manifest.name}`, `${pdf.numPages} pages · Target a file size while preserving PDF structure whenever feasible.`);
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
        const source = await loadProjectBytes(project);
        let resultBytes: Uint8Array | undefined;
        let outputPassword: string | undefined;
        let resultWarnings: string[] = [];
        let targetOutcome: TargetSizeCompressionResult["outcome"] | undefined;
        let targetMethod: TargetSizeCompressionResult["method"] | undefined;

        if (mode === "target") {
          if (!Number.isFinite(requestedTargetBytes) || requestedTargetBytes <= 0) throw new Error("Enter a valid target size.");
          update({ detail: "Trying structure-preserving compression first…", progress: 0.02 });
          const result = await compressPdfToTarget(source, document, {
            targetBytes: requestedTargetBytes,
            preservation,
            password: password || undefined,
            removeMetadata,
            signal,
            onProgress: (event) => {
              const fractionalAttempt = event.attempt - 1 + (event.pageProgress ?? 0.08);
              const value = Math.min(0.86, Math.max(0.02, fractionalAttempt / event.maximumAttempts * 0.86));
              setProgress(value);
              setStatus(event.detail);
              update({ detail: event.detail, progress: value });
            }
          });
          setTargetResult(result);
          targetOutcome = result.outcome;
          targetMethod = result.method;
          resultWarnings = result.warnings;
          setWarnings(resultWarnings);
          if (!result.bytes) {
            setStatus(result.outcome === "refused" ? "Target-size compression refused" : "Target not reached");
            update({ detail: result.message, progress: 1 });
            return;
          }
          resultBytes = result.bytes;
          outputPassword = result.method === "structure-preserving" ? (password || undefined) : undefined;
        } else if (profile === "lossless") {
          update({ detail: "Reducing file size without converting pages to images…", progress: 0.02 });
          const result = await optimizePdf(source, { password: password || undefined, removeMetadata }, signal);
          resultBytes = result.bytes;
          outputPassword = password || undefined;
          resultWarnings = result.report.warnings;
          setWarnings(resultWarnings);
        } else {
          update({ detail: "Converting pages to images for stronger compression…", progress: 0.02 });
          const selected = RASTER_PROFILES.find((item) => item.id === profile)!;
          resultBytes = await rasterCompressPdf(document, selected, signal, (completed, total) => {
            const value = completed / total;
            setProgress(value);
            setStatus(`Compressing page ${completed} of ${total}…`);
            update({ detail: `Compressing page ${completed} of ${total}…`, progress: Math.min(0.85, value * 0.85) });
          });
          resultWarnings = ["Strong compression converts each page to an image. Search, forms, links, annotations, signatures, and sharp vector graphics are no longer preserved as interactive PDF content.", ...(removeMetadata ? [] : ["Image-based output contains only new basic document information."])];
          setWarnings(resultWarnings);
        }

        if (!resultBytes) return;
        update({ stage: "validating", detail: "Checking compressed PDF…", progress: 0.9 });
        if (mode === "target" && targetMethod === "structure-preserving") {
          update({ stage: "validating", detail: "Checking structural preservation…", progress: 0.91 });
          const fidelity = await validatePdfFidelity(
            source,
            resultBytes,
            [],
            password || undefined,
            signal,
            {
              sourcePassword: password || undefined,
              outputPassword: password || undefined,
              expectations: { coreMetadataMode: removeMetadata ? "cleared" : "preserve" }
            }
          );
          if (!fidelity.passed) {
            throw new Error(`Structure-preserving compression failed the P8 fidelity gate: ${fidelity.failures.join(" ")}`);
          }
          resultWarnings = [...new Set([...resultWarnings, ...fidelity.warnings])];
          setWarnings(resultWarnings);
        }
        const summary = await inspectPdfBytes(resultBytes, outputPassword);
        if (summary.pageCount !== document.numPages) throw new Error("The compressed PDF could not be verified because its page count changed.");
        if (resultBytes.byteLength >= source.byteLength && mode === "target") throw new Error("Target-size compression refused an output that was not smaller than the source.");
        const outputPdf = await openPdfWithPdfJs(resultBytes, outputPassword);
        if (outputDocumentRef.current) await outputDocumentRef.current.loadingTask.destroy();
        outputDocumentRef.current = outputPdf;
        setOutputDocument(outputPdf);
        setOutput(resultBytes);
        setOutputFingerprint(requestedFingerprint);
        setStatus(mode === "target" && targetOutcome === "best-effort" ? "Best achieved PDF checked and ready" : "Compressed PDF checked and ready");
        update({ progress: 1 });
      });
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("Failed");
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  }

  async function save(asProject: boolean) {
    if (!validatedOutput || !project) return;
    const outputPassword = mode === "target"
      ? (targetResult?.method === "structure-preserving" ? (password || undefined) : undefined)
      : (profile === "lossless" ? (password || undefined) : undefined);
    const operation = mode === "target"
      ? `compress:target:${targetResult?.method ?? preservation}`
      : `compress:${profile}`;
    if (asProject) {
      await runProjectOperation(project.id, { label: "Saving compressed PDF", cancellable: false, reserveBytes: project.byteLength }, async ({ update }) => {
        update({ stage: "committing", detail: "Checking local storage and saving as a new project…", progress: 0.4 });
        const created = await createDerivedProjectFromBytes(project.id, validatedOutput, `${project.name}-compressed.pdf`, operation, "application/pdf", outputPassword);
        update({ progress: 1 });
        window.location.hash = routeHref({ name: "workspace", projectId: created.id, mode: "viewer" }).slice(1);
      });
    } else downloadBlob(new Blob([toOwnedArrayBuffer(validatedOutput)], { type: "application/pdf" }), `${project.name}-compressed.pdf`);
  }

  const reduction = validatedOutput && project ? (1 - validatedOutput.byteLength / project.byteLength) * 100 : null;
  const targetStatusLabel = targetResult?.outcome === "target-met"
    ? "Target met"
    : targetResult?.outcome === "best-effort"
      ? "Best effort · target not reached"
      : targetResult?.outcome === "refused"
        ? "No smaller qualified output"
        : null;

  return <div className="compression-page">
    <aside className="compression-controls">
      <p className="eyebrow">Compression</p>
      <h2>Choose how much to shrink the PDF</h2>
      <p>Set a target size and choose whether PDF structure is mandatory. The optimizer always tries structure-preserving cleanup before any raster fallback.</p>
      {error ? <div className="error-banner"><strong>Compression issue</strong><span>{error}</span></div> : null}
      {passwordRequired ? <section className="password-panel"><input autoFocus autoComplete="off" onChange={(event) => setPassword(event.target.value)} placeholder="PDF password" type="password" value={password}/><button className="button" disabled={!password || !project} onClick={() => project && void loadProjectBytes(project).then((bytes) => open(project, bytes, password))} type="button">Open PDF</button></section> : null}

      <div className="compression-profiles compression-mode-picker">
        <label className={mode === "target" ? "compression-profile compression-profile--active" : "compression-profile"}>
          <input checked={mode === "target"} disabled={processing} onChange={() => { setMode("target"); settingsChanged(); }} type="radio"/>
          <span><strong>Target size</strong><small>Bounded attempts with preservation-first optimization.</small></span>
        </label>
        <label className={mode === "profile" ? "compression-profile compression-profile--active" : "compression-profile"}>
          <input checked={mode === "profile"} disabled={processing} onChange={() => { setMode("profile"); settingsChanged(); }} type="radio"/>
          <span><strong>Manual profile</strong><small>Use the existing fixed lossless or raster profiles.</small></span>
        </label>
      </div>

      {mode === "target" ? <section className="target-size-panel">
        <div className="target-size-input">
          <label>
            <span>Target size</span>
            <input disabled={processing} inputMode="decimal" min="0" onChange={(event) => { setTargetValue(event.target.value); settingsChanged(); }} step="0.01" type="number" value={targetValue}/>
          </label>
          <label>
            <span>Unit</span>
            <select disabled={processing} onChange={(event) => { setTargetUnit(event.target.value as TargetUnit); settingsChanged(); }} value={targetUnit}>
              <option value="MB">MB</option><option value="KB">KB</option><option value="B">bytes</option>
            </select>
          </label>
        </div>
        <small className="muted-copy">The target must be positive and smaller than the source. If it cannot be reached, P15 reports best effort or refusal instead of pretending success.</small>
        <div className="compression-profiles preservation-picker">
          <label className={preservation === "preserve-structure" ? "compression-profile compression-profile--active" : "compression-profile"}>
            <input checked={preservation === "preserve-structure"} disabled={processing} onChange={() => { setPreservation("preserve-structure"); settingsChanged(); }} type="radio"/>
            <span><strong>Keep PDF structure</strong><small>Never rasterize. Searchable text, vectors and interactive PDF content stay structural.</small></span>
          </label>
          <label className={preservation === "allow-raster" ? "compression-profile compression-profile--active" : "compression-profile"}>
            <input checked={preservation === "allow-raster"} disabled={processing} onChange={() => { setPreservation("allow-raster"); settingsChanged(); }} type="radio"/>
            <span><strong>Prioritize the target</strong><small>Try structure first, then progressively lower raster fidelity only if needed.</small></span>
          </label>
        </div>
      </section> : <div className="compression-profiles">
        <label className={profile === "lossless" ? "compression-profile compression-profile--active" : "compression-profile"}><input checked={profile === "lossless"} disabled={processing} onChange={() => { setProfile("lossless"); settingsChanged(); }} type="radio"/><span><strong>Keep text and forms</strong><small>Reduce file size without turning pages into images.</small></span></label>
        {RASTER_PROFILES.map((item) => <label className={profile === item.id ? "compression-profile compression-profile--active" : "compression-profile"} key={item.id}><input checked={profile === item.id} disabled={processing} onChange={() => { setProfile(item.id as ProfileId); settingsChanged(); }} type="radio"/><span><strong>{item.label}</strong><small>{item.dpi} DPI · {item.description}</small></span></label>)}
      </div>}

      <label><input checked={removeMetadata} disabled={processing || (mode === "profile" && profile !== "lossless")} onChange={(event) => { setRemoveMetadata(event.target.checked); settingsChanged(); }} type="checkbox"/> Remove document metadata during the structure-preserving pass</label>
      <button className="button button--wide" disabled={!document || processing || (mode === "target" && !targetValue)} onClick={() => void run()} type="button">{processing ? "Processing…" : mode === "target" ? "Compress to target" : "Compress PDF"}</button>
      {processing ? <><progress max="1" value={progress}/><button className="button button--secondary button--wide" onClick={() => abortRef.current?.abort()} type="button">Cancel</button></> : null}

      {mode === "target" && targetResult ? <section className={`target-size-result target-size-result--${targetResult.outcome}`}>
        <strong>{targetStatusLabel}</strong>
        <dl>
          <div><dt>Source</dt><dd>{formatBytes(targetResult.sourceBytes)}</dd></div>
          <div><dt>Target</dt><dd>{formatBytes(targetResult.targetBytes)}</dd></div>
          <div><dt>Best output</dt><dd>{formatBytes(targetResult.outputBytes)}</dd></div>
          <div><dt>Attempts</dt><dd>{targetResult.attempts.length}</dd></div>
        </dl>
        {targetResult.preservation ? <p><strong>{targetResult.preservation.label}.</strong> {targetResult.preservation.detail}</p> : <p>{targetResult.message}</p>}
      </section> : null}

      {warnings.length ? <div className="warning-list">{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
    </aside>
    <main className="compression-preview">
      <header className="processing-header"><div><strong>{status}</strong><span>{project ? `${formatBytes(project.byteLength)} source` : ""}{mode === "target" && targetValue ? ` · ${formatBytes(requestedTargetBytes)} target` : ""}{validatedOutput ? ` → ${formatBytes(validatedOutput.byteLength)}` : ""}</span></div>{reduction !== null ? <strong className={reduction >= 0 ? "size-positive" : "size-negative"}>{reduction >= 0 ? `${reduction.toFixed(1)}% smaller` : `${Math.abs(reduction).toFixed(1)}% larger`}</strong> : null}</header>
      <div className="compression-compare">{document ? <section><h3>Original</h3><div className="mini-page-preview"><PageCanvas document={document} pageNumber={1} zoom={0.55}/></div></section> : null}{validatedOutputDocument ? <section><h3>Output</h3><div className="mini-page-preview"><PageCanvas document={validatedOutputDocument} pageNumber={1} zoom={0.55}/></div></section> : <section className="empty-state"><strong>No output preview</strong><p>{mode === "target" ? "Run target-size compression to compare the first page." : "Run a profile to compare the first page."}</p></section>}</div>
      {validatedOutput ? <footer className="output-bar"><div><strong>{mode === "target" && targetResult?.outcome === "best-effort" ? "Best achieved PDF checked and ready" : mode === "target" ? "Target-size PDF checked and ready" : "Compressed PDF checked and ready"}</strong><span>{validatedOutputDocument?.numPages} pages{mode === "target" && targetResult ? ` · ${targetResult.attempts.length} attempt${targetResult.attempts.length === 1 ? "" : "s"} · ${targetResult.preservation?.label ?? "preservation unavailable"}` : ""}</span></div><button className="button button--secondary" onClick={() => void save(false)} type="button">Download</button><button className="button" onClick={() => void save(true)} type="button">Save as project</button></footer> : null}
    </main>
  </div>;
}
