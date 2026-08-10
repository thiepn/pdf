import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { routeHref } from "../core/appRouter";
import { openPdfWithPdfJs, inspectPdfBytes } from "../engines/pdfjs";
import { downloadBlob } from "../projects/download";
import { createDerivedProjectFromBytes, getProject, loadProjectBytes } from "../projects/projectRepository";
import { runProjectOperation } from "../operations/projectOperationCoordinator";
import type { ProjectManifest } from "../types/project";
import type { PagePlanItem } from "../types/organizer";
import { compilePagePlan } from "../tools/pageOperationsClient";
import { createPagePlan, deleteItems, duplicateItems, moveItems, reverseItems, rotateItems, selectItems } from "../organizer/pagePlan";
import { parsePageSelection } from "../organizer/pageSelection";
import { OrganizerThumbnail } from "../organizer/OrganizerThumbnail";

interface OrganizerPageProps { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }
interface HistoryState { items: PagePlanItem[]; label: string }

export function OrganizerPage({ projectId, onTitleChange }: OrganizerPageProps) {
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sourceBytesRef = useRef<Uint8Array | null>(null);
  const activePasswordRef = useRef<string | undefined>(undefined);
  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [items, setItems] = useState<PagePlanItem[]>([]);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  const [selectionText, setSelectionText] = useState("");
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [status, setStatus] = useState("Opening project…");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
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
        sourceBytesRef.current = bytes;
        setProject(manifest);
        await openOrganizerDocument(manifest, bytes);
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Failed"); }
    })();
    return () => { cancelled = true; abortRef.current?.abort(); activePasswordRef.current = undefined; sourceBytesRef.current = null; const current = documentRef.current; documentRef.current = null; if (current) void current.destroy(); };
  }, [projectId, onTitleChange]);

  async function openOrganizerDocument(manifest: ProjectManifest, bytes: Uint8Array, suppliedPassword?: string): Promise<void> {
    setStatus("Opening PDF engine…");
    setError(null);
    try {
      const previous = documentRef.current;
      documentRef.current = null;
      if (previous) await previous.destroy();
      const pdf = await openPdfWithPdfJs(bytes, suppliedPassword);
      documentRef.current = pdf;
      activePasswordRef.current = suppliedPassword;
      setDocument(pdf);
      setItems(createPagePlan(pdf.numPages));
      setHistory([]);
      setFuture([]);
      setPasswordRequired(false);
      setPassword("");
      setStatus("Ready");
      onTitleChange?.(`Organize · ${manifest.name}`, `${pdf.numPages} pages · Changes remain virtual until export.`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message)) {
        setPasswordRequired(true);
        setError("This project is encrypted. Enter the password for this in-memory editing session.");
      } else throw reason;
    }
  }

  async function retryPassword(): Promise<void> {
    if (!project || !sourceBytesRef.current || !password) return;
    try { await openOrganizerDocument(project, sourceBytesRef.current, password); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  const selectedIds = useMemo(() => new Set(items.filter((item) => item.selected).map((item) => item.id)), [items]);
  const selectedCount = selectedIds.size;
  const changed = useMemo(() => items.length !== document?.numPages || items.some((item, index) => item.sourcePageIndex !== index || item.rotation !== 0), [items, document]);

  const commit = useCallback((label: string, next: PagePlanItem[]) => {
    setHistory((current) => [...current.slice(-39), { items, label }]);
    setItems(next);
    setFuture([]);
    setWarnings([]);
  }, [items]);

  function toggleSelection(id: string, additive: boolean): void {
    setItems((current) => current.map((item) => ({ ...item, selected: item.id === id ? !item.selected : additive ? item.selected : false })));
  }

  function applySelectionExpression(): void {
    const parsed = parsePageSelection(selectionText, items.length);
    if (parsed.errors.length) { setSelectionError(parsed.errors.join(" ")); return; }
    setSelectionError(null);
    setItems(selectItems(items, parsed.pages));
  }

  function moveDragged(id: string, targetIndex: number): void {
    const ids = selectedIds.has(id) ? selectedIds : new Set([id]);
    commit("Move pages", moveItems(items, ids, targetIndex));
  }

  function undo(): void {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((current) => [{ items, label: previous.label }, ...current]);
    setItems(previous.items);
    setHistory((current) => current.slice(0, -1));
  }

  function redo(): void {
    const next = future[0];
    if (!next) return;
    setHistory((current) => [...current, { items, label: next.label }]);
    setItems(next.items);
    setFuture((current) => current.slice(1));
  }

  async function exportPlan(mode: "all" | "selected", saveProject: boolean): Promise<void> {
    if (!project) return;
    const plan = mode === "selected" ? items.filter((item) => item.selected) : items;
    if (!plan.length) { setError("Select at least one page to extract."); return; }
    setProcessing(true); setError(null); setWarnings([]); setStatus(mode === "selected" ? "Extracting selected pages…" : "Compiling page plan…");
    const controller = new AbortController(); abortRef.current = controller;
    try {
      await runProjectOperation(projectId, { label: mode === "selected" ? "Extracting selected pages" : saveProject ? "Saving organized PDF" : "Exporting organized PDF", signal: controller.signal, reserveBytes: saveProject ? project.byteLength : undefined }, async ({ signal, update }) => {
      update({ detail: mode === "selected" ? "Compiling selected pages…" : "Compiling page plan…", progress: 0.08 });
      const source = sourceBytesRef.current ?? await loadProjectBytes(project);
      const result = await compilePagePlan(source, plan.map(({ sourcePageIndex, rotation }) => ({ sourcePageIndex, rotation })), signal, activePasswordRef.current);
      update({ stage: "validating", detail: "Reopening page-plan output…", progress: 0.82 });
      const summary = await inspectPdfBytes(result.bytes);
      if (summary.pageCount !== plan.length) throw new Error(`Validation failed: expected ${plan.length} pages, received ${summary.pageCount}.`);
      setWarnings(result.warnings);
      const suffix = mode === "selected" ? "extracted" : "organized";
      const filename = `${safeName(project.name)}_${suffix}.pdf`;
      if (saveProject) {
        update({ stage: "committing", detail: "Saving a new revision…", progress: 0.94 });
        const created = await createDerivedProjectFromBytes(projectId, result.bytes, filename, "organize-pages");
        window.location.hash = routeHref({ name: "viewer", projectId: created.id }).slice(1);
      } else {
        downloadBlob(new Blob([Uint8Array.from(result.bytes).buffer], { type: "application/pdf" }), filename);
        setStatus(`Validated ${result.pageCount}-page output · ${formatBytes(result.outputBytes)}`);
      }
      update({ progress: 1 });
      });
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("Ready");
    } finally { setProcessing(false); abortRef.current = null; }
  }

  if (!project) return <div className="viewer-loading"><span className="spinner" /><strong>{error ?? status}</strong></div>;
  if (!document) return <div className="organizer-app"><div className="viewer-loading"><span className="spinner" /><strong>{status}</strong></div>{passwordRequired ? <div className="viewer-password-overlay"><div className="viewer-password-dialog"><p className="eyebrow">Protected document</p><h2>Password required</h2><p>The password remains in memory only and is passed directly to the local PDF engines.</p><input autoFocus autoComplete="off" onChange={(event) => setPassword(event.target.value)} placeholder="PDF password" type="password" value={password} /><button className="button" disabled={!password} onClick={() => void retryPassword()} type="button">Open organizer</button><a className="button button--ghost" href={routeHref({ name: "viewer", projectId })}>Return to viewer</a>{error ? <span className="selection-help selection-help--error">{error}</span> : null}</div></div> : null}</div>;

  return (
    <div className="organizer-app">
      <header className="organizer-toolbar">
        <div className="organizer-toolbar__file"><a className="icon-button" href={routeHref({ name: "viewer", projectId })}>←</a><div><strong>{project.name}</strong><span>{items.length} output pages · {selectedCount} selected</span></div></div>
        <div className="organizer-toolbar__actions">
          <button disabled={!history.length || processing} onClick={undo} type="button">Undo</button>
          <button disabled={!future.length || processing} onClick={redo} type="button">Redo</button>
          <span />
          <button disabled={!selectedCount || processing} onClick={() => commit("Rotate pages", rotateItems(items, selectedIds, -90))} type="button">Rotate left</button>
          <button disabled={!selectedCount || processing} onClick={() => commit("Rotate pages", rotateItems(items, selectedIds, 90))} type="button">Rotate right</button>
          <button disabled={!selectedCount || processing} onClick={() => commit("Duplicate pages", duplicateItems(items, selectedIds))} type="button">Duplicate</button>
          <button disabled={!selectedCount || processing || selectedCount === items.length} onClick={() => commit("Delete pages", deleteItems(items, selectedIds))} type="button">Delete</button>
          <button disabled={processing} onClick={() => commit("Reverse pages", reverseItems(items, selectedCount > 1))} type="button">Reverse {selectedCount > 1 ? "selection" : "all"}</button>
        </div>
        <div className="organizer-toolbar__export">
          <button className="button button--ghost button--small" disabled={!selectedCount || processing} onClick={() => void exportPlan("selected", false)} type="button">Extract selected</button>
          <button className="button button--secondary button--small" disabled={!changed || processing} onClick={() => void exportPlan("all", false)} type="button">Download PDF</button>
          <button className="button button--small" disabled={!changed || processing} onClick={() => void exportPlan("all", true)} type="button">Save as project</button>
          {processing ? <button className="button button--danger-ghost button--small" onClick={() => abortRef.current?.abort()} type="button">Cancel</button> : null}
        </div>
      </header>

      {error ? <div className="error-banner organizer-banner"><strong>Operation failed</strong><span>{error}</span></div> : null}
      <div className="warning-banner organizer-banner"><strong>What may change in the exported copy</strong><span>Page appearance and page annotations are targeted for preservation. Rebuilt outputs may lose document bookmarks, attachments, cryptographic signatures, and complex form relationships.{project.summary.encrypted ? " The exported copy will not retain the source password." : ""}</span></div>
      {warnings.length ? <div className="warning-banner organizer-banner"><strong>Export report</strong><span>{warnings.join(" ")}</span></div> : null}

      <section className="organizer-selectionbar">
        <label><span>Select pages</span><input onChange={(event) => setSelectionText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applySelectionExpression(); }} placeholder="Example: 1-5, 8" value={selectionText} /></label>
        <button onClick={applySelectionExpression} type="button">Apply</button>
        <button onClick={() => setItems(items.map((item) => ({ ...item, selected: true })))} type="button">All</button>
        <button onClick={() => setItems(items.map((item) => ({ ...item, selected: false })))} type="button">None</button>
        <div className="selection-examples" aria-label="Page selection examples"><span>Examples:</span><button onClick={() => setSelectionText("1-5")} type="button">Pages 1–5</button><button onClick={() => setSelectionText("odd")} type="button">Odd pages</button><button onClick={() => setSelectionText("even")} type="button">Even pages</button><button onClick={() => setSelectionText("all,!3")} type="button">All except 3</button></div>
        <span className={selectionError ? "selection-help selection-help--error" : "selection-help"}>{selectionError ?? "Type a page range and press Apply, or click thumbnails. Ctrl/Cmd or Shift keeps the current selection."}</span>
        <strong>{processing ? status : changed ? "Unsaved page plan" : "Original order"}</strong>
      </section>

      <main className="organizer-grid">
        {items.map((item, index) => <OrganizerThumbnail displayIndex={index + 1} document={document} item={item} key={item.id} onDropAt={moveDragged} onToggle={toggleSelection} />)}
      </main>
    </div>
  );
}

function safeName(value: string): string { return value.replace(/[\\/:*?"<>|]+/g, "-").trim() || "document"; }
function formatBytes(value: number): string { return value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }
