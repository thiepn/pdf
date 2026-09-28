import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { openPdfWithPdfJs, searchPdfDocument, type PdfSearchResult } from "../engines/pdfjs";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import { ReaderToolbar } from "../viewer/ReaderToolbar";
import { fitPageZoom } from "../viewer/readerControls";
import { downloadBlob } from "../projects/download";
import { exportProjectPackage, getProject, loadProjectBytes, readViewerPreferences, touchProject, writeViewerPreferences } from "../projects/projectRepository";
import type { ProjectManifest, ViewerPreferences } from "../types/project";
import { readSettings } from "../settings/settingsStore";
import { PageCanvas } from "../viewer/PageCanvas";
import { restoreViewerPreferences, type ViewerPreferenceChanges } from "../viewer/restorePreferences";
import { scrollPageWithinStage } from "../viewer/scrollPageWithinStage";
import { Thumbnail } from "../viewer/Thumbnail";
import { deriveViewerPerformancePolicy } from "../viewer/performancePolicy";
import { RenderScheduler } from "../viewer/renderScheduler";
import { navigateTo, routeHref } from "../core/appRouter";
import { useModalFocus } from "../accessibility/modalFocus";
import { readEditorState } from "../editor/editorRepository";
import { readProjectSessionPassword, rememberProjectSessionPassword } from "../security/sessionPasswords";
import { scheduleDeferredHydration, type DeferredHydrationHandle } from "../performance/deferredHydration";
import { recordRuntimeMetric } from "../performance/runtimeMetrics";

interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items?: OutlineNode[];
  bold?: boolean;
  italic?: boolean;
}

interface DocumentMetadata { [key: string]: unknown }
interface ViewerPageProps { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void; readOnly?: boolean }

export function ViewerPage({ projectId, onTitleChange, readOnly = false }: ViewerPageProps) {
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const openingSequenceRef = useRef(0);
  const preferenceChangesRef = useRef<ViewerPreferenceChanges>({});
  const stageRef = useRef<HTMLElement | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const bytesRef = useRef<Uint8Array | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const hydrationRef = useRef<DeferredHydrationHandle | null>(null);
  const passwordDialogRef = useRef<HTMLDivElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const readOnlyRef = useRef(readOnly);
  const settings = useMemo(() => readSettings(), []);

  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageLabels, setPageLabels] = useState<string[] | null>(null);
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [metadata, setMetadata] = useState<DocumentMetadata>({});
  const [preferences, setPreferences] = useState<ViewerPreferences>({ projectId, pageNumber: 1, zoom: settings.defaultZoom, viewMode: settings.defaultViewMode, sidebarTab: "pages", sidebarOpen: !isPhoneViewportOrTablet(), updatedAt: Date.now() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCase, setSearchCase] = useState(false);
  const [searchWhole, setSearchWhole] = useState(false);
  const [searchResults, setSearchResults] = useState<PdfSearchResult[]>([]);
  const [searchProgress, setSearchProgress] = useState<{ done: number; total: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchComplete, setSearchComplete] = useState(false);
  const fitSequenceRef = useRef(0);
  const [status, setStatus] = useState("Loading local project…");
  const [editorObjectCount, setEditorObjectCount] = useState(0);
  const performancePolicy = useMemo(() => deriveViewerPerformancePolicy(settings, project?.summary.pageCount ?? 1, project?.byteLength ?? 0), [project, settings]);
  const renderScheduler = useMemo(() => new RenderScheduler(performancePolicy.renderConcurrency), [performancePolicy.renderConcurrency]);
  const closePasswordDialog = useCallback(() => navigateTo({ name: "projects" }), []);
  useModalFocus(passwordRequired, passwordDialogRef, closePasswordDialog, passwordInputRef);
  useEffect(() => { readOnlyRef.current = readOnly; }, [readOnly]);
  useEffect(() => () => renderScheduler.clear(), [renderScheduler]);

  const openDocument = useCallback(async (manifest: ProjectManifest, bytes: Uint8Array, suppliedPassword?: string) => {
    const openingSequence = ++openingSequenceRef.current;
    hydrationRef.current?.cancel();
    hydrationRef.current = null;
    preferenceChangesRef.current = {};
    setPreferencesLoaded(false);
    setPdfDocument(null);
    setLoading(true); setError(null); setStatus("Opening PDF…");
    try {
      const previous = documentRef.current; documentRef.current = null; if (previous) await previous.loadingTask.destroy();
      if (openingSequence !== openingSequenceRef.current) return;
      const doc = await openPdfWithPdfJs(bytes, suppliedPassword);
      if (openingSequence !== openingSequenceRef.current) { await doc.loadingTask.destroy(); return; }
      if (suppliedPassword) rememberProjectSessionPassword(manifest.id, suppliedPassword);
      documentRef.current = doc; setPdfDocument(doc); setPasswordRequired(false); setPassword("");
      setStatus("Ready");
      setLoading(false);
      recordRuntimeMetric("custom", "readiness.viewer.interactive", 0, undefined, { projectId: manifest.id, pageCount: doc.numPages });

      hydrationRef.current = scheduleDeferredHydration(async (signal) => {
        const [labelsResult, outlineResult, metadataResult, savedPreferences, editorState] = await Promise.all([
          doc.getPageLabels().catch(() => null),
          doc.getOutline().catch(() => []),
          doc.getMetadata().catch(() => ({ info: {} })),
          readViewerPreferences(manifest.id).catch(() => undefined),
          readEditorState(manifest.id).catch(() => null)
        ]);
        if (signal.aborted || documentRef.current !== doc) return;
        setPageLabels(labelsResult);
        setOutline((outlineResult ?? []) as OutlineNode[]);
        setMetadata((metadataResult.info ?? {}) as DocumentMetadata);
        if (editorState) setEditorObjectCount(editorState.objects.length);
        setPreferences((current) => restoreViewerPreferences(savedPreferences, current, preferenceChangesRef.current, doc.numPages, isPhoneViewportOrTablet()));
        setPreferencesLoaded(true);
        if (!readOnlyRef.current && !signal.aborted) await touchProject(manifest.id).catch(() => undefined);
        if (!signal.aborted && documentRef.current === doc) recordRuntimeMetric("custom", "readiness.viewer.hydrated", 0, undefined, { projectId: manifest.id });
      }, { label: "viewer", timeoutMs: 1_500 });
    } catch (reason) {
      if (openingSequence !== openingSequenceRef.current) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message)) { setPasswordRequired(true); setError("This PDF is password protected. Enter the password to open it for this session."); }
      else setError(message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const manifest = await getProject(projectId); if (!manifest) throw new Error("Project not found. It may have been deleted or browser storage may have been cleared.");
        if (cancelled) return;
        setProject(manifest);
        const bytes = await loadProjectBytes(manifest);
        if (cancelled) return;
        bytesRef.current = bytes;
        await openDocument(manifest, bytes, readProjectSessionPassword(manifest.id));
      } catch (reason) { if (!cancelled) { setError(reason instanceof Error ? reason.message : String(reason)); setLoading(false); } }
    })();
    return () => {
      cancelled = true;
      ++openingSequenceRef.current;
      hydrationRef.current?.cancel(); hydrationRef.current = null;
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      ++fitSequenceRef.current;
      const current = documentRef.current; documentRef.current = null; void current?.loadingTask.destroy();
    };
  }, [openDocument, projectId]);

  useEffect(() => { if (project) onTitleChange?.(project.name, `${project.summary.pageCount} ${project.summary.pageCount === 1 ? "page" : "pages"} · ${formatBytes(project.byteLength)}`); }, [onTitleChange, project]);

  useEffect(() => {
    if (!pdfDocument || !preferencesLoaded || readOnly) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => { void writeViewerPreferences({ ...preferences, updatedAt: Date.now() }).catch(() => setError("Reading preferences could not be saved locally. Your PDF is unchanged.")); }, 350);
    return () => { if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current); };
  }, [pdfDocument, preferences, preferencesLoaded, readOnly]);

  const changePreferences = useCallback((patch: ViewerPreferenceChanges) => {
    Object.assign(preferenceChangesRef.current, patch);
    setPreferences((current) => ({ ...current, ...patch, updatedAt: Date.now() }));
  }, []);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  const jumpToPage = useCallback((pageNumber: number) => {
    if (!pdfDocument || !Number.isFinite(pageNumber)) return;
    const bounded = Math.max(1, Math.min(pdfDocument.numPages, Math.round(pageNumber)));
    changePreferences({ pageNumber: bounded });
    if (preferences.viewMode === "continuous") window.requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const reduced = settings.motion === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scrollPageWithinStage(stage, stage.querySelector<HTMLElement>(`[data-page-number="${bounded}"]`) ?? undefined, reduced ? "auto" : "smooth");
    });
  }, [changePreferences, pdfDocument, preferences.viewMode, settings.motion]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !pdfDocument || !preferencesLoaded || preferences.viewMode !== "continuous") return;
    let frame = 0;
    const pages = Array.from(stage.querySelectorAll<HTMLElement>(".pdf-page-shell[data-page-number]"));
    const updateVisiblePage = () => {
      frame = 0;
      const readingLine = stage.getBoundingClientRect().top + Math.min(32, stage.clientHeight / 4);
      // Page preloading extends well outside the viewport. Reading position must
      // follow the visible page, not the last page admitted to the render queue.
      let low = 0, high = pages.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (pages[middle].getBoundingClientRect().bottom <= readingLine) low = middle + 1;
        else high = middle;
      }
      const pageNumber = Number(pages[Math.min(low, pages.length - 1)]?.dataset.pageNumber);
      if (Number.isFinite(pageNumber) && pageNumber !== preferencesRef.current.pageNumber) changePreferences({ pageNumber });
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(updateVisiblePage); };
    const restoreFrame = window.requestAnimationFrame(() => {
      scrollPageWithinStage(stage, pages.find((page) => Number(page.dataset.pageNumber) === preferencesRef.current.pageNumber));
      stage.addEventListener("scroll", onScroll, { passive: true });
    });
    return () => {
      window.cancelAnimationFrame(restoreFrame);
      if (frame) window.cancelAnimationFrame(frame);
      stage.removeEventListener("scroll", onScroll);
    };
  }, [changePreferences, pdfDocument, preferencesLoaded, preferences.viewMode]);

  async function resolveOutlineDestination(node: OutlineNode): Promise<void> {
    if (!pdfDocument || !node.dest) return;
    try {
      const destination = typeof node.dest === "string" ? await pdfDocument.getDestination(node.dest) : node.dest;
      if (!destination?.length) return;
      const reference = destination[0] as number | { num: number; gen: number };
      const pageNumber = typeof reference === "number" ? reference + 1 : (await pdfDocument.getPageIndex(reference)) + 1;
      jumpToPage(pageNumber);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  const showSearch = useCallback(() => {
    changePreferences({ sidebarOpen: true, sidebarTab: "search" });
    window.requestAnimationFrame(() => window.document.querySelector<HTMLInputElement>('.viewer-app input[aria-label="Search document"]')?.focus({ preventScroll: true }));
  }, [changePreferences]);

  const closePanel = useCallback(() => {
    changePreferences({ sidebarOpen: false });
    window.requestAnimationFrame(() => window.document.querySelector<HTMLButtonElement>('.viewer-app .compact-document-bar button[aria-label="More reader actions"], .viewer-app .viewer-mobile-panel-toggle')?.focus({ preventScroll: true }));
  }, [changePreferences]);

  useEffect(() => {
    if (!pdfDocument) return;
    const keyboard = (event: KeyboardEvent) => {
      if (window.document.querySelector('[aria-modal="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f") { event.preventDefault(); showSearch(); }
      if (event.key === "Escape" && isPhoneViewportOrTablet()) closePanel();
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [closePanel, pdfDocument, showSearch]);

  function clearSearch(): void {
    searchAbortRef.current?.abort(); searchAbortRef.current = null;
    setSearching(false); setSearchProgress(null); setSearchResults([]); setSearchComplete(false);
  }

  async function runSearch(): Promise<void> {
    if (!pdfDocument || !searchQuery.trim()) return;
    clearSearch();
    const controller = new AbortController(); searchAbortRef.current = controller;
    const current = () => searchAbortRef.current === controller && !controller.signal.aborted;
    setSearching(true); setSearchProgress({ done: 0, total: pdfDocument.numPages }); changePreferences({ sidebarOpen: true, sidebarTab: "search" });
    try {
      const results = await searchPdfDocument(pdfDocument, searchQuery, { caseSensitive: searchCase, wholeWord: searchWhole }, controller.signal, (done, total) => { if (current()) setSearchProgress({ done, total }); });
      if (current()) { setSearchResults(results); setSearchComplete(true); }
    } catch (reason) { if (current()) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (searchAbortRef.current === controller) { searchAbortRef.current = null; setSearching(false); setSearchProgress(null); } }
  }

  async function fitPage(mode: "width" | "page"): Promise<void> {
    const stage = stageRef.current, doc = documentRef.current;
    if (!stage || !doc) return;
    const sequence = ++fitSequenceRef.current, pageNumber = preferencesRef.current.pageNumber;
    try {
      const page = await doc.getPage(pageNumber);
      if (sequence !== fitSequenceRef.current || documentRef.current !== doc || preferencesRef.current.pageNumber !== pageNumber) return;
      const wrapper = stage.firstElementChild;
      const style = wrapper ? getComputedStyle(wrapper) : null;
      const padding = (key: "paddingLeft" | "paddingRight" | "paddingTop" | "paddingBottom") => Number.parseFloat(style?.[key] ?? "0") || 0;
      const zoom = fitPageZoom(page.getViewport({ scale: 1 }), {
        width: stage.clientWidth - padding("paddingLeft") - padding("paddingRight") - 2,
        height: stage.clientHeight - padding("paddingTop") - padding("paddingBottom") - 2
      }, mode);
      changePreferences({ zoom, pageNumber });
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (sequence !== fitSequenceRef.current || documentRef.current !== doc || preferencesRef.current.pageNumber !== pageNumber) return;
        stage.scrollLeft = 0;
        scrollPageWithinStage(stage, stage.querySelector<HTMLElement>(`[data-page-number="${pageNumber}"]`) ?? undefined);
      }));
    } catch (reason) { if (sequence === fitSequenceRef.current && documentRef.current === doc) setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function backupProject(): Promise<void> {
    if (!project) return;
    try { downloadBlob(await exportProjectPackage(project), `${safeName(project.name)}.lpsproject`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  function downloadOriginal(): void {
    if (!project || !bytesRef.current) return;
    downloadBlob(new Blob([toOwnedArrayBuffer(bytesRef.current)], { type: project.mimeType }), project.sourceFilename);
  }

  async function retryPassword(): Promise<void> { if (!loading && project && bytesRef.current && password) await openDocument(project, bytesRef.current, password); }

  if (loading && !project) return <div aria-live="polite" className="viewer-loading" role="status"><span aria-hidden="true" className="spinner" /><strong>{status}</strong></div>;
  if (!project) return <ViewerFatalError error={error ?? "Project unavailable."} />;

  return <div className="viewer-app viewer-app--r3" data-preferences-ready={preferencesLoaded ? "true" : "false"}>
    <ReaderToolbar preferences={preferences} pageCount={pdfDocument?.numPages ?? project.summary.pageCount} ready={!!pdfDocument}
      onPage={jumpToPage} onPreferences={(patch) => { ++fitSequenceRef.current; changePreferences(patch); }} onFit={(mode) => void fitPage(mode)}
      onFind={showSearch} onDownload={downloadOriginal} onBackup={() => void backupProject()} />
    {editorObjectCount > 0 ? <p className="reader-saved-edits">Reading the source PDF. {editorObjectCount} saved edit{editorObjectCount === 1 ? "" : "s"} can be viewed and downloaded in <a href={routeHref({ name: "editor", projectId })}>Edit this PDF</a>.</p> : null}

    {error && !passwordRequired ? <div aria-live="assertive" className="viewer-error" role="alert"><span>{error}</span><button onClick={() => setError(null)} type="button">Dismiss</button></div> : null}

    {passwordRequired ? <div className="viewer-password-overlay" role="presentation"><div aria-describedby="viewer-password-description" aria-labelledby="viewer-password-title" aria-modal="true" className="viewer-password-dialog" ref={passwordDialogRef} role="dialog"><p className="eyebrow">Protected document</p><h2 id="viewer-password-title">Password required</h2><p id="viewer-password-description">The password is kept in memory only for this viewing session.</p><form onSubmit={(event) => { event.preventDefault(); void retryPassword(); }}>{error ? <p role="alert">{error}</p> : null}<label className="visually-hidden" htmlFor="viewer-password-input">PDF password</label><input autoComplete="off" id="viewer-password-input" onChange={(event: { target: HTMLInputElement }) => setPassword(event.target.value)} placeholder="PDF password" ref={passwordInputRef} type="password" value={password} /><div className="button-row"><button className="button" disabled={!password || loading} type="submit">{loading ? "Opening…" : "Open locally"}</button><button className="button button--ghost" onClick={closePasswordDialog} type="button">Cancel</button></div></form></div></div> : null}

    <div className={preferences.sidebarOpen ? "viewer-layout" : "viewer-layout viewer-layout--collapsed"}>
      <aside aria-label="Document navigation" className="viewer-sidebar" id="viewer-sidebar">
        <label className="viewer-sidebar-select"><span className="visually-hidden">Reader panel</span><select aria-controls="viewer-sidebar-panel" value={preferences.sidebarTab} onChange={(event) => changePreferences({ sidebarTab: event.target.value as ViewerPreferences["sidebarTab"] })}><option value="pages">Pages</option><option value="outline">Bookmarks</option><option value="search">Find in document</option><option value="info">Document information</option></select></label>
        <div aria-label={`${preferences.sidebarTab} panel`} className="viewer-sidebar__body" id="viewer-sidebar-panel" role="region">
          {preferences.sidebarTab === "pages" && pdfDocument ? <div className="thumbnail-list">{Array.from({ length: pdfDocument.numPages }, (_, index) => <Thumbnail document={pdfDocument} key={index + 1} label={pageLabels?.[index]} onSelect={jumpToPage} pageNumber={index + 1} scheduler={renderScheduler} selected={preferences.pageNumber === index + 1} />)}</div> : null}
          {preferences.sidebarTab === "outline" ? <OutlineTree nodes={outline} onSelect={(node) => void resolveOutlineDestination(node)} /> : null}
          {preferences.sidebarTab === "search" ? <SearchSidebar caseSensitive={searchCase} complete={searchComplete} onCaseChange={(value) => { clearSearch(); setSearchCase(value); }} onCancel={clearSearch} onQueryChange={(value) => { clearSearch(); setSearchQuery(value); }} onRun={() => void runSearch()} onSelect={jumpToPage} onWholeChange={(value) => { clearSearch(); setSearchWhole(value); }} progress={searchProgress} query={searchQuery} results={searchResults} searching={searching} wholeWord={searchWhole} /> : null}
          {preferences.sidebarTab === "info" ? <InformationSidebar metadata={metadata} project={project} /> : null}
        </div>
      </aside>

      <button className="reader-panel-backdrop" aria-label="Close document panel" onClick={closePanel} type="button" />

      <button aria-label={preferences.sidebarOpen ? "Collapse document navigation" : "Expand document navigation"} className="sidebar-collapse" onClick={() => changePreferences({ sidebarOpen: !preferences.sidebarOpen })} type="button">{preferences.sidebarOpen ? "‹" : "›"}</button>

      <main aria-label="PDF document pages" className="document-stage" ref={stageRef}>
        {!pdfDocument ? <div aria-live="polite" className="viewer-loading" role="status"><span aria-hidden="true" className="spinner" /><strong>Opening PDF…</strong></div> : preferences.viewMode === "single" ? <div className="single-page-stage"><PageCanvas document={pdfDocument} pageNumber={preferences.pageNumber} pixelRatioCap={performancePolicy.pixelRatioCap} scheduler={renderScheduler} searchQuery={searchComplete ? searchQuery : ""} zoom={preferences.zoom} /></div> : <div className="continuous-page-stage">{Array.from({ length: pdfDocument.numPages }, (_, index) => <PageCanvas document={pdfDocument} key={index + 1} lazy pageNumber={index + 1} pixelRatioCap={performancePolicy.pixelRatioCap} scheduler={renderScheduler} activationMarginPx={performancePolicy.activationMarginPx} evictionDistanceScreens={performancePolicy.evictionDistanceScreens} searchQuery={searchComplete ? searchQuery : ""} zoom={preferences.zoom} />)}</div>}
      </main>
    </div>
  </div>;
}



function OutlineTree({ nodes, onSelect }: { nodes: OutlineNode[]; onSelect: (node: OutlineNode) => void }) {
  if (!nodes.length) return <div className="sidebar-empty"><strong>No document outline</strong><p>This PDF does not contain bookmarks.</p></div>;
  return <ul className="outline-tree">{nodes.map((node, index) => <OutlineItem key={`${node.title}-${index}`} node={node} onSelect={onSelect} />)}</ul>;
}

function OutlineItem({ node, onSelect }: { node: OutlineNode; onSelect: (node: OutlineNode) => void }) {
  return <li><button style={{ fontStyle: node.italic ? "italic" : undefined, fontWeight: node.bold ? 700 : undefined }} onClick={() => onSelect(node)} type="button">{node.title || "Untitled bookmark"}</button>{node.items?.length ? <ul>{node.items.map((child, index) => <OutlineItem key={`${child.title}-${index}`} node={child} onSelect={onSelect} />)}</ul> : null}</li>;
}

interface SearchSidebarProps { complete: boolean; query: string; caseSensitive: boolean; wholeWord: boolean; searching: boolean; progress: { done: number; total: number } | null; results: PdfSearchResult[]; onQueryChange: (value: string) => void; onCaseChange: (value: boolean) => void; onWholeChange: (value: boolean) => void; onRun: () => void; onCancel: () => void; onSelect: (pageNumber: number) => void }

function SearchSidebar(props: SearchSidebarProps) {
  const totalMatches = props.results.reduce((sum, result) => sum + result.matchCount, 0);
  return <div className="search-sidebar"><form onSubmit={(event: { preventDefault(): void }) => { event.preventDefault(); props.onRun(); }}><input aria-label="Search document" autoFocus onChange={(event: { target: HTMLInputElement }) => props.onQueryChange(event.target.value)} placeholder="Search document" type="search" value={props.query} /><button className="button button--small" disabled={!props.query.trim() || props.searching} type="submit">Search</button></form><details className="search-options"><summary>Search options</summary><label><input checked={props.caseSensitive} onChange={(event: { target: HTMLInputElement }) => props.onCaseChange(event.target.checked)} type="checkbox" /> Match case</label><label><input checked={props.wholeWord} onChange={(event: { target: HTMLInputElement }) => props.onWholeChange(event.target.checked)} type="checkbox" /> Whole word</label></details>{props.searching && props.progress ? <div aria-live="polite" className="search-progress" role="status"><progress aria-label="Search progress" max={props.progress.total} value={props.progress.done} /><span>{props.progress.done} / {props.progress.total} pages</span><button onClick={props.onCancel} type="button">Cancel</button></div> : null}{!props.searching && props.complete ? <p className="search-summary">{totalMatches} {totalMatches === 1 ? "match" : "matches"} on {props.results.length} pages</p> : null}<div className="search-results">{props.results.map((result) => <button key={result.id} onClick={() => props.onSelect(result.pageNumber)} type="button"><strong>Page {result.pageLabel ?? result.pageNumber}</strong><span>{result.matchCount} {result.matchCount === 1 ? "match" : "matches"}</span><p>{result.snippet}</p></button>)}</div></div>;
}

function InformationSidebar({ metadata, project }: { metadata: DocumentMetadata; project: ProjectManifest }) {
  const basic = [["Filename", project.sourceFilename], ["Pages", project.summary.pageCount], ["File size", formatBytes(project.byteLength)], ["Title", metadata.Title], ["Author", metadata.Author], ["Forms", project.summary.formFieldCount ?? 0]];
  const technical = [["Storage", project.storageKind.toUpperCase()], ["Checksum", `${project.checksum.slice(0, 16)}…`], ["Creator", metadata.Creator], ["Producer", metadata.Producer], ["PDF version", metadata.PDFFormatVersion], ["Attachments", project.summary.attachmentCount ?? 0], ["JavaScript", project.summary.hasJavaScript ? "Detected; execution disabled" : "Not detected"]];
  return <div className="viewer-info-r3"><dl className="info-list">{basic.map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{value === undefined || value === "" ? "—" : String(value)}</dd></div>)}</dl><details><summary>Technical details</summary><dl className="info-list">{technical.map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{value === undefined || value === "" ? "—" : String(value)}</dd></div>)}</dl></details></div>;
}

function ViewerFatalError({ error }: { error: string }) { return <div className="fatal-state"><strong>Project could not be opened</strong><p>{error}</p><a className="button" href={routeHref({ name: "home" })}>Return home</a></div>; }
function isPhoneViewportOrTablet(): boolean { return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 1100px)").matches : false; }
function formatBytes(value: number): string { if (value < 1024) return `${value} B`; const units = ["KB", "MB", "GB"]; let current = value / 1024; let index = 0; while (current >= 1024 && index < units.length - 1) { current /= 1024; index += 1; } return `${current.toFixed(1)} ${units[index]}`; }
function safeName(value: string): string { return value.replace(/[\\/:*?"<>|]+/g, "-").trim() || "local-pdf-project"; }
