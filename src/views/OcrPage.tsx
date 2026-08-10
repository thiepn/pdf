import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { routeHref } from "../core/appRouter";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import { extractPageText, inspectPdfBytes, openPdfWithPdfJs } from "../engines/pdfjs";
import { OcrLanguagePanel } from "../ocr/OcrLanguagePanel";
import { createOcrSession } from "../ocr/ocrClient";
import { DEFAULT_OCR_PREPROCESS } from "../ocr/preprocess";
import { renderPdfPageForOcr } from "../ocr/renderPage";
import { buildOcrRecipeFingerprint } from "../ocr/recipe";
import { deleteOcrJob, listOcrJobs, listOcrPages, writeOcrJob, writeOcrPage } from "../ocr/ocrRepository";
import { parsePageSelection } from "../organizer/pageSelection";
import { downloadBlob } from "../projects/download";
import { createDerivedProjectFromBytes, getProject, loadProjectBytes } from "../projects/projectRepository";
import { runProjectOperation } from "../operations/projectOperationCoordinator";
import { mergePdfSources } from "../tools/pageOperationsClient";
import { OCR_SCHEMA_VERSION, type OcrJob, type OcrPageResult, type OcrPreprocessSettings } from "../types/ocr";
import type { ProjectManifest } from "../types/project";

interface Props { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }

function newJob(project: ProjectManifest, pages: number[], languages: string[], preprocess: OcrPreprocessSettings): OcrJob {
  const now = Date.now();
  return { schemaVersion: OCR_SCHEMA_VERSION, id: crypto.randomUUID(), kind: "pdf", projectId: project.id, name: `${project.name} OCR`, languages, pageNumbers: pages, preprocess, recipeFingerprint: buildOcrRecipeFingerprint({ pageNumbers: pages, languages, preprocess }), status: "draft", completedPages: 0, totalPages: pages.length, createdAt: now, updatedAt: now };
}

export function OcrPage({ projectId, onTitleChange }: Props) {
  const documentRef = useRef<PDFDocumentProxy | null>(null);
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
        await openDocument(manifest, bytes);
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Failed"); }
    })();
    return () => { cancelled = true; abortRef.current = true; void sessionRef.current?.terminate(); sessionRef.current = null; const current = documentRef.current; documentRef.current = null; if (current) void current.loadingTask.destroy(); };
  }, [projectId]);

  async function openDocument(manifest: ProjectManifest, bytes: Uint8Array, suppliedPassword?: string) {
    try {
      const pdf = await openPdfWithPdfJs(bytes, suppliedPassword);
      documentRef.current = pdf; activePasswordRef.current = suppliedPassword; setDocument(pdf); setPageExpression(`1-${pdf.numPages}`); setPasswordRequired(false); setStatus("Ready");
      onTitleChange?.(`OCR · ${manifest.name}`, `${pdf.numPages} pages · Searchable output is generated locally.`);
      const existing = (await listOcrJobs(manifest.id)).find((candidate) => candidate.status !== "complete" && candidate.status !== "cancelled");
      if (existing) { setJob(existing); setLanguages(existing.languages); setPreprocess(existing.preprocess); setPageExpression(existing.pageNumbers.join(",")); setResults(await listOcrPages(existing.id)); setStatus("Recovered an unfinished OCR job."); }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message)) { setPasswordRequired(true); setError("Enter the PDF password. It is held only in memory."); }
      else throw reason;
    }
  }

  const parsedPages = useMemo(() => {
    const parsed = document ? parsePageSelection(pageExpression, document.numPages) : { pages: new Set<number>(), errors: [] as string[] };
    return { ...parsed, pageArray: [...parsed.pages].sort((a, b) => a - b) };
  }, [pageExpression, document]);
  const completed = results.filter((item) => item.status === "complete").length;
  const running = job?.status === "running";

  async function run() {
    if (!project || !document) return;
    if (parsedPages.errors.length) { setError(parsedPages.errors.join(" ")); return; }
    if (!parsedPages.pageArray.length) { setError("Select at least one page."); return; }
    if (!languages.length) { setError("Install and select at least one OCR language."); return; }
    setError(null); setOutput(null); abortRef.current = false;
    const recipeFingerprint = buildOcrRecipeFingerprint({ pageNumbers: parsedPages.pageArray, languages, preprocess });
    let activeJob = job;
    const recipeChanged = Boolean(activeJob && activeJob.recipeFingerprint !== recipeFingerprint);
    if (!activeJob || activeJob.status === "complete" || recipeChanged) {
      if (activeJob && activeJob.status !== "complete") await deleteOcrJob(activeJob.id);
      activeJob = newJob(project, parsedPages.pageArray, languages, preprocess);
      setJob(activeJob); setResults([]); await writeOcrJob(activeJob);
      if (recipeChanged) setStatus("OCR settings changed · previous cached pages were invalidated.");
    }
    if (!activeJob) throw new Error("OCR job could not be initialized.");
    let runningJob: OcrJob = { ...activeJob, schemaVersion: OCR_SCHEMA_VERSION, languages, preprocess, recipeFingerprint, pageNumbers: parsedPages.pageArray, totalPages: parsedPages.pageArray.length, status: "running", error: undefined, updatedAt: Date.now() };
    setJob(runningJob); await writeOcrJob(runningJob);
    const previous = new Map((await listOcrPages(runningJob.id)).map((item) => [item.pageNumber, item]));
    const session = await createOcrSession(languages, (message) => { setProgress(message.progress); setStatus(`${message.status} · ${Math.round(message.progress * 100)}%`); });
    sessionRef.current = session;
    const nextResults: OcrPageResult[] = [...previous.values()];
    try {
      await runProjectOperation(project.id, { label: "Running OCR", cancellable: false }, async ({ update }) => {
      update({ detail: "Recognizing selected pages locally…", progress: 0.02 });
      for (let pageIndex = 0; pageIndex < parsedPages.pageArray.length; pageIndex += 1) {
        const pageNumber = parsedPages.pageArray[pageIndex];
        if (abortRef.current) throw new DOMException("OCR paused.", "AbortError");
        const existing = previous.get(pageNumber);
        if (existing?.status === "complete" && existing.searchablePdf) continue;
        update({ detail: `Rendering page ${pageNumber}…`, progress: Math.min(0.78, (pageIndex / parsedPages.pageArray.length) * 0.78) });
        setStatus(`Rendering page ${pageNumber}…`);
        const rendered = await renderPdfPageForOcr(document, pageNumber, preprocess);
        const pending: OcrPageResult = { id: `${runningJob.id}:${pageNumber}`, jobId: runningJob.id, projectId: project.id, pageNumber, status: "recognizing", text: "", confidence: 0, words: [], width: rendered.width, height: rendered.height, updatedAt: Date.now() };
        await writeOcrPage(pending);
        setStatus(`Recognizing page ${pageNumber}…`);
        update({ detail: `Recognizing page ${pageNumber}…`, progress: Math.min(0.82, ((pageIndex + 0.5) / parsedPages.pageArray.length) * 0.82) });
        try {
          const recognized = await session.recognize(rendered.blob, `${runningJob.id}-${pageNumber}`);
          if (!recognized.searchablePdf) throw new Error("This Tesseract build did not return searchable PDF output.");
          const pageResult: OcrPageResult = { ...pending, status: "complete", text: recognized.text, confidence: recognized.confidence, words: recognized.words, hocr: recognized.hocr, tsv: recognized.tsv, searchablePdf: toOwnedArrayBuffer(recognized.searchablePdf), updatedAt: Date.now() };
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
      const finalPages = parsedPages.pageArray.map((number) => previous.get(number)).filter((item): item is OcrPageResult => Boolean(item?.searchablePdf));
      if (finalPages.length !== parsedPages.pageArray.length) throw new Error(`${parsedPages.pageArray.length - finalPages.length} page(s) failed. Retry them before exporting.`);
      setStatus("Merging searchable pages…");
      update({ detail: "Merging searchable OCR pages…", progress: 0.86 });
      const merged = await mergePdfSources(finalPages.map((item) => ({ name: `page-${item.pageNumber}.pdf`, bytes: new Uint8Array(item.searchablePdf!) })));
      update({ stage: "validating", detail: "Validating searchable PDF…", progress: 0.93 });
      const summary = await inspectPdfBytes(merged.bytes);
      if (summary.pageCount !== finalPages.length) throw new Error("OCR output validation failed: page count mismatch.");
      const searchableIndex = finalPages.findIndex((item) => item.text.trim().length >= 4);
      if (searchableIndex >= 0) {
        const check = await openPdfWithPdfJs(merged.bytes);
        try {
          const extracted = await extractPageText(check, searchableIndex + 1);
          if (!extracted.trim()) throw new Error("OCR output validation failed: no searchable text was extracted from a recognized page.");
        } finally { await check.loadingTask.destroy(); }
      }
      setOutput(merged.bytes);
      runningJob = { ...runningJob, status: "complete", completedPages: finalPages.length, updatedAt: Date.now() };
      setJob(runningJob); await writeOcrJob(runningJob); setStatus("Searchable PDF ready");
      update({ progress: 1 });
      });
    } catch (reason) {
      const paused = reason instanceof DOMException && reason.name === "AbortError";
      runningJob = { ...runningJob, status: paused ? "paused" : "failed", error: paused ? undefined : reason instanceof Error ? reason.message : String(reason), updatedAt: Date.now() };
      setJob(runningJob); await writeOcrJob(runningJob); if (!paused) setError(runningJob.error ?? "OCR failed."); setStatus(paused ? "Paused" : "Failed");
    } finally { await session.terminate(); sessionRef.current = null; setProgress(0); }
  }

  async function saveOutput(asProject: boolean) {
    if (!output || !project) return;
    if (asProject) {
      try {
        await runProjectOperation(project.id, { label: "Saving searchable PDF", cancellable: false, reserveBytes: project.byteLength }, async ({ update }) => {
          update({ stage: "committing", detail: "Validating storage and saving OCR revision…", progress: 0.4 });
          const created = await createDerivedProjectFromBytes(project.id, output, `${project.name}-searchable.pdf`, "ocr-searchable");
          if (job) { const updated = { ...job, outputProjectId: created.id, updatedAt: Date.now() }; setJob(updated); await writeOcrJob(updated); }
          update({ progress: 1 });
          window.location.hash = routeHref({ name: "viewer", projectId: created.id }).slice(1);
        });
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    } else downloadBlob(new Blob([toOwnedArrayBuffer(output)], { type: "application/pdf" }), `${project.name}-searchable.pdf`);
  }

  return <div className="ocr-workspace">
    <aside className="ocr-controls">
      <section><p className="eyebrow">Local OCR</p><h2>Make scans searchable</h2><p>Pages are rendered and recognized locally. Completed page results are stored so interrupted jobs can resume.</p></section>
      {error ? <div className="error-banner"><strong>OCR issue</strong><span>{error}</span></div> : null}
      {passwordRequired ? <section className="password-panel"><input autoFocus autoComplete="off" onChange={(event) => setPassword(event.target.value)} placeholder="PDF password" type="password" value={password}/><button className="button" disabled={!password || !project} onClick={() => project && void loadProjectBytes(project).then((bytes) => openDocument(project, bytes, password))} type="button">Open PDF</button></section> : null}
      <label className="field-label">Pages<input disabled={running} onChange={(event) => setPageExpression(event.target.value)} placeholder="all, 1-5, odd" value={pageExpression}/><small>{parsedPages.errors[0] ?? `${parsedPages.pageArray.length} page(s) selected · Examples: all · 1-5 · odd`}</small></label>
      <div className="setting-grid">
        <label>Recognition quality<select disabled={running} onChange={(event) => setPreprocess({ ...preprocess, scale: Number(event.target.value) })} value={preprocess.scale}><option value="1.5">Fast</option><option value="2">Balanced (recommended)</option><option value="3">Best recognition</option></select><small>Higher quality can recognize small text better but takes longer.</small></label>
      </div>
      <details className="ocr-advanced-settings"><summary>Advanced image cleanup</summary><div className="setting-grid">
        <label>Contrast<input disabled={running} max="2" min="0.5" onChange={(event) => setPreprocess({ ...preprocess, contrast: Number(event.target.value) })} step="0.05" type="range" value={preprocess.contrast}/><small>Increase when text is faint; reduce if dark areas merge together.</small></label>
        <label><input checked={preprocess.grayscale} disabled={running} onChange={(event) => setPreprocess({ ...preprocess, grayscale: event.target.checked })} type="checkbox"/> Convert page to grayscale before recognition</label>
        <label><input checked={preprocess.invert} disabled={running} onChange={(event) => setPreprocess({ ...preprocess, invert: event.target.checked })} type="checkbox"/> Invert light/dark colors before recognition</label>
      </div></details>
      <OcrLanguagePanel disabled={running} onChange={setLanguages} selected={languages}/>
      <div className="ocr-actions"><button className="button" disabled={!document || running || !languages.length} onClick={() => void run()} type="button">{job?.status === "paused" || completed ? "Resume OCR" : "Start OCR"}</button>{running ? <button className="button button--secondary" onClick={() => { abortRef.current = true; void sessionRef.current?.terminate(); }} type="button">Pause</button> : null}{job ? <button className="button button--ghost" disabled={running} onClick={() => void deleteOcrJob(job.id).then(() => { setJob(null); setResults([]); setOutput(null); setStatus("Ready"); })} type="button">Discard job</button> : null}</div>
    </aside>
    <main className="ocr-results">
      <header className="processing-header"><div><strong>{status}</strong><span>{completed}/{job?.totalPages ?? parsedPages.pageArray.length} pages complete</span></div>{running ? <progress max="1" value={progress}/> : null}</header>
      <div className="ocr-page-list">{results.length ? results.map((result) => <article className={`ocr-page-result ocr-page-result--${result.status}`} key={result.id}><div><strong>Page {result.pageNumber}</strong><span>{result.status}</span></div><div><span>Confidence {Math.round(result.confidence)}%</span><span>{result.words.length} words</span></div><p>{result.error ?? (result.text.slice(0, 240) || "No text recognized.")}</p></article>) : <div className="empty-state"><strong>No OCR results yet</strong><p>Select pages and installed languages, then start recognition.</p></div>}</div>
      {output ? <footer className="output-bar"><div><strong>Searchable output validated</strong><span>{(output.byteLength / 1024 / 1024).toFixed(2)} MB</span></div><button className="button button--secondary" onClick={() => void saveOutput(false)} type="button">Download</button><button className="button" onClick={() => void saveOutput(true)} type="button">Save as project</button></footer> : null}
    </main>
  </div>;
}
