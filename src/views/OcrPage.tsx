import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { registerPreparedDocumentSnapshot } from "../product/documentSnapshot";
import { readProjectSessionPassword, rememberProjectSessionPassword } from "../security/sessionPasswords";
import { routeHref } from "../core/appRouter";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import { inspectPdfBytes, openPdfWithPdfJs } from "../engines/pdfjs";
import { OcrLanguagePanel } from "../ocr/OcrLanguagePanel";
import { OcrReviewCanvas } from "../ocr/OcrReviewCanvas";
import { applyOcrTextLayer } from "../ocr/ocrLayerClient";
import { buildOcrLayerPages, mergeRegionRecognition, ocrConfidenceBand, ocrWordText, restoreOcrWord, updateOcrWord, type NormalizedOcrRect } from "../ocr/ocrLayer";
import { createOcrSession } from "../ocr/ocrClient";
import { DEFAULT_OCR_PREPROCESS } from "../ocr/preprocess";
import { renderPdfPageForOcr, renderPdfRegionForOcr } from "../ocr/renderPage";
import { buildOcrRecipeFingerprint } from "../ocr/recipe";
import { deleteOcrJob, listOcrJobs, listOcrPages, writeOcrJob, writeOcrPage } from "../ocr/ocrRepository";
import { parsePageSelection } from "../organizer/pageSelection";
import { downloadBlob } from "../projects/download";
import { createDerivedProjectFromBytes, getProject, loadProjectBytes } from "../projects/projectRepository";
import { runProjectOperation } from "../operations/projectOperationCoordinator";
import { OCR_SCHEMA_VERSION, type OcrJob, type OcrPageResult, type OcrPreprocessSettings } from "../types/ocr";
import type { ProjectManifest } from "../types/project";

interface Props { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }

function newJob(project: ProjectManifest, pages: number[], languages: string[], preprocess: OcrPreprocessSettings): OcrJob {
  const now = Date.now();
  return { schemaVersion: OCR_SCHEMA_VERSION, id: crypto.randomUUID(), kind: "pdf", projectId: project.id, name: `${project.name} OCR`, languages, pageNumbers: pages, preprocess, recipeFingerprint: buildOcrRecipeFingerprint({ pageNumbers: pages, languages, preprocess }), status: "draft", completedPages: 0, totalPages: pages.length, createdAt: now, updatedAt: now };
}

function ocrResultsFingerprint(results: OcrPageResult[]): string {
  return results
    .filter((item) => item.status === "complete")
    .map((item) => `${item.id}:${item.updatedAt}:${item.words.length}`)
    .sort()
    .join("|");
}

