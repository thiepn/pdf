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
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Could not open PDF"); }
    })();
    return () => { cancelled = true; abortRef.current?.abort(); activePasswordRef.current = undefined; sourceBytesRef.current = null; const current = documentRef.current; documentRef.current = null; if (current) void current.loadingTask.destroy(); };
  }, [projectId, onTitleChange]);

  async function openOrganizerDocument(manifest: ProjectManifest, bytes: Uint8Array, suppliedPassword?: string): Promise<void> {
    setStatus("Opening pages…");
    setError(null);
    try {
      const previous = documentRef.current;
      documentRef.current = null;
      if (previous) await previous.loadingTask.destroy();
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
      onTitleChange?.(`Pages · ${manifest.name}`, `${pdf.numPages} pages · Select pages, make changes, then create an output.`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message)) {
        setPasswordRequired(true);
        setError("This PDF requires its password before page changes can be prepared.");
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
  const lastChange = history.at(-1)?.label;

  const commit = useCallback((label: string, next: PagePlanItem[]) => {
    setHistory((current) => [...current.slice(-39), { items, label }]);
    setItems(next);
    setFuture([]);
    setWarnings([]);
    setStatus(label);
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
    commit("Moved pages", moveItems(items, ids, targetIndex));
  }

  function undo(): void {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((current) => [{ items, label: previous.label }, ...current]);
    setItems(previous.items);
    setHistory((current) => current.slice(0, -1));
    setStatus(`Undid ${previous.label.toLowerCase()}`);
  }

  function redo(): void {
    const next = future[0];
    if (!next) return;
    setHistory((current) => [...current, { items, label: next.label }]);
    setItems(next.items);
    setFuture((current) => current.slice(1));
    setStatus(`Redid ${next.label.toLowerCase()}`);
  }

  async function exportPlan(mode: "all" | "selected", saveProject: boolean): Promise<void> {
    if (!project) return;
    const plan = mode === "selected" ? items.filter((item) => item.selected) : items;
    if (!plan.length) { setError("Select at least one page to extract."); return; }
    setProcessing(true); setError(null); setWarnings([]); setStatus(mode === "selected" ? "Extracting selected pages…" : "Creating PDF…");
    const controller = new AbortController(); abortRef.current = controller;
    try {
      await runProjectOperation(projectId, { label: mode === "selected" ? "Extracting selected pages" : saveProject ? "Saving organized PDF" : "Exporting organized PDF", signal: controller.signal, reserveBytes: saveProject ? project.byteLength : undefined }, async ({ signal, update }) => {
      update({ detail: mode === "selected" ? "Preparing selected pages…" : "Preparing pages…", progress: 0.08 });
      const source = sourceBytesRef.current ?? await loadProjectBytes(project);
      const result = await compilePagePlan(source, plan.map(({ sourcePageIndex, rotation }) => ({ sourcePageIndex, rotation })), signal, activePasswordRef.current);
      update({ stage: "validating", detail: "Checking the output PDF…", progress: 0.82 });
      const summary = await inspectPdfBytes(result.bytes);
      if (summary.pageCount !== plan.length) throw new Error(`Validation failed: expected ${plan.length} pages, received ${summary.pageCount}.`);
      setWarnings(result.warnings);
      const suffix = mode === "selected" ? "extracted" : "organized";
      const filename = `${safeName(project.name)}_${suffix}.pdf`;
      if (saveProject) {
        update({ stage: "committing", detail: "Saving a new local project…", progress: 0.94 });
        const created = await createDerivedProjectFromBytes(projectId, result.bytes, filename, "organize-pages");
        window.location.hash = routeHref({ name: "viewer", projectId: created.id }).slice(1);
      } else {
        downloadBlob(new Blob([Uint8Array.from(result.bytes).buffer], { type: "application/pdf" }), filename);
        setStatus(`Downloaded validated copy · ${result.pageCount} pages · ${formatBytes(result.outputBytes)}`);
      }
      update({ progress: 1 });
      });
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("Ready");
    } finally { setProcessing(false); abortRef.current = null; }
  }

  if (!project) return <div className="viewer-loading"><span className="spinner" /><strong>{error ?? status}</strong></div>;
  if (!document) return <div className="organizer-app"><div className="viewer-loading"><span className="spinner" /><strong>{status}</strong></div>{passwordRequired ? <div className="viewer-password-overlay"><div className="viewer-password-dialog"><p className="eyebrow">Protected document</p><h2>Password required</h2><p>The password is used only for this local session.</p><input autoFocus autoComplete="off" onChange={(event) => setPassword(event.target.value)} placeholder="PDF password" type="password" value={password} /><button className="button" disabled={!password} onClick={() => void retryPassword()} type="button">Open pages</button><a className="button button--ghost" href={routeHref({ name: "viewer", projectId })}>Back to Read</a>{error ? <span className="selection-help selection-help--error">{error}</span> : null}</div></div> : null}</div>;

  return (
    <div className="organizer-app organizer-app--r3">
      <header className="organizer-toolbar organizer-toolbar--r3">
        <div className="organizer-toolbar__file"><div><strong>{project.name}</strong><span>{items.length} pages · Original PDF unchanged</span></div></div>
        <div className="organizer-toolbar__actions organizer-toolbar__history">
          <button disabled={!history.length || processing} onClick={undo} type="button">Undo</button>
          <button disabled={!future.length || processing} onClick={redo} type="button">Redo</button>
        </div>
        <div className="organizer-toolbar__export">
          <button className="button button--secondary button--small" disabled={!changed || processing} onClick={() => void exportPlan("all", false)} type="button">Download copy</button>
          <button className="button button--small" disabled={!changed || processing} onClick={() => void exportPlan("all", true)} type="button">Save new project</button>
          {processing ? <button className="button button--danger-ghost button--small" onClick={() => abortRef.current?.abort()} type="button">Cancel</button> : null}
        </div>
      </header>

      {error ? <div className="error-banner organizer-banner"><strong>Could not complete that action</strong><span>{error}</span><button onClick={() => setError(null)} type="button">Dismiss</button></div> : null}
      {warnings.length ? <div className="warning-banner organizer-banner"><strong>Output note</strong><span>{warnings.join(" ")}</span></div> : null}

      <section className="organizer-selectionbar organizer-selectionbar--r3">
        <div className="organizer-selectionbar__range"><label><span>Select pages</span><input onChange={(event) => setSelectionText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applySelectionExpression(); }} placeholder="1-5, 8" value={selectionText} /></label><button onClick={applySelectionExpression} type="button">Select</button></div>
        <div className="organizer-selectionbar__quick"><button onClick={() => setItems(items.map((item) => ({ ...item, selected: true })))} type="button">Select all</button><button disabled={!selectedCount} onClick={() => setItems(items.map((item) => ({ ...item, selected: false })))} type="button">Clear</button></div>
        <span className={selectionError ? "selection-help selection-help--error" : "selection-help"}>{selectionError ?? "Click a page to select it. Hold Ctrl/Cmd or Shift to keep the current selection."}</span>
        <strong>{processing ? status : changed ? `${lastChange ?? "Changes ready"} · create an output when finished` : "No page changes yet"}</strong>
      </section>

      {selectedCount ? <section className="organizer-selection-actions" aria-label="Selected page actions"><div><strong>{selectedCount} selected</strong><span>These changes are staged and can be undone.</span></div><div>
        <button disabled={processing} onClick={() => commit("Rotated pages left", rotateItems(items, selectedIds, -90))} type="button">Rotate left</button>
        <button disabled={processing} onClick={() => commit("Rotated pages right", rotateItems(items, selectedIds, 90))} type="button">Rotate right</button>
        <button disabled={processing} onClick={() => commit("Duplicated pages", duplicateItems(items, selectedIds))} type="button">Duplicate</button>
        <button disabled={processing || selectedCount === items.length} onClick={() => commit("Deleted pages", deleteItems(items, selectedIds))} type="button">Delete</button>
        {selectedCount > 1 ? <button disabled={processing} onClick={() => commit("Reversed selected pages", reverseItems(items, true))} type="button">Reverse selection</button> : null}
        <button className="button button--secondary button--small" disabled={processing} onClick={() => void exportPlan("selected", false)} type="button">Extract selected</button>
      </div></section> : <section className="organizer-selection-actions organizer-selection-actions--empty"><div><strong>Select pages to act on them</strong><span>Rotate, duplicate, delete, extract, or drag selected thumbnails into a new order.</span></div><button disabled={processing} onClick={() => commit("Reversed all pages", reverseItems(items, false))} type="button">Reverse all pages</button></section>}

      <details className="organizer-output-info"><summary>What happens when I create an output?</summary><p>The original project is not overwritten. Page appearance and page annotations are targeted for preservation, but rebuilt outputs may lose bookmarks, attachments, cryptographic signatures, and complex form relationships.{project.summary.encrypted ? " The new copy will not retain the source password." : ""}</p></details>

      <main className="organizer-grid">
        {items.map((item, index) => <OrganizerThumbnail displayIndex={index + 1} document={document} item={item} key={item.id} onDropAt={moveDragged} onToggle={toggleSelection} />)}
      </main>
    </div>
  );
}

function safeName(value: string): string { return value.replace(/[\\/:*?"<>|]+/g, "-").trim() || "document"; }
function formatBytes(value: number): string { return value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }