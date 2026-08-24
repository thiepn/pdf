import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { openPdfWithPdfJs, searchPdfDocument, type PdfSearchResult } from "../engines/pdfjs";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import { Icon } from "../components/Icon";
import { downloadBlob } from "../projects/download";
import { exportProjectPackage, getProject, loadProjectBytes, readViewerPreferences, touchProject, writeViewerPreferences } from "../projects/projectRepository";
import type { ProjectManifest, ViewerPreferences } from "../types/project";
import { readSettings } from "../settings/settingsStore";
import { PageCanvas } from "../viewer/PageCanvas";
import { Thumbnail } from "../viewer/Thumbnail";
import { deriveViewerPerformancePolicy } from "../viewer/performancePolicy";
import { RenderScheduler } from "../viewer/renderScheduler";
import { navigateTo, routeHref } from "../core/appRouter";
import { useModalFocus } from "../accessibility/modalFocus";
import { readEditorState } from "../editor/editorRepository";
import { readProjectSessionPassword, rememberProjectSessionPassword } from "../security/sessionPasswords";

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
  const bytesRef = useRef<Uint8Array | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const passwordDialogRef = useRef<HTMLDivElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const readOnlyRef = useRef(readOnly);
  const settings = useMemo(() => readSettings(), []);

  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageLabels, setPageLabels] = useState<string[] | null>(null);
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [metadata, setMetadata] = useState<DocumentMetadata>({});
  const [preferences, setPreferences] = useState<ViewerPreferences>({ projectId, pageNumber: 1, zoom: settings.defaultZoom, viewMode: settings.defaultViewMode, sidebarTab: "pages", sidebarOpen: !isPhoneViewport(), updatedAt: Date.now() });
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
  const [status, setStatus] = useState("Loading local project…");
  const [editorObjectCount, setEditorObjectCount] = useState(0);
  const performancePolicy = useMemo(() => deriveViewerPerformancePolicy(settings, project?.summary.pageCount ?? 1, project?.byteLength ?? 0), [project, settings]);
  const renderScheduler = useMemo(() => new RenderScheduler(performancePolicy.renderConcurrency), [performancePolicy.renderConcurrency]);
  const closePasswordDialog = useCallback(() => navigateTo({ name: "projects" }), []);
  useModalFocus(passwordRequired, passwordDialogRef, closePasswordDialog, passwordInputRef);
  useEffect(() => { readOnlyRef.current = readOnly; }, [readOnly]);
  useEffect(() => () => renderScheduler.clear(), [renderScheduler]);

  const openDocument = useCallback(async (manifest: ProjectManifest, bytes: Uint8Array, suppliedPassword?: string) => {
    setLoading(true); setError(null); setStatus("Opening PDF…");
    try {
      const previous = documentRef.current; documentRef.current = null; if (previous) await previous.loadingTask.destroy();
      const doc = await openPdfWithPdfJs(bytes, suppliedPassword);
      if (suppliedPassword) rememberProjectSessionPassword(manifest.id, suppliedPassword);
      documentRef.current = doc; setPdfDocument(doc); setPasswordRequired(false); setPassword("");
      const [labelsResult, outlineResult, metadataResult, savedPreferences] = await Promise.all([
        doc.getPageLabels().catch(() => null), doc.getOutline().catch(() => []), doc.getMetadata().catch(() => ({ info: {} })), readViewerPreferences(manifest.id)
      ]);
      setPageLabels(labelsResult); setOutline((outlineResult ?? []) as OutlineNode[]); setMetadata((metadataResult.info ?? {}) as DocumentMetadata);
      if (savedPreferences) { const normalized = normalizePreferences(savedPreferences, doc.numPages); setPreferences(isPhoneViewport() ? { ...normalized, sidebarOpen: false } : normalized); }
      setStatus("Ready");
      if (!readOnlyRef.current) await touchProject(manifest.id);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message)) { setPasswordRequired(true); setError("This PDF is password protected. Enter the password to open it for this session."); }
      else setError(message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const manifest = await getProject(projectId); if (!manifest) throw new Error("Project not found. It may have been deleted or browser storage may have been cleared.");
        const [bytes, editorState] = await Promise.all([loadProjectBytes(manifest), readEditorState(manifest.id)]);
        if (cancelled) return;
        setProject(manifest); setEditorObjectCount(editorState.objects.length); bytesRef.current = bytes;
        await openDocument(manifest, bytes, readProjectSessionPassword(manifest.id));
      } catch (reason) { if (!cancelled) { setError(reason instanceof Error ? reason.message : String(reason)); setLoading(false); } }
    })();
    return () => { cancelled = true; searchAbortRef.current?.abort(); const current = documentRef.current; documentRef.current = null; void current?.loadingTask.destroy(); };
  }, [openDocument, projectId]);

  useEffect(() => { if (project) onTitleChange?.(project.name, `${project.summary.pageCount} pages · ${formatBytes(project.byteLength)}`); }, [onTitleChange, project]);

  useEffect(() => {
    if (!pdfDocument || readOnly) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => { void writeViewerPreferences({ ...preferences, updatedAt: Date.now() }); }, 350);
    return () => { if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current); };
  }, [pdfDocument, preferences, readOnly]);

  const changePreferences = useCallback((patch: Partial<ViewerPreferences>) => setPreferences((current) => ({ ...current, ...patch, updatedAt: Date.now() })), []);

  const jumpToPage = useCallback((pageNumber: number) => {
    if (!pdfDocument) return;
    const bounded = Math.max(1, Math.min(pdfDocument.numPages, Math.round(pageNumber)));
    changePreferences({ pageNumber: bounded });
    if (preferences.viewMode === "continuous") window.requestAnimationFrame(() => window.document.querySelector(`[data-page-number="${bounded}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [changePreferences, pdfDocument, preferences.viewMode]);

  const handlePageVisible = useCallback((pageNumber: number) => changePreferences({ pageNumber }), [changePreferences]);

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

  async function runSearch(): Promise<void> {
    if (!pdfDocument || !searchQuery.trim()) return;
    searchAbortRef.current?.abort(); const controller = new AbortController(); searchAbortRef.current = controller;
    setSearching(true); setSearchResults([]); setSearchProgress({ done: 0, total: pdfDocument.numPages }); changePreferences({ sidebarOpen: true, sidebarTab: "search" });
    try {
      const results = await searchPdfDocument(pdfDocument, searchQuery, { caseSensitive: searchCase, wholeWord: searchWhole }, controller.signal, (done, total) => setSearchProgress({ done, total }));
      setSearchResults(results);
    } catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSearching(false); setSearchProgress(null); }
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

  async function retryPassword(): Promise<void> { if (project && bytesRef.current && password) await openDocument(project, bytesRef.current, password); }

  if (loading && !project) return <div aria-live="polite" className="viewer-loading" role="status"><span aria-hidden="true" className="spinner" /><strong>{status}</strong></div>;
  if (!project) return <ViewerFatalError error={error ?? "Project unavailable."} />;

  return <div className="viewer-app viewer-app--r3">
    <div className="viewer-commandbar">
      <div className="viewer-file-group"><div className="viewer-file-title"><strong>{project.name}</strong><span>{status}{editorObjectCount ? ` · ${editorObjectCount} saved edit${editorObjectCount === 1 ? "" : "s"}` : ""}</span></div></div>
      <div className="viewer-commandbar__center">
        <button aria-label="Previous page" className="icon-button" disabled={!pdfDocument || preferences.pageNumber <= 1} onClick={() => jumpToPage(preferences.pageNumber - 1)} type="button"><Icon name="chevron-left" /></button>
        <label className="page-input"><span className="visually-hidden">Current page</span><input aria-label="Current page" min="1" max={pdfDocument?.numPages ?? 1} onChange={(event: { target: HTMLInputElement }) => jumpToPage(Number(event.target.value))} type="number" value={preferences.pageNumber} /><span>/ {pdfDocument?.numPages ?? project.summary.pageCount}</span></label>
        <button aria-label="Next page" className="icon-button" disabled={!pdfDocument || preferences.pageNumber >= (pdfDocument?.numPages ?? 1)} onClick={() => jumpToPage(preferences.pageNumber + 1)} type="button"><Icon name="chevron-right" /></button>
        <button aria-expanded={preferences.sidebarOpen} aria-controls="viewer-sidebar" className="viewer-mobile-panel-toggle" onClick={() => changePreferences({ sidebarOpen: !preferences.sidebarOpen })} type="button">{preferences.sidebarOpen ? "Close panel" : "Pages / search"}</button>
        <span className="toolbar-divider" />
        <button aria-label="Zoom out" className="icon-button" onClick={() => changePreferences({ zoom: Math.max(0.25, preferences.zoom - 0.25) })} type="button"><Icon name="minus" /></button>
        <select aria-label="Zoom" onChange={(event: { target: HTMLSelectElement }) => changePreferences({ zoom: Number(event.target.value) })} value={preferences.zoom}><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option><option value="3">300%</option></select>
        <button aria-label="Zoom in" className="icon-button" onClick={() => changePreferences({ zoom: Math.min(4, preferences.zoom + 0.25) })} type="button"><Icon name="plus" /></button>
        <span className="toolbar-divider" />
        <button className={preferences.viewMode === "single" ? "view-toggle view-toggle--active" : "view-toggle"} onClick={() => changePreferences({ viewMode: "single" })} type="button">Single</button>
        <button className={preferences.viewMode === "continuous" ? "view-toggle view-toggle--active" : "view-toggle"} onClick={() => changePreferences({ viewMode: "continuous" })} type="button">Continuous</button>
      </div>
      <div className="viewer-commandbar__actions"><details className="viewer-document-actions"><summary>Document</summary><div><button onClick={downloadOriginal} type="button">Download original PDF</button><button onClick={() => void backupProject()} type="button">Back up project</button><a href={routeHref({ name: "projects" })}>Open another PDF</a></div></details></div>
    </div>

    {error ? <div aria-live="assertive" className="viewer-error" role="alert"><span>{error}</span><button onClick={() => setError(null)} type="button">Dismiss</button></div> : null}

    {passwordRequired ? <div className="viewer-password-overlay" role="presentation"><div aria-describedby="viewer-password-description" aria-labelledby="viewer-password-title" aria-modal="true" className="viewer-password-dialog" ref={passwordDialogRef} role="dialog"><p className="eyebrow">Protected document</p><h2 id="viewer-password-title">Password required</h2><p id="viewer-password-description">The password is kept in memory only for this viewing session.</p><label className="visually-hidden" htmlFor="viewer-password-input">PDF password</label><input autoComplete="off" id="viewer-password-input" onChange={(event: { target: HTMLInputElement }) => setPassword(event.target.value)} placeholder="PDF password" ref={passwordInputRef} type="password" value={password} /><div className="button-row"><button className="button" disabled={!password} onClick={() => void retryPassword()} type="button">Open locally</button><button className="button button--ghost" onClick={closePasswordDialog} type="button">Cancel</button></div></div></div> : null}

    <div className={preferences.sidebarOpen ? "viewer-layout" : "viewer-layout viewer-layout--collapsed"}>
      <aside aria-label="Document navigation" className="viewer-sidebar" id="viewer-sidebar">
        <div aria-label="Viewer side panel" className="viewer-sidebar__tabs" role="tablist">{(["pages", "outline", "search", "info"] as const).map((tab) => <button aria-controls="viewer-sidebar-panel" aria-selected={preferences.sidebarTab === tab} className={preferences.sidebarTab === tab ? "active" : ""} id={`viewer-tab-${tab}`} key={tab} onClick={() => changePreferences({ sidebarTab: tab })} role="tab" tabIndex={preferences.sidebarTab === tab ? 0 : -1} type="button">{tab === "pages" ? "Pages" : tab === "outline" ? "Outline" : tab === "search" ? "Search" : "Info"}</button>)}</div>
        <div aria-labelledby={`viewer-tab-${preferences.sidebarTab}`} className="viewer-sidebar__body" id="viewer-sidebar-panel" role="tabpanel">
          {preferences.sidebarTab === "pages" && pdfDocument ? <div className="thumbnail-list">{Array.from({ length: pdfDocument.numPages }, (_, index) => <Thumbnail document={pdfDocument} key={index + 1} label={pageLabels?.[index]} onSelect={jumpToPage} pageNumber={index + 1} scheduler={renderScheduler} selected={preferences.pageNumber === index + 1} />)}</div> : null}
          {preferences.sidebarTab === "outline" ? <OutlineTree nodes={outline} onSelect={(node) => void resolveOutlineDestination(node)} /> : null}
          {preferences.sidebarTab === "search" ? <SearchSidebar caseSensitive={searchCase} onCaseChange={setSearchCase} onCancel={() => searchAbortRef.current?.abort()} onQueryChange={setSearchQuery} onRun={() => void runSearch()} onSelect={jumpToPage} onWholeChange={setSearchWhole} progress={searchProgress} query={searchQuery} results={searchResults} searching={searching} wholeWord={searchWhole} /> : null}
          {preferences.sidebarTab === "info" ? <InformationSidebar metadata={metadata} project={project} /> : null}
        </div>
      </aside>

      <button aria-label={preferences.sidebarOpen ? "Collapse document navigation" : "Expand document navigation"} className="sidebar-collapse" onClick={() => changePreferences({ sidebarOpen: !preferences.sidebarOpen })} type="button">{preferences.sidebarOpen ? "‹" : "›"}</button>

      <main aria-label="PDF document pages" className="document-stage">
        {!pdfDocument ? <div aria-live="polite" className="viewer-loading" role="status"><span aria-hidden="true" className="spinner" /><strong>Opening PDF…</strong></div> : preferences.viewMode === "single" ? <div className="single-page-stage"><PageCanvas document={pdfDocument} pageNumber={preferences.pageNumber} pixelRatioCap={performancePolicy.pixelRatioCap} scheduler={renderScheduler} searchQuery={searchQuery} zoom={preferences.zoom} /></div> : <div className="continuous-page-stage">{Array.from({ length: pdfDocument.numPages }, (_, index) => <PageCanvas document={pdfDocument} key={index + 1} lazy onVisible={handlePageVisible} pageNumber={index + 1} pixelRatioCap={performancePolicy.pixelRatioCap} scheduler={renderScheduler} activationMarginPx={performancePolicy.activationMarginPx} evictionDistanceScreens={performancePolicy.evictionDistanceScreens} searchQuery={searchQuery} zoom={preferences.zoom} />)}</div>}
      </main>
    </div>
  </div>;
}

function normalizePreferences(preferences: ViewerPreferences, pageCount: number): ViewerPreferences {
  return { ...preferences, pageNumber: Math.max(1, Math.min(pageCount, preferences.pageNumber || 1)), zoom: Math.max(0.25, Math.min(4, preferences.zoom || 1)), viewMode: preferences.viewMode === "single" ? "single" : "continuous", sidebarTab: ["pages", "outline", "search", "info"].includes(preferences.sidebarTab) ? preferences.sidebarTab : "pages", sidebarOpen: preferences.sidebarOpen !== false };
}

function OutlineTree({ nodes, onSelect }: { nodes: OutlineNode[]; onSelect: (node: OutlineNode) => void }) {
  if (!nodes.length) return <div className="sidebar-empty"><strong>No document outline</strong><p>This PDF does not contain bookmarks.</p></div>;
  return <ul className="outline-tree">{nodes.map((node, index) => <OutlineItem key={`${node.title}-${index}`} node={node} onSelect={onSelect} />)}</ul>;
}

function OutlineItem({ node, onSelect }: { node: OutlineNode; onSelect: (node: OutlineNode) => void }) {
  return <li><button style={{ fontStyle: node.italic ? "italic" : undefined, fontWeight: node.bold ? 700 : undefined }} onClick={() => onSelect(node)} type="button">{node.title || "Untitled bookmark"}</button>{node.items?.length ? <ul>{node.items.map((child, index) => <OutlineItem key={`${child.title}-${index}`} node={child} onSelect={onSelect} />)}</ul> : null}</li>;
}

interface SearchSidebarProps { query: string; caseSensitive: boolean; wholeWord: boolean; searching: boolean; progress: { done: number; total: number } | null; results: PdfSearchResult[]; onQueryChange: (value: string) => void; onCaseChange: (value: boolean) => void; onWholeChange: (value: boolean) => void; onRun: () => void; onCancel: () => void; onSelect: (pageNumber: number) => void }

function SearchSidebar(props: SearchSidebarProps) {
  const totalMatches = props.results.reduce((sum, result) => sum + result.matchCount, 0);
  return <div className="search-sidebar"><form onSubmit={(event: { preventDefault(): void }) => { event.preventDefault(); props.onRun(); }}><input aria-label="Search document" autoFocus onChange={(event: { target: HTMLInputElement }) => props.onQueryChange(event.target.value)} placeholder="Search document" type="search" value={props.query} /><button className="button button--small" disabled={!props.query.trim() || props.searching} type="submit">Search</button></form><details className="search-options"><summary>Search options</summary><label><input checked={props.caseSensitive} onChange={(event: { target: HTMLInputElement }) => props.onCaseChange(event.target.checked)} type="checkbox" /> Match case</label><label><input checked={props.wholeWord} onChange={(event: { target: HTMLInputElement }) => props.onWholeChange(event.target.checked)} type="checkbox" /> Whole word</label></details>{props.searching && props.progress ? <div aria-live="polite" className="search-progress" role="status"><progress aria-label="Search progress" max={props.progress.total} value={props.progress.done} /><span>{props.progress.done} / {props.progress.total} pages</span><button onClick={props.onCancel} type="button">Cancel</button></div> : null}{!props.searching && props.query ? <p className="search-summary">{totalMatches} {totalMatches === 1 ? "match" : "matches"} on {props.results.length} pages</p> : null}<div className="search-results">{props.results.map((result) => <button key={result.id} onClick={() => props.onSelect(result.pageNumber)} type="button"><strong>Page {result.pageLabel ?? result.pageNumber}</strong><span>{result.matchCount} {result.matchCount === 1 ? "match" : "matches"}</span><p>{result.snippet}</p></button>)}</div></div>;
}

function InformationSidebar({ metadata, project }: { metadata: DocumentMetadata; project: ProjectManifest }) {
  const basic = [["Filename", project.sourceFilename], ["Pages", project.summary.pageCount], ["File size", formatBytes(project.byteLength)], ["Title", metadata.Title], ["Author", metadata.Author], ["Forms", project.summary.formFieldCount ?? 0]];
  const technical = [["Storage", project.storageKind.toUpperCase()], ["Checksum", `${project.checksum.slice(0, 16)}…`], ["Creator", metadata.Creator], ["Producer", metadata.Producer], ["PDF version", metadata.PDFFormatVersion], ["Attachments", project.summary.attachmentCount ?? 0], ["JavaScript", project.summary.hasJavaScript ? "Detected; execution disabled" : "Not detected"]];
  return <div className="viewer-info-r3"><dl className="info-list">{basic.map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{value === undefined || value === "" ? "—" : String(value)}</dd></div>)}</dl><details><summary>Technical details</summary><dl className="info-list">{technical.map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{value === undefined || value === "" ? "—" : String(value)}</dd></div>)}</dl></details></div>;
}

function ViewerFatalError({ error }: { error: string }) { return <div className="fatal-state"><strong>Project could not be opened</strong><p>{error}</p><a className="button" href={routeHref({ name: "home" })}>Return home</a></div>; }
function isPhoneViewport(): boolean { return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 680px)").matches : false; }
function formatBytes(value: number): string { if (value < 1024) return `${value} B`; const units = ["KB", "MB", "GB"]; let current = value / 1024; let index = 0; while (current >= 1024 && index < units.length - 1) { current /= 1024; index += 1; } return `${current.toFixed(1)} ${units[index]}`; }
function safeName(value: string): string { return value.replace(/[\\/:*?"<>|]+/g, "-").trim() || "local-pdf-project"; }