export function OcrPage({ projectId, onTitleChange }: Props) {
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const sourceBytesRef = useRef<Uint8Array | null>(null);
  const sessionRef = useRef<Awaited<ReturnType<typeof createOcrSession>> | null>(null);
  const abortRef = useRef(false);
  const activePasswordRef = useRef<string | undefined>(undefined);
  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageExpression, setPageExpression] = useState("1-last");
  const [languages, setLanguages] = useState<string[]>([]);
  const [preprocess, setPreprocess] = useState<OcrPreprocessSettings>(DEFAULT_OCR_PREPROCESS);
  const [job, setJob] = useState<OcrJob | null>(null);
  const [results, setResults] = useState<OcrPageResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Opening project…");
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<Uint8Array | null>(null);
  const [outputFingerprint, setOutputFingerprint] = useState<string | null>(null);
  const [reviewPageNumber, setReviewPageNumber] = useState<number | null>(null);
  const [selectedWord, setSelectedWord] = useState<number | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState("");
  const [reviewRegion, setReviewRegion] = useState<NormalizedOcrRect | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const manifest = await getProject(projectId);
        if (!manifest) throw new Error("Project not found.");
        const bytes = await loadProjectBytes(manifest);
        if (cancelled) return;
        setProject(manifest);
        sourceBytesRef.current = bytes;
        await openDocument(manifest, bytes, readProjectSessionPassword(projectId));
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Failed"); }
    })();
    return () => { cancelled = true; abortRef.current = true; void sessionRef.current?.terminate(); sessionRef.current = null; sourceBytesRef.current = null; const current = documentRef.current; documentRef.current = null; if (current) void current.loadingTask.destroy(); };
  }, [projectId]);

  async function openDocument(manifest: ProjectManifest, bytes: Uint8Array, suppliedPassword?: string) {
    try {
      const pdf = await openPdfWithPdfJs(bytes, suppliedPassword);
      if (suppliedPassword) rememberProjectSessionPassword(projectId, suppliedPassword);
      setPassword(""); setError(null);
      documentRef.current = pdf; sourceBytesRef.current = bytes; activePasswordRef.current = suppliedPassword; setDocument(pdf); setPageExpression(`1-${pdf.numPages}`); setPasswordRequired(false); setStatus("Ready");
      onTitleChange?.(`OCR · ${manifest.name}`, `${pdf.numPages} pages · Searchable output is generated locally.`);
      const existing = (await listOcrJobs(manifest.id)).find((candidate) => candidate.status !== "cancelled");
      if (existing) {
        const savedResults = await listOcrPages(existing.id);
        setJob(existing); setLanguages(existing.languages); setPreprocess(existing.preprocess); setPageExpression(existing.pageNumbers.join(",")); setResults(savedResults);
        setReviewPageNumber(savedResults.find((item) => item.status === "complete")?.pageNumber ?? null);
        setStatus(existing.status === "complete" ? "Loaded reusable OCR results. Review or rebuild the searchable layer." : "Resumed an unfinished OCR session.");
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message)) { setPasswordRequired(true); setError("Enter the PDF password. It is used only in this tab and is not saved."); }
      else throw reason;
    }
  }

  const parsedPages = useMemo(() => {
    const parsed = document ? parsePageSelection(pageExpression, document.numPages) : { pages: new Set<number>(), errors: [] as string[] };
    return { ...parsed, pageArray: [...parsed.pages].sort((a, b) => a - b) };
  }, [pageExpression, document]);
  const completed = results.filter((item) => item.status === "complete").length;
  const running = job?.status === "running";

  const currentRecipe = buildOcrRecipeFingerprint({ pageNumbers: parsedPages.pageArray, languages, preprocess });
  const currentResultsFingerprint = ocrResultsFingerprint(results);
  const outputIsCurrent = Boolean(output && job?.recipeFingerprint === currentRecipe && outputFingerprint === currentResultsFingerprint);
  const reviewResult = useMemo(() => results.find((item) => item.pageNumber === reviewPageNumber && item.status === "complete") ?? null, [results, reviewPageNumber]);
  const selectedReviewWord = reviewResult && selectedWord !== null ? reviewResult.words[selectedWord] : undefined;
  const lowConfidenceCount = reviewResult?.words.filter((word) => !word.ignored && ocrConfidenceBand(word.confidence) === "low").length ?? 0;
  useEffect(() => {
    if (!running && !outputIsCurrent) return;
    return registerPreparedDocumentSnapshot(projectId, async (signal) => {
      signal?.throwIfAborted();
      if (running || !output) throw new Error("Finish or pause OCR before switching tools. Your original document has not been substituted.");
      const bytes = Uint8Array.from(output);
      return { file: new File([bytes.buffer], `${project?.name ?? "document"}-searchable.pdf`, { type: "application/pdf" }), bytes, changed: true,
        warnings: ["OCR adds a positioned invisible text layer to the original PDF pages. Original page graphics and structure are retained; modifying PDF bytes means existing digital signatures require re-validation."] };
    });
  }, [projectId, output, outputIsCurrent, running, project?.name]);

  async function run() {
    try { await runOcr(); }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Could not start OCR");
      setJob((current) => current ? { ...current, status: "failed" } : null);
      await sessionRef.current?.terminate(); sessionRef.current = null; setProgress(0);
    }
  }
  async function runOcr() {
    if (!project || !document) return;
    if (parsedPages.errors.length) { setError(parsedPages.errors.join(" ")); return; }
    if (!parsedPages.pageArray.length) { setError("Select at least one page."); return; }
    if (!languages.length) { setError("Install and select at least one OCR language."); return; }
    setError(null); setOutput(null); setOutputFingerprint(null); abortRef.current = false;
    const recipeFingerprint = buildOcrRecipeFingerprint({ pageNumbers: parsedPages.pageArray, languages, preprocess });
    let activeJob = job;
    const recipeChanged = Boolean(activeJob && activeJob.recipeFingerprint !== recipeFingerprint);
    if (!activeJob || activeJob.status === "complete" || recipeChanged) {
      if (activeJob && activeJob.status !== "complete") await deleteOcrJob(activeJob.id);
      activeJob = newJob(project, parsedPages.pageArray, languages, preprocess);
      setJob(activeJob); setResults([]); await writeOcrJob(activeJob);
      if (recipeChanged) setStatus("OCR settings changed · previous saved page results were cleared.");
    }
    if (!activeJob) throw new Error("OCR could not start.");
    let runningJob: OcrJob = { ...activeJob, schemaVersion: OCR_SCHEMA_VERSION, languages, preprocess, recipeFingerprint, pageNumbers: parsedPages.pageArray, totalPages: parsedPages.pageArray.length, status: "running", error: undefined, updatedAt: Date.now() };
    setJob(runningJob); await writeOcrJob(runningJob);
    let session: Awaited<ReturnType<typeof createOcrSession>> | null = null;
    try {
      const previous = new Map((await listOcrPages(runningJob.id)).map((item) => [item.pageNumber, item]));
      session = await createOcrSession(languages, (message) => { setProgress(message.progress); setStatus(`${message.status} · ${Math.round(message.progress * 100)}%`); });
      sessionRef.current = session;
      const activeSession = session;
      const nextResults: OcrPageResult[] = [...previous.values()];
      await runProjectOperation(project.id, { label: "Running OCR", cancellable: false }, async ({ update, signal }) => {
      update({ detail: "Recognizing selected pages locally…", progress: 0.02 });
      for (let pageIndex = 0; pageIndex < parsedPages.pageArray.length; pageIndex += 1) {
        const pageNumber = parsedPages.pageArray[pageIndex];
        if (abortRef.current) throw new DOMException("OCR paused.", "AbortError");
        const existing = previous.get(pageNumber);
        if (existing?.status === "complete" && (existing.words.length > 0 || !existing.text.trim())) continue;
        update({ detail: `Preparing page ${pageNumber}…`, progress: Math.min(0.78, (pageIndex / parsedPages.pageArray.length) * 0.78) });
        setStatus(`Preparing page ${pageNumber}…`);
        const rendered = await renderPdfPageForOcr(document, pageNumber, preprocess);
        const pending: OcrPageResult = { id: `${runningJob.id}:${pageNumber}`, jobId: runningJob.id, projectId: project.id, pageNumber, status: "recognizing", text: "", confidence: 0, words: [], width: rendered.width, height: rendered.height, updatedAt: Date.now() };
        await writeOcrPage(pending);
        setStatus(`Recognizing page ${pageNumber}…`);
        update({ detail: `Recognizing page ${pageNumber}…`, progress: Math.min(0.82, ((pageIndex + 0.5) / parsedPages.pageArray.length) * 0.82) });
        try {
          const recognized = await activeSession.recognize(rendered.blob, `${runningJob.id}-${pageNumber}`);
          const pageResult: OcrPageResult = { ...pending, status: "complete", text: recognized.text, confidence: recognized.confidence, words: recognized.words, hocr: recognized.hocr, tsv: recognized.tsv, updatedAt: Date.now() };
          await writeOcrPage(pageResult);
          previous.set(pageNumber, pageResult);
          const index = nextResults.findIndex((item) => item.pageNumber === pageNumber);
          if (index >= 0) nextResults[index] = pageResult; else nextResults.push(pageResult);
          setResults([...nextResults].sort((a,b) => a.pageNumber-b.pageNumber));
          const completedPages = [...previous.values()].filter((item) => item.status === "complete").length;
          runningJob = { ...runningJob, completedPages, updatedAt: Date.now() };
          setJob(runningJob); await writeOcrJob(runningJob);
        } catch (reason) {
          const failed = { ...pending, status: "failed" as const, error: reason instanceof Error ? reason.message : String(reason), updatedAt: Date.now() };
          await writeOcrPage(failed); previous.set(pageNumber, failed); setResults([...previous.values()].sort((a,b) => a.pageNumber-b.pageNumber));
        }
      }
      const finalPages = parsedPages.pageArray
        .map((number) => previous.get(number))
        .filter((item): item is OcrPageResult => Boolean(item?.status === "complete"));
      if (finalPages.length !== parsedPages.pageArray.length) throw new Error(`${parsedPages.pageArray.length - finalPages.length} page(s) failed. Retry them before exporting.`);
      const layerPages = buildOcrLayerPages(finalPages);
      if (!layerPages.length) throw new Error("OCR completed, but no searchable words were recognized on the selected pages.");
      if (!sourceBytesRef.current) throw new Error("The original PDF bytes are no longer available in this session.");
      setStatus("Adding searchable text to the original PDF…");
      update({ detail: "Adding a positioned text layer without replacing page artwork…", progress: 0.86 });
      const layered = await applyOcrTextLayer(sourceBytesRef.current, layerPages, activePasswordRef.current, signal);
      update({ stage: "validating", detail: "Checking source-preserving searchable PDF…", progress: 0.93 });
      const summary = await inspectPdfBytes(layered.bytes, activePasswordRef.current);
      if (summary.pageCount !== document.numPages) throw new Error("The searchable PDF could not be verified because its original page count changed.");
      setOutput(layered.bytes);
      setOutputFingerprint(ocrResultsFingerprint(finalPages));
      setReviewPageNumber((current) => current ?? finalPages[0]?.pageNumber ?? null);
      runningJob = { ...runningJob, status: "complete", completedPages: finalPages.length, updatedAt: Date.now() };
      setJob(runningJob); await writeOcrJob(runningJob);
      setStatus(layered.warnings.length ? "Searchable PDF ready · review skipped script warnings before saving" : "Searchable PDF ready · original page visuals preserved");
      update({ progress: 1 });
      });
    } catch (reason) {
      const paused = reason instanceof DOMException && reason.name === "AbortError";
      runningJob = { ...runningJob, status: paused ? "paused" : "failed", error: paused ? undefined : reason instanceof Error ? reason.message : String(reason), updatedAt: Date.now() };
      setJob(runningJob); await writeOcrJob(runningJob); if (!paused) setError(runningJob.error ?? "OCR failed."); setStatus(paused ? "Paused" : "Failed");
    } finally { await session?.terminate(); sessionRef.current = null; setProgress(0); }
  }

  async function persistReviewedPage(next: OcrPageResult, message: string): Promise<void> {
    await writeOcrPage(next);
    setResults((current) => current.map((item) => item.id === next.id ? next : item));
    setOutputFingerprint(null);
    setStatus(message);
  }

  async function saveWordCorrection(): Promise<void> {
    if (!reviewResult || selectedWord === null || !reviewResult.words[selectedWord]) return;
    await persistReviewedPage(updateOcrWord(reviewResult, selectedWord, correctionDraft), correctionDraft.trim() ? "OCR correction saved · rebuild the searchable PDF when review is complete" : "OCR word excluded · rebuild the searchable PDF when review is complete");
  }

  async function restoreSelectedWord(): Promise<void> {
    if (!reviewResult || selectedWord === null || !reviewResult.words[selectedWord]) return;
    const next = restoreOcrWord(reviewResult, selectedWord);
    setCorrectionDraft(next.words[selectedWord]?.text ?? "");
    await persistReviewedPage(next, "Original OCR word restored · rebuild the searchable PDF when review is complete");
  }

  async function recognizeReviewRegion(): Promise<void> {
    if (!document || !reviewResult || !reviewRegion || !languages.length || reviewBusy) return;
    if (reviewRegion.x1 - reviewRegion.x0 < .01 || reviewRegion.y1 - reviewRegion.y0 < .01) {
      setError("Drag a larger OCR review region first.");
      return;
    }
    setReviewBusy(true); setError(null); setStatus(`Re-recognizing page ${reviewResult.pageNumber} region…`);
    let session: Awaited<ReturnType<typeof createOcrSession>> | null = null;
    try {
      const rendered = await renderPdfRegionForOcr(document, reviewResult.pageNumber, preprocess, reviewRegion);
      session = await createOcrSession(languages, (message) => setStatus(`Region OCR · ${message.status} · ${Math.round(message.progress * 100)}%`));
      const recognized = await session.recognize(rendered.blob, `${reviewResult.jobId}-region-${Date.now()}`);
      const next = mergeRegionRecognition(reviewResult, reviewRegion, recognized.words, rendered);
      await persistReviewedPage(next, `Region OCR updated ${recognized.words.length} word${recognized.words.length === 1 ? "" : "s"} · review before export`);
      setSelectedWord(null); setCorrectionDraft(""); setReviewRegion(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("Region OCR failed");
    } finally {
      await session?.terminate();
      setReviewBusy(false);
    }
  }

  async function rebuildSearchableOutput(): Promise<void> {
    if (!project || !document || !sourceBytesRef.current || reviewBusy) return;
    const completePages = results.filter((item) => item.status === "complete");
    const layerPages = buildOcrLayerPages(completePages);
    if (!layerPages.length) { setError("No recognized text is available to add to the PDF."); return; }
    setReviewBusy(true); setError(null);
    try {
      await runProjectOperation(project.id, { label: "Building searchable PDF", cancellable: true }, async ({ signal, update }) => {
        setStatus("Adding reviewed OCR text to the original PDF…");
        update({ detail: "Keeping original pages and adding an invisible positioned text layer…", progress: .25 });
        const layered = await applyOcrTextLayer(sourceBytesRef.current!, layerPages, activePasswordRef.current, signal);
        update({ stage: "validating", detail: "Checking source-preserving OCR output…", progress: .82 });
        const summary = await inspectPdfBytes(layered.bytes, activePasswordRef.current);
        if (summary.pageCount !== document.numPages) throw new Error("The searchable PDF could not be verified because its original page count changed.");
        setOutput(layered.bytes);
        setOutputFingerprint(ocrResultsFingerprint(completePages));
        setStatus(layered.warnings.length ? "Searchable PDF ready · some unsupported-script words were omitted" : "Searchable PDF ready · original page visuals preserved");
        update({ progress: 1 });
      });
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("Searchable output needs rebuilding");
    } finally { setReviewBusy(false); }
  }

  async function saveOutput(asProject: boolean, destination: "viewer" | "editor" = "viewer") {
    if (!output || !project || !outputIsCurrent) return;
    if (asProject) {
      try {
        await runProjectOperation(project.id, { label: "Saving searchable PDF", cancellable: false, reserveBytes: project.byteLength }, async ({ update }) => {
          update({ stage: "committing", detail: "Checking local storage and saving as a new project…", progress: 0.4 });
          const created = await createDerivedProjectFromBytes(project.id, output, `${project.name}-searchable.pdf`, "ocr-searchable");
          if (job) { const updated = { ...job, outputProjectId: created.id, updatedAt: Date.now() }; setJob(updated); await writeOcrJob(updated); }
          update({ progress: 1 });
          window.location.hash = routeHref(destination === "editor" ? { name: "workspace", projectId: created.id, mode: "editor" } : { name: "viewer", projectId: created.id }).slice(1);
        });
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    } else downloadBlob(new Blob([toOwnedArrayBuffer(output)], { type: "application/pdf" }), `${project.name}-searchable.pdf`);
  }

  return <div className="ocr-workspace ocr-workspace--review">
    <aside className="ocr-controls">
      <section>
        <p className="eyebrow">Local OCR</p>
        <h2>Make scans searchable and correct the text</h2>
        <p>Recognition runs on this device. PDF Studio keeps the original PDF pages and adds a positioned invisible text layer only after you review the result.</p>
      </section>
      {error ? <div className="error-banner" role="alert"><strong>OCR issue</strong><span>{error}</span></div> : null}
      {passwordRequired ? <section className="password-panel">
        <input autoFocus autoComplete="off" onChange={(event) => setPassword(event.target.value)} aria-label="PDF password" placeholder="PDF password" type="password" value={password}/>
        <button className="button" disabled={!password || !project} onClick={() => project && void loadProjectBytes(project).then((bytes) => openDocument(project, bytes, password))} type="button">Open PDF</button>
      </section> : null}
      <label className="field-label">Pages
        <input disabled={running} onChange={(event) => setPageExpression(event.target.value)} placeholder="all, 1-5, odd" value={pageExpression}/>
        <small>{parsedPages.errors[0] ?? `${parsedPages.pageArray.length} page(s) selected · Examples: all · 1-5 · odd`}</small>
        <small>Only selected pages are recognized. Every original PDF page remains in the searchable output.</small>
      </label>
      <div className="setting-grid">
        <label>Recognition quality
          <select disabled={running} onChange={(event) => setPreprocess({ ...preprocess, scale: Number(event.target.value) })} value={preprocess.scale}>
            <option value="1.5">Fast</option><option value="2">Balanced (recommended)</option><option value="3">Best recognition</option>
          </select>
          <small>Higher quality can recognize small text better but takes longer.</small>
        </label>
      </div>
      <details className="ocr-advanced-settings"><summary>Advanced image cleanup</summary><div className="setting-grid">
        <label>Contrast<input disabled={running} max="2" min="0.5" onChange={(event) => setPreprocess({ ...preprocess, contrast: Number(event.target.value) })} step="0.05" type="range" value={preprocess.contrast}/><small>Increase when text is faint; reduce if dark areas merge together.</small></label>
        <label><input checked={preprocess.grayscale} disabled={running} onChange={(event) => setPreprocess({ ...preprocess, grayscale: event.target.checked })} type="checkbox"/> Convert page to grayscale before recognition</label>
        <label><input checked={preprocess.invert} disabled={running} onChange={(event) => setPreprocess({ ...preprocess, invert: event.target.checked })} type="checkbox"/> Invert light/dark colors before recognition</label>
      </div></details>
      <OcrLanguagePanel disabled={running} onChange={setLanguages} selected={languages}/>
      <div className="ocr-actions">
        <button className="button" disabled={!document || running || !languages.length} onClick={() => void run()} type="button">{job?.status === "complete" ? "Run OCR again" : job?.status === "paused" || completed ? "Resume OCR" : "Start OCR"}</button>
        {running ? <button className="button button--secondary" onClick={() => { abortRef.current = true; void sessionRef.current?.terminate(); }} type="button">Pause</button> : null}
        {job ? <button className="button button--ghost" disabled={running || reviewBusy} onClick={() => void deleteOcrJob(job.id).then(() => {
          setJob(null); setResults([]); setOutput(null); setOutputFingerprint(null); setReviewPageNumber(null); setSelectedWord(null); setCorrectionDraft(""); setReviewRegion(null); setStatus("Ready");
        })} type="button">Discard progress</button> : null}
      </div>
    </aside>
    <main className="ocr-results">
      <header className="processing-header">
        <div><strong>{status}</strong><span>{completed}/{job?.totalPages ?? parsedPages.pageArray.length} pages complete</span></div>
        {running ? <progress max="1" value={progress}/> : null}
      </header>

      {results.some((item) => item.status === "complete") ? <>
        <nav aria-label="OCR review pages" className="ocr-review-page-tabs">
          {results.filter((item) => item.status === "complete").map((result) => {
            const lows = result.words.filter((word) => !word.ignored && ocrConfidenceBand(word.confidence) === "low").length;
            return <button aria-current={reviewPageNumber === result.pageNumber ? "page" : undefined} className={reviewPageNumber === result.pageNumber ? "active" : ""} key={result.id} onClick={() => {
              setReviewPageNumber(result.pageNumber); setSelectedWord(null); setCorrectionDraft(""); setReviewRegion(null);
            }} type="button">
              <strong>Page {result.pageNumber}</strong><span>{result.words.length} words{lows ? ` · ${lows} low confidence` : ""}</span>
            </button>;
          })}
        </nav>

        {reviewResult && document ? <div className="ocr-review-layout">
          <OcrReviewCanvas
            document={document}
            onRegionChange={setReviewRegion}
            onSelectWord={(index) => {
              setSelectedWord(index);
              setCorrectionDraft(ocrWordText(reviewResult.words[index]));
            }}
            region={reviewRegion}
            result={reviewResult}
            selectedWord={selectedWord}
          />
          <aside className="ocr-review-properties">
            <div className="section-heading"><div><p className="eyebrow">Review page {reviewResult.pageNumber}</p><h3>Recognized text</h3></div><span>{Math.round(reviewResult.confidence)}%</span></div>
            <div className="ocr-review-metrics">
              <span><strong>{reviewResult.words.length}</strong> words</span>
              <span><strong>{lowConfidenceCount}</strong> low confidence</span>
              <span><strong>{reviewResult.words.filter((word) => word.corrected).length}</strong> corrected</span>
            </div>
            <p className="muted-copy">Red boxes need the most attention. Yellow boxes are worth reviewing. Corrections change only the searchable text layer; the scanned page image stays untouched.</p>

            {selectedReviewWord ? <section className="ocr-word-editor">
              <p className="eyebrow">Selected word · {Math.round(selectedReviewWord.confidence)}% confidence</p>
              <label>Recognized text
                <input aria-label="Correct recognized word" onChange={(event) => setCorrectionDraft(event.target.value)} value={correctionDraft}/>
              </label>
              {selectedReviewWord.corrected ? <small>Original OCR: {selectedReviewWord.text}</small> : null}
              <div>
                <button className="button button--small" disabled={reviewBusy} onClick={() => void saveWordCorrection()} type="button">Save correction</button>
                <button className="button button--small button--secondary" disabled={reviewBusy} onClick={() => void persistReviewedPage(updateOcrWord(reviewResult, selectedWord!, ""), "OCR word excluded · rebuild the searchable PDF when review is complete").then(() => setCorrectionDraft(""))} type="button">Exclude word</button>
                {selectedReviewWord.corrected || selectedReviewWord.ignored ? <button className="button button--small button--ghost" disabled={reviewBusy} onClick={() => void restoreSelectedWord()} type="button">Restore OCR</button> : null}
              </div>
            </section> : <div className="ocr-review-empty"><strong>Select a word</strong><span>Click a recognition box on the page to correct or exclude it.</span></div>}

            <section className="ocr-region-review">
              <p className="eyebrow">Region OCR</p>
              <p>{reviewRegion ? "Selected region is ready for recognition." : "Drag across a difficult area on the page to recognize only that region again."}</p>
              <div>
                <button className="button button--small button--secondary" disabled={!reviewRegion || reviewBusy || running || !languages.length} onClick={() => void recognizeReviewRegion()} type="button">{reviewBusy ? "Working…" : "Re-recognize region"}</button>
                {reviewRegion ? <button className="button button--small button--ghost" disabled={reviewBusy} onClick={() => setReviewRegion(null)} type="button">Clear region</button> : null}
              </div>
            </section>
          </aside>
        </div> : null}
      </> : <div className="empty-state"><strong>No OCR results yet</strong><p>Select pages and installed languages, then start recognition.</p></div>}

      {results.some((item) => item.status === "failed") ? <div className="ocr-page-errors">
        {results.filter((item) => item.status === "failed").map((item) => <p key={item.id}><strong>Page {item.pageNumber}:</strong> {item.error ?? "Recognition failed."}</p>)}
      </div> : null}

      {results.some((item) => item.status === "complete") && !running && !outputIsCurrent ? <div className="ocr-build-layer">
        <div><strong>{output ? "OCR review changed" : "Recognition is ready for review"}</strong><span>{output ? "Rebuild the searchable PDF to include the latest corrections." : "Build a searchable copy after reviewing low-confidence text."}</span></div>
        <button className="button" disabled={reviewBusy} onClick={() => void rebuildSearchableOutput()} type="button">{reviewBusy ? "Building…" : "Build searchable PDF"}</button>
      </div> : null}

      {outputIsCurrent && output ? <footer className="output-bar">
        <div><strong>Source-preserving searchable PDF checked and ready</strong><span>{(output.byteLength / 1024 / 1024).toFixed(2)} MB · original pages retained</span></div>
        <button className="button" onClick={() => void saveOutput(false)} type="button">Download searchable PDF</button>
        <button className="button button--secondary" onClick={() => downloadBlob(new Blob([
          results.filter((item) => item.status === "complete").map((item) => `Page ${item.pageNumber}\n${item.words.filter((word) => !word.ignored).map(ocrWordText).filter(Boolean).join(" ")}`).join("\n\n")
        ], { type: "text/plain;charset=utf-8" }), `${project?.name ?? "document"}-recognized.txt`)} type="button">Download text</button>
        <button className="button button--secondary" onClick={() => void saveOutput(true, "viewer")} type="button">Save project copy</button>
        <button className="button button--secondary" onClick={() => void saveOutput(true, "editor")} type="button">Continue in Edit</button>
      </footer> : null}
    </main>
  </div>;
}
