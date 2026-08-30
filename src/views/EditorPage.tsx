import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Icon, type IconName } from "../components/Icon";
import { routeHref } from "../core/appRouter";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import { useModalFocus } from "../accessibility/modalFocus";
import type { Rect } from "../core/coordinates";
import { openPdfWithPdfJs, inspectPdfAnnotationInventory, inspectPdfBytes } from "../engines/pdfjs";
import { EditorCanvasPage } from "../editor/components/EditorCanvasPage";
import { EditorPropertiesPanel } from "../editor/components/EditorPropertiesPanel";
import { UnifiedLayoutPropertiesPanel } from "../editor/components/UnifiedLayoutPropertiesPanel";
import { createHistory, commitHistory, redoHistory, undoHistory } from "../editor/editorHistory";
import { cloneObjects, createEditorState, duplicateObjects, moveRect, updateObjects } from "../editor/editorModel";
import { listEditorAssets, readEditorState, writeEditorAsset, writeEditorState } from "../editor/editorRepository";
import { exportEditorPdf } from "../editor/editorExportClient";
import { NativeContentPropertiesPanel } from "../editor/native/NativeContentPropertiesPanel";
import { nativeObjectLabel, type NativeTransformMode } from "../editor/native/NativeContentOverlay";
import {
  alignBounds,
  canvasToEditorRect,
  canvasToNativeRect,
  clampCanvasBounds,
  distributeBounds,
  editorLayoutItem,
  effectiveNativeBounds,
  matchSizeBounds,
  moveBounds,
  nativeDeleteEdit,
  nativeGeometryEdit,
  nativeLayoutItem,
  nativeRectToCanvas,
  nativeRotationEdit,
  type UnifiedAlign,
  type UnifiedCanvasBounds,
  type UnifiedDistributionAxis,
  type UnifiedLayoutItem
} from "../editor/unifiedLayout";
import { applyNativeEdits, inspectNativePdf } from "../native/nativeClient";
import { discardNativeObjectEdits, mergeNativeEdits } from "../native/nativeEditQueue";
import { readNativeState, writeNativeState } from "../native/nativeRepository";
import { downloadBlob } from "../projects/download";
import { createDerivedProjectFromBytes, getProject, loadProjectBytes, updateProject } from "../projects/projectRepository";
import { runProjectOperation } from "../operations/projectOperationCoordinator";
import { scheduleDeferredHydration, type DeferredHydrationHandle } from "../performance/deferredHydration";
import { recordRuntimeMetric } from "../performance/runtimeMetrics";
import { describeLocalSaveError, localSaveNeedsUnloadGuard, localSaveStatusLabel, type LocalSaveState } from "../persistence/localSaveTrust";
import type { EditorAssetRecord, EditorDocumentState, EditorExportAsset, EditorHistoryState, EditorObject, EditorTool, ImageEditorObject } from "../types/editor";
import type { ProjectManifest } from "../types/project";
import { NATIVE_EDITOR_SCHEMA_VERSION, type NativeEdit, type NativeInspection, type NativePageObject, type NativeRect } from "../types/nativeEditor";
import { Thumbnail } from "../viewer/Thumbnail";

interface Props { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }
type LeftTab = "pages" | "layers" | "comments";
type LocalSaveSnapshot = { editor: EditorDocumentState; native: Parameters<typeof writeNativeState>[0]; project: ProjectManifest };

const toolGroups: Array<{ label: string; tools: Array<{ id: EditorTool; label: string; key?: string; icon: IconName }> }> = [
  { label: "Navigate", tools: [
    { id: "select", label: "Select", key: "V", icon: "select" },
    { id: "hand", label: "Pan", key: "H", icon: "hand" }
  ] },
  { label: "Insert", tools: [
    { id: "text", label: "Text", key: "T", icon: "text" },
    { id: "image", label: "Image", key: "I", icon: "image" },
    { id: "link", label: "Link", icon: "link" },
    { id: "signature", label: "Signature", icon: "signature" },
    { id: "stamp", label: "Stamp", icon: "stamp" }
  ] },
  { label: "Shapes", tools: [
    { id: "rectangle", label: "Rectangle", key: "R", icon: "rectangle" },
    { id: "ellipse", label: "Ellipse", key: "E", icon: "ellipse" },
    { id: "line", label: "Line", key: "L", icon: "line" },
    { id: "arrow", label: "Arrow", key: "A", icon: "arrow" }
  ] },
  { label: "Markup", tools: [
    { id: "highlight", label: "Highlight", key: "K", icon: "highlight" },
    { id: "underline", label: "Underline", icon: "underline" },
    { id: "strikeout", label: "Strikeout", icon: "strikeout" },
    { id: "squiggly", label: "Squiggly", icon: "squiggly" }
  ] },
  { label: "Review", tools: [
    { id: "pen", label: "Draw", key: "P", icon: "pen" },
    { id: "note", label: "Comment", key: "C", icon: "comment" }
  ] },
  { label: "Redaction", tools: [
    { id: "redaction", label: "Mark redaction", key: "X", icon: "redaction" }
  ] }
];
const tools = toolGroups.flatMap((group) => group.tools);

export function EditorPage({ projectId, onTitleChange }: Props) {
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const sourceBytesRef = useRef<Uint8Array | null>(null);
  const passwordRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const hydrationRef = useRef<DeferredHydrationHandle | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const internalClipboardRef = useRef<EditorObject[]>([]);
  const objectUrlsRef = useRef<Map<string, string>>(new Map());
  const localSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const localSaveRevisionRef = useRef(0);
  const localSaveQueuedRevisionRef = useRef(0);
  const localSaveCompletedRevisionRef = useRef(0);
  const latestLocalSaveRef = useRef<{ revision: number; snapshot: LocalSaveSnapshot } | null>(null);
  const editorMountedRef = useRef(true);
  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [editorState, setEditorState] = useState<EditorDocumentState>(() => createEditorState(projectId));
  const [history, setHistory] = useState<EditorHistoryState>(() => createHistory());
  const [previewObject, setPreviewObject] = useState<EditorObject | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assetUrls, setAssetUrls] = useState<Map<string, string>>(new Map());
  const [leftTab, setLeftTab] = useState<LeftTab>("pages");
  const [sidebarOpen, setSidebarOpen] = useState(() => !isCompactViewport());
  const [propertiesOpen, setPropertiesOpen] = useState(() => !isCompactViewport());
  const [pageGeometry, setPageGeometry] = useState<Rect>({ x0: 0, y0: 0, x1: 612, y1: 792 });
  const [status, setStatus] = useState("Opening editor…");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [localSave, setLocalSave] = useState<LocalSaveState>({ phase: "idle", revision: 0 });
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [lastReport, setLastReport] = useState<string | null>(null);
  const [nativeInspection, setNativeInspection] = useState<NativeInspection | null>(null);
  const [nativeEdits, setNativeEdits] = useState<NativeEdit[]>([]);
  const [selectedNativeId, setSelectedNativeId] = useState<string | undefined>();
  const [selectedNativeIds, setSelectedNativeIds] = useState<Set<string>>(new Set());
  const [showNativeContent, setShowNativeContent] = useState(true);
  const [nativeInspecting, setNativeInspecting] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const mobileToolsRef = useRef<HTMLDivElement | null>(null);
  const mobileToolsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeMobileTools = useCallback(() => setMobileToolsOpen(false), []);
  useModalFocus(mobileToolsOpen, mobileToolsRef, closeMobileTools, undefined, mobileToolsTriggerRef);

  const enqueueLocalSave = useCallback((revision: number, snapshot: LocalSaveSnapshot) => {
    localSaveQueuedRevisionRef.current = Math.max(localSaveQueuedRevisionRef.current, revision);
    localSaveQueueRef.current = localSaveQueueRef.current.catch(() => undefined).then(async () => {
      if (editorMountedRef.current && revision === localSaveRevisionRef.current) setLocalSave({ phase: "saving", revision });
      try {
        await persistLocalSaveSnapshot(snapshot);
        localSaveCompletedRevisionRef.current = Math.max(localSaveCompletedRevisionRef.current, revision);
        if (editorMountedRef.current && revision === localSaveRevisionRef.current) setLocalSave({ phase: "saved", revision, savedAt: Date.now() });
      } catch (reason) {
        if (editorMountedRef.current && revision === localSaveRevisionRef.current) setLocalSave({ phase: "error", revision, message: describeLocalSaveError(reason) });
      }
    });
  }, []);

  useEffect(() => {
    editorMountedRef.current = true;
    return () => {
      editorMountedRef.current = false;
      const latest = latestLocalSaveRef.current;
      if (!latest || localSaveCompletedRevisionRef.current >= latest.revision || localSaveQueuedRevisionRef.current >= latest.revision) return;
      localSaveQueuedRevisionRef.current = latest.revision;
      void persistLocalSaveSnapshot(latest.snapshot).catch(() => undefined);
    };
  }, []);

  const displayObjects = useMemo(() => {
    const base = history.present.objects;
    if (!previewObject) return base;
    const found = base.some((object) => object.id === previewObject.id);
    return found ? base.map((object) => object.id === previewObject.id ? previewObject : object) : [...base, previewObject];
  }, [history.present.objects, previewObject]);
  const selectedObjects = useMemo(() => displayObjects.filter((object) => selectedIds.has(object.id)), [displayObjects, selectedIds]);
  const selectedSourceObjects = useMemo(() => history.present.objects.filter((object) => selectedIds.has(object.id)), [history.present.objects, selectedIds]);
  const currentPageObjects = useMemo(() => displayObjects.filter((object) => object.pageNumber === editorState.currentPage), [displayObjects, editorState.currentPage]);
  const comments = useMemo(() => displayObjects.filter((object): object is Extract<EditorObject, { type: "note" }> => object.type === "note"), [displayObjects]);
  const redactionCount = useMemo(() => displayObjects.filter((object) => object.type === "redaction").length, [displayObjects]);
  const currentNativePage = useMemo(() => nativeInspection?.pages.find((page) => page.pageNumber === editorState.currentPage), [nativeInspection, editorState.currentPage]);
  const currentNativeObjects = currentNativePage?.objects ?? [];
  const selectedNativeObjects = useMemo(() => currentNativeObjects.filter((object) => selectedNativeIds.has(object.id)), [currentNativeObjects, selectedNativeIds]);
  const selectedNativeObject = useMemo(() => nativeInspection?.pages.flatMap((page) => page.objects).find((object) => object.id === selectedNativeId), [nativeInspection, selectedNativeId]);
  const nativeEffectiveBounds = useMemo(() => new Map(currentNativeObjects.map((object) => [object.id, effectiveNativeBounds(object, nativeEdits)])), [currentNativeObjects, nativeEdits]);
  const nativeTransformableIds = useMemo(() => new Set(currentNativeObjects.filter((object) => { const item = currentNativePage ? nativeLayoutItem(object, currentNativePage, nativeEdits) : undefined; return Boolean(item?.movable || item?.resizable); }).map((object) => object.id)), [currentNativeObjects, currentNativePage, nativeEdits]);
  const unifiedItems = useMemo<UnifiedLayoutItem[]>(() => {
    const overlay = selectedSourceObjects.map((object) => editorLayoutItem(object, pageGeometry));
    const native = currentNativePage ? selectedNativeObjects.map((object) => nativeLayoutItem(object, currentNativePage, nativeEdits)) : [];
    return [...overlay, ...native];
  }, [currentNativePage, nativeEdits, pageGeometry, selectedNativeObjects, selectedSourceObjects]);
  const unifiedSelectionCount = selectedIds.size + selectedNativeIds.size;
  const primaryUnifiedKey = selectedNativeId && selectedNativeIds.has(selectedNativeId) ? `native:${selectedNativeId}` : selectedSourceObjects.length ? `editor:${selectedSourceObjects[selectedSourceObjects.length - 1].id}` : undefined;
  const changeCount = history.present.objects.length + nativeEdits.length;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const manifest = await getProject(projectId);
        if (!manifest) throw new Error("Project not found.");
        if (cancelled) return;
        setProject(manifest);
        const [bytes, storedState, storedNativeState] = await Promise.all([
          loadProjectBytes(manifest),
          readEditorState(projectId),
          readNativeState(projectId)
        ]);
        if (cancelled) return;
        sourceBytesRef.current = bytes;
        setEditorState({ ...storedState, currentPage: Math.max(1, Math.min(manifest.summary.pageCount, storedState.currentPage)) });
        setHistory(createHistory(storedState.objects));
        setNativeEdits(storedNativeState.queuedEdits);
        await openDocument(manifest, bytes);
      } catch (reason) { if (!cancelled) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Failed"); } }
    })();
    return () => {
      cancelled = true;
      hydrationRef.current?.cancel(); hydrationRef.current = null;
      abortRef.current?.abort();
      passwordRef.current = undefined;
      sourceBytesRef.current = null;
      const current = documentRef.current;
      documentRef.current = null;
      if (current) void current.loadingTask.destroy();
      for (const url of objectUrlsRef.current.values()) URL.revokeObjectURL(url);
      objectUrlsRef.current.clear();
    };
  }, [projectId]);

  useEffect(() => {
    if (!project || !document) return;
    const revision = ++localSaveRevisionRef.current;
    const now = Date.now();
    const state: EditorDocumentState = { ...editorState, objects: cloneObjects(history.present.objects), updatedAt: now };
    const snapshot: LocalSaveSnapshot = {
      editor: state,
      native: { projectId, schemaVersion: NATIVE_EDITOR_SCHEMA_VERSION, pageNumber: editorState.currentPage, queuedEdits: nativeEdits, updatedAt: now },
      project: { ...project, recovery: { ...project.recovery, dirty: state.dirty || nativeEdits.length > 0 } }
    };
    latestLocalSaveRef.current = { revision, snapshot };
    setLocalSave({ phase: "pending", revision });
    const timer = window.setTimeout(() => enqueueLocalSave(revision, snapshot), 500);
    return () => clearTimeout(timer);
  }, [document, editorState, enqueueLocalSave, history.present.objects, nativeEdits, project, projectId]);

  useEffect(() => {
    if (!localSaveNeedsUnloadGuard(localSave)) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [localSave]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (command && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
      if (command && event.key.toLowerCase() === "c") { event.preventDefault(); void copySelection(); return; }
      if (command && event.key.toLowerCase() === "v") { event.preventDefault(); void pasteSelection(); return; }
      if (command && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelection(); return; }
      if (event.key === "Escape") { setSelectedIds(new Set()); setSelectedNativeIds(new Set()); setSelectedNativeId(undefined); return; }
      if (event.key === "Delete" || event.key === "Backspace") { if (unifiedSelectionCount) { event.preventDefault(); deleteSelection(); } return; }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && unifiedSelectionCount) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        nudgeUnified(dx, dy);
        return;
      }
      const match = tools.find((tool) => tool.key?.toLowerCase() === event.key.toLowerCase());
      if (match) { event.preventDefault(); activateTool(match.id); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [history, selectedIds, selectedNativeIds, editorState, nativeEdits, currentNativePage, currentNativeObjects, pageGeometry, unifiedItems]);

  async function openDocument(manifest: ProjectManifest, bytes: Uint8Array, suppliedPassword?: string): Promise<void> {
    hydrationRef.current?.cancel();
    hydrationRef.current = null;
    setStatus("Opening PDF engine…"); setError(null);
    try {
      const previous = documentRef.current;
      documentRef.current = null;
      if (previous) await previous.loadingTask.destroy();
      const pdf = await openPdfWithPdfJs(bytes, suppliedPassword);
      documentRef.current = pdf;
      setDocument(pdf);
      passwordRef.current = suppliedPassword;
      setPasswordRequired(false); setPassword("");
      setNativeInspection(null);
      setNativeInspecting(false);
      setStatus("Ready · loading PDF content…");
      onTitleChange?.(`Edit · ${manifest.name}`, `${pdf.numPages} pages · Unified editor ready`);
      recordRuntimeMetric("custom", "readiness.editor.interactive", 0, undefined, { projectId: manifest.id, pageCount: pdf.numPages });

      hydrationRef.current = scheduleDeferredHydration(async (signal) => {
        if (signal.aborted || documentRef.current !== pdf) return;
        setNativeInspecting(true);
        const [inspectionResult, assetsResult] = await Promise.allSettled([
          inspectNativePdf(bytes, suppliedPassword, signal),
          listEditorAssets(projectId)
        ]);
        if (signal.aborted || documentRef.current !== pdf) return;
        if (assetsResult.status === "fulfilled") createAssetUrls(assetsResult.value);
        if (inspectionResult.status === "fulfilled") {
          const inspection = inspectionResult.value;
          setNativeInspection(inspection);
          setStatus("Ready");
          onTitleChange?.(`Edit · ${manifest.name}`, `${pdf.numPages} pages · ${inspection.totals.text + inspection.totals.images + inspection.totals.vectors + inspection.totals.tables + inspection.totals.forms} detected PDF objects · Unified editor`);
          recordRuntimeMetric("custom", "readiness.editor.nativeHydrated", 0, undefined, { projectId: manifest.id, detectedObjects: inspection.totals.text + inspection.totals.images + inspection.totals.vectors + inspection.totals.tables + inspection.totals.forms });
        } else {
          const inspectionError = inspectionResult.reason;
          if (!(inspectionError instanceof DOMException && inspectionError.name === "AbortError")) {
            setWarnings((current) => [...current, `Existing-content inspection unavailable: ${inspectionError instanceof Error ? inspectionError.message : String(inspectionError)}`]);
            setStatus("Ready · overlay editing only");
            recordRuntimeMetric("custom", "readiness.editor.nativeHydrated", 0, undefined, { projectId: manifest.id, detectedObjects: 0 });
          }
        }
        setNativeInspecting(false);
      }, { label: "editor", timeoutMs: 1_500 });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message)) { setPasswordRequired(true); setError("Enter the PDF password for this in-memory editing session."); }
      else throw reason;
    }
  }

  function createAssetUrls(assets: EditorAssetRecord[]): void {
    for (const url of objectUrlsRef.current.values()) URL.revokeObjectURL(url);
    objectUrlsRef.current.clear();
    const map = new Map<string, string>();
    for (const asset of assets) {
      const url = URL.createObjectURL(new Blob([asset.bytes.slice(0)], { type: asset.mimeType }));
      objectUrlsRef.current.set(asset.id, url);
      map.set(asset.id, url);
    }
    setAssetUrls(map);
  }

  function activateTool(tool: EditorTool): void {
    if (tool === "image") { imageInputRef.current?.click(); return; }
    setEditorState((state) => ({ ...state, activeTool: tool }));
    if (tool !== "select") { setSelectedIds(new Set()); setSelectedNativeIds(new Set()); setSelectedNativeId(undefined); }
  }

  function selectObject(id: string | null, additive: boolean): void {
    if (!id) {
      if (!additive) { setSelectedIds(new Set()); setSelectedNativeIds(new Set()); setSelectedNativeId(undefined); }
      return;
    }
    if (!additive) { setSelectedNativeIds(new Set()); setSelectedNativeId(undefined); }
    const object = history.present.objects.find((item) => item.id === id);
    const targetIds = object?.groupId ? history.present.objects.filter((item) => item.groupId === object.groupId).map((item) => item.id) : [id];
    setSelectedIds((current) => {
      const next = additive ? new Set(current) : new Set<string>();
      const removing = additive && targetIds.every((targetId) => next.has(targetId));
      for (const targetId of targetIds) removing ? next.delete(targetId) : next.add(targetId);
      return next;
    });
  }

  function selectNativeObject(object: NativePageObject, additive = false): void {
    if (!additive) setSelectedIds(new Set());
    setSelectedNativeIds((current) => {
      const next = additive ? new Set(current) : new Set<string>();
      if (additive && next.has(object.id)) next.delete(object.id); else next.add(object.id);
      const primary = next.has(object.id) ? object.id : next.values().next().value as string | undefined;
      setSelectedNativeId(primary);
      return next;
    });
    if (isCompactViewport()) setSidebarOpen(false);
    setPropertiesOpen(true);
    setEditorState((state) => ({ ...state, activeTool: "select", currentPage: object.pageNumber }));
  }

  function queueNativeEdits(edits: NativeEdit[]): void {
    if (!edits.length) return;
    setNativeEdits((current) => mergeNativeEdits(current, edits));
    setEditorState((state) => ({ ...state, dirty: true, updatedAt: Date.now() }));
    setLastReport(null);
  }

  function removeNativeEdits(objectId: string): void {
    setNativeEdits((current) => discardNativeObjectEdits(current, objectId));
    setEditorState((state) => ({ ...state, dirty: true, updatedAt: Date.now() }));
  }

  function commitObjects(label: string, objects: EditorObject[], mergeKey?: string, nextSelection = selectedIds): void {
    setHistory((current) => commitHistory(current, label, objects, nextSelection, mergeKey));
    setPreviewObject(null);
    setEditorState((state) => ({ ...state, dirty: true, updatedAt: Date.now() }));
    onTitleChange?.(`Edit · ${project?.name ?? "PDF"}`, `${document?.numPages ?? 0} pages · ${objects.length} editor objects · Unsaved export`);
  }

  function addObject(object: EditorObject): void {
    const selection = new Set([object.id]);
    commitObjects(`Add ${object.type}`, [...history.present.objects, object], undefined, selection);
    setSelectedIds(selection);
    setSelectedNativeIds(new Set());
    setSelectedNativeId(undefined);
    setEditorState((state) => ({ ...state, activeTool: object.type === "ink" ? "pen" : "select" }));
    if (object.type === "note") setLeftTab("comments");
  }

  function queueNativeCanvasTargets(targets: Map<string, UnifiedCanvasBounds>): string[] {
    if (!currentNativePage || !targets.size) return [];
    const edits: NativeEdit[] = [];
    const blocked: string[] = [];
    for (const object of selectedNativeObjects) {
      const target = targets.get(`native:${object.id}`);
      if (!target) continue;
      const result = nativeGeometryEdit(object, canvasToNativeRect(clampCanvasBounds(target, currentNativePage.width, currentNativePage.height), currentNativePage), nativeEdits);
      if (result.edit) edits.push(result.edit); else if (result.blocked) blocked.push(`${nativeObjectLabel(object)}: ${result.blocked}`);
    }
    if (edits.length) queueNativeEdits(edits);
    return blocked;
  }

  function applyUnifiedBounds(targets: Map<string, UnifiedCanvasBounds>, label: string): void {
    if (!targets.size) return;
    const pageWidth = currentNativePage?.width ?? Math.abs(pageGeometry.x1 - pageGeometry.x0);
    const pageHeight = currentNativePage?.height ?? Math.abs(pageGeometry.y1 - pageGeometry.y0);
    let overlayChanged = false;
    const nextObjects = history.present.objects.map((object) => {
      if (!selectedIds.has(object.id)) return object;
      const target = targets.get(`editor:${object.id}`);
      if (!target) return object;
      overlayChanged = true;
      return { ...object, bounds: canvasToEditorRect(clampCanvasBounds(target, pageWidth, pageHeight), pageGeometry), modifiedAt: Date.now() };
    });
    const blocked = queueNativeCanvasTargets(targets);
    if (overlayChanged) commitObjects(label, nextObjects);
    if (blocked.length) setWarnings((current) => [...current, ...blocked]);
  }

  function scaledSelectionTargets(source: UnifiedCanvasBounds, target: UnifiedCanvasBounds): Map<string, UnifiedCanvasBounds> {
    const scaleX = source.w > .01 ? target.w / source.w : 1;
    const scaleY = source.h > .01 ? target.h / source.h : 1;
    return new Map(unifiedItems.filter((item) => item.resizable).map((item) => [item.key, {
      x: target.x + (item.bounds.x - source.x) * scaleX,
      y: target.y + (item.bounds.y - source.y) * scaleY,
      w: item.bounds.w * scaleX,
      h: item.bounds.h * scaleY
    }]));
  }

  function commitObject(label: string, object: EditorObject, mergeKey?: string): void {
    const previous = history.present.objects.find((item) => item.id === object.id);
    if (previous && selectedIds.has(object.id) && unifiedSelectionCount > 1 && (label === "Move object" || label === "Resize object")) {
      const source = editorLayoutItem(previous, pageGeometry).bounds;
      const target = editorLayoutItem(object, pageGeometry).bounds;
      if (label === "Move object") {
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const targets = new Map(unifiedItems.filter((item) => item.movable).map((item) => [item.key, moveBounds(item.bounds, dx, dy)]));
        applyUnifiedBounds(targets, label);
      } else applyUnifiedBounds(scaledSelectionTargets(source, target), label);
      return;
    }
    const objects = history.present.objects.map((item) => item.id === object.id ? object : item);
    commitObjects(label, objects, mergeKey);
  }

  function transformNativeObject(object: NativePageObject, bounds: NativeRect, mode: NativeTransformMode): void {
    if (!currentNativePage) return;
    const sourceItem = unifiedItems.find((item) => item.key === `native:${object.id}`) ?? nativeLayoutItem(object, currentNativePage, nativeEdits);
    const target = nativeRectToCanvas(bounds, currentNativePage);
    if (selectedNativeIds.has(object.id) && unifiedSelectionCount > 1) {
      if (mode === "move") {
        const dx = target.x - sourceItem.bounds.x;
        const dy = target.y - sourceItem.bounds.y;
        applyUnifiedBounds(new Map(unifiedItems.filter((item) => item.movable).map((item) => [item.key, moveBounds(item.bounds, dx, dy)])), "Move selection");
      } else applyUnifiedBounds(scaledSelectionTargets(sourceItem.bounds, target), "Resize selection");
      return;
    }
    applyUnifiedBounds(new Map([[sourceItem.key, target]]), mode === "move" ? "Move existing object" : "Resize existing object");
  }

  function nudgeUnified(dx: number, dy: number): void {
    const targets = new Map(unifiedItems.filter((item) => item.movable).map((item) => [item.key, moveBounds(item.bounds, dx, dy)]));
    applyUnifiedBounds(targets, "Nudge objects");
  }

  function alignUnified(mode: UnifiedAlign, target: "selection" | "page" = "selection"): void {
    if (!unifiedItems.length) return;
    const pageSize = target === "page" ? { width: currentNativePage?.width ?? Math.abs(pageGeometry.x1 - pageGeometry.x0), height: currentNativePage?.height ?? Math.abs(pageGeometry.y1 - pageGeometry.y0) } : undefined;
    applyUnifiedBounds(alignBounds(unifiedItems, mode, pageSize), `Align ${target} ${mode}`);
  }

  function distributeUnified(axis: UnifiedDistributionAxis): void {
    applyUnifiedBounds(distributeBounds(unifiedItems, axis), `Distribute ${axis}`);
  }

  function matchUnifiedSize(dimension: "width" | "height" | "both"): void {
    if (!primaryUnifiedKey) return;
    applyUnifiedBounds(matchSizeBounds(unifiedItems, primaryUnifiedKey, dimension), `Match ${dimension}`);
  }

  function rotateUnified(degrees: number): void {
    let overlayChanged = false;
    const rotatableOverlayIds = new Set(unifiedItems.filter((item) => item.source === "editor" && item.rotatable).map((item) => item.id));
    const nextObjects = updateObjects(history.present.objects, rotatableOverlayIds, (object) => { overlayChanged = true; return { ...object, rotation: object.rotation + degrees }; });
    const nativeIncoming: NativeEdit[] = [];
    const blocked: string[] = [];
    for (const object of selectedNativeObjects) {
      const result = nativeRotationEdit(object, degrees, nativeEdits);
      if (result.edit) nativeIncoming.push(result.edit); else if (result.blocked) blocked.push(`${nativeObjectLabel(object)}: ${result.blocked}`);
    }
    if (overlayChanged) commitObjects("Rotate objects", nextObjects);
    if (nativeIncoming.length) queueNativeEdits(nativeIncoming);
    if (blocked.length) setWarnings((current) => [...current, ...blocked]);
  }

  function undo(): void {
    setHistory((current) => {
      const next = undoHistory(current);
      setSelectedIds(new Set(next.present.selectedIds));
      return next;
    });
    setPreviewObject(null);
  }

  function redo(): void {
    setHistory((current) => {
      const next = redoHistory(current);
      setSelectedIds(new Set(next.present.selectedIds));
      return next;
    });
    setPreviewObject(null);
  }

  function deleteSelection(): void {
    let acted = false;
    if (selectedIds.size) {
      commitObjects("Delete objects", history.present.objects.filter((object) => !selectedIds.has(object.id)), undefined, new Set());
      acted = true;
    }
    const incoming: NativeEdit[] = [];
    const blocked: string[] = [];
    for (const object of selectedNativeObjects) {
      const result = nativeDeleteEdit(object, nativeEdits);
      if (result.edit) incoming.push(result.edit); else if (result.blocked) blocked.push(`${nativeObjectLabel(object)}: ${result.blocked}`);
    }
    if (incoming.length) { queueNativeEdits(incoming); acted = true; }
    if (blocked.length) setWarnings((current) => [...current, ...blocked]);
    if (acted) { setSelectedIds(new Set()); setSelectedNativeIds(new Set()); setSelectedNativeId(undefined); }
  }

  function duplicateSelection(): void {
    if (selectedNativeIds.size) setWarnings((current) => [...current, "Existing PDF objects cannot be duplicated safely. Only objects added in PDF Studio are duplicated."]);
    if (!selectedIds.size) return;
    const next = duplicateObjects(history.present.objects, selectedIds);
    const existing = new Set(history.present.objects.map((object) => object.id));
    const selection = new Set(next.filter((object) => !existing.has(object.id)).map((object) => object.id));
    commitObjects("Duplicate objects", next, undefined, selection);
    setSelectedIds(selection);
    setSelectedNativeIds(new Set());
    setSelectedNativeId(undefined);
  }

  function arrange(direction: "front" | "back"): void {
    if (selectedNativeIds.size) setWarnings((current) => [...current, "Bring to front and Send to back only reorder objects added in PDF Studio. Existing PDF content keeps its original painting order."]);
    if (!selectedIds.size) return;
    const ordered = history.present.objects.slice().sort((a, b) => a.zIndex - b.zIndex);
    const unselected = ordered.filter((object) => !selectedIds.has(object.id));
    const selected = ordered.filter((object) => selectedIds.has(object.id));
    const nextOrder = direction === "front" ? [...unselected, ...selected] : [...selected, ...unselected];
    commitObjects(direction === "front" ? "Bring to front" : "Send to back", nextOrder.map((object, index) => ({ ...object, zIndex: index + 1 })));
  }

  function groupSelection(): void {
    if (selectedIds.size < 2) return;
    const groupId = crypto.randomUUID();
    commitObjects("Group objects", updateObjects(history.present.objects, selectedIds, (object) => ({ ...object, groupId })));
  }

  function ungroupSelection(): void {
    if (!selectedIds.size) return;
    commitObjects("Ungroup objects", updateObjects(history.present.objects, selectedIds, (object) => ({ ...object, groupId: undefined })));
  }

  async function copySelection(): Promise<void> {
    if (selectedNativeIds.size) setWarnings((current) => [...current, "Existing PDF objects cannot be copied as independent objects. Objects added in PDF Studio are copied normally."]);
    const copied = history.present.objects.filter((object) => selectedIds.has(object.id));
    if (!copied.length) return;
    internalClipboardRef.current = cloneObjects(copied);
    try { await navigator.clipboard.writeText(JSON.stringify({ format: "local-pdf-studio/editor-objects", version: 1, objects: copied })); } catch { /* Internal clipboard remains available. */ }
    setStatus(`${copied.length} object${copied.length === 1 ? "" : "s"} copied`);
  }

  async function pasteSelection(): Promise<void> {
    let copied = internalClipboardRef.current;
    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text) as { format?: string; objects?: EditorObject[] };
      if (parsed.format === "local-pdf-studio/editor-objects" && Array.isArray(parsed.objects)) copied = parsed.objects;
    } catch { /* Use internal clipboard. */ }
    if (!copied.length) return;
    const available = copied.filter((object) => object.type !== "image" || assetUrls.has(object.assetId));
    if (available.length !== copied.length) setWarnings((current) => [...current, "Image objects from another project were skipped because their local binary assets were unavailable."]);
    copied = available;
    if (!copied.length) return;
    const now = Date.now();
    const highest = Math.max(0, ...history.present.objects.map((object) => object.zIndex));
    const groupIds = new Map<string, string>();
    const pasted = copied.map((object, index) => {
      const groupId = object.groupId ? groupIds.get(object.groupId) ?? (() => { const value = crypto.randomUUID(); groupIds.set(object.groupId as string, value); return value; })() : undefined;
      return { ...structuredClone(object), id: crypto.randomUUID(), groupId, pageNumber: editorState.currentPage, bounds: moveRect(object.bounds, 16, -16), zIndex: highest + index + 1, createdAt: now, modifiedAt: now };
    });
    const selection = new Set(pasted.map((object) => object.id));
    commitObjects("Paste objects", [...history.present.objects, ...pasted], undefined, selection);
    setSelectedIds(selection);
    setSelectedNativeIds(new Set());
    setSelectedNativeId(undefined);
  }

  async function importImage(file: File): Promise<void> {
    if (!project || !file.type.startsWith("image/")) { setError("Select a supported image file."); return; }
    try {
      const bytes = await file.arrayBuffer();
      const dimensions = await readImageDimensions(file);
      const assetId = crypto.randomUUID();
      const asset: EditorAssetRecord = { id: assetId, projectId, name: file.name, mimeType: file.type, width: dimensions.width, height: dimensions.height, byteLength: bytes.byteLength, bytes, createdAt: Date.now() };
      await writeEditorAsset(asset);
      const url = URL.createObjectURL(new Blob([bytes.slice(0)], { type: file.type }));
      objectUrlsRef.current.set(assetId, url);
      setAssetUrls((current) => new Map(current).set(assetId, url));
      const availableWidth = Math.max(50, pageGeometry.x1 - pageGeometry.x0 - 40);
      const availableHeight = Math.max(50, pageGeometry.y1 - pageGeometry.y0 - 40);
      const scale = Math.min(1, 260 / dimensions.width, availableWidth / dimensions.width, availableHeight / dimensions.height);
      const width = Math.max(24, dimensions.width * scale);
      const height = Math.max(24, dimensions.height * scale);
      const centerX = (pageGeometry.x0 + pageGeometry.x1) / 2;
      const centerY = (pageGeometry.y0 + pageGeometry.y1) / 2;
      const now = Date.now();
      const object: ImageEditorObject = { id: crypto.randomUUID(), type: "image", pageNumber: editorState.currentPage, bounds: { x0: centerX - width / 2, y0: centerY - height / 2, x1: centerX + width / 2, y1: centerY + height / 2 }, rotation: 0, opacity: 1, zIndex: Math.max(0, ...history.present.objects.map((item) => item.zIndex)) + 1, locked: false, hidden: false, createdAt: now, modifiedAt: now, assetId, name: file.name, mimeType: file.type, intrinsicWidth: dimensions.width, intrinsicHeight: dimensions.height, preserveAspectRatio: true, altText: "" };
      addObject(object);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function exportPdf(saveProject: boolean): Promise<void> {
    if (!project || !sourceBytesRef.current) return;
    const sourceBytes = sourceBytesRef.current;
    setProcessing(true); setError(null); setWarnings([]); setLastReport(null); setStatus("Compiling editor objects…");
    const controller = new AbortController(); abortRef.current = controller;
    try {
      await runProjectOperation(project.id, { label: saveProject ? "Saving edited PDF" : "Exporting edited PDF", signal: controller.signal, reserveBytes: saveProject ? project.byteLength : undefined }, async ({ signal, update }) => {
      update({ detail: "Compiling editor objects…", progress: 0.05 });
      const visibleObjects = history.present.objects.filter((object) => !object.hidden);
      const affectedPages = new Set([...visibleObjects.map((object) => object.pageNumber), ...nativeEdits.map((edit) => edit.pageNumber)]);
      const assetIds = new Set(visibleObjects.filter((object): object is ImageEditorObject => object.type === "image").map((object) => object.assetId));
      const assetRecords = (await listEditorAssets(projectId)).filter((asset) => assetIds.has(asset.id));
      const assets: EditorExportAsset[] = assetRecords.map((asset) => ({ id: asset.id, mimeType: asset.mimeType, bytes: asset.bytes.slice(0) }));
      const beforeInventory = await inspectPdfAnnotationInventory(sourceBytes, passwordRef.current, affectedPages);
      let workingBytes = sourceBytes;
      let nativeReport: Awaited<ReturnType<typeof applyNativeEdits>>["report"] | undefined;
      if (nativeEdits.length) {
        setStatus(`Applying ${nativeEdits.length} existing-content edits…`);
        const nativeResult = await applyNativeEdits(workingBytes, nativeEdits, passwordRef.current, signal);
        workingBytes = nativeResult.bytes;
        nativeReport = nativeResult.report;
      }
      const result = visibleObjects.length
        ? await exportEditorPdf(workingBytes, history.present.objects, assets, signal, passwordRef.current)
        : { bytes: workingBytes, report: { objectCount: 0, annotationCount: 0, linkCount: 0, imageCount: 0, pageCount: document?.numPages ?? 0, outputBytes: workingBytes.byteLength, durationMs: 0, warnings: [] } };
      setStatus("Validating unified edited PDF…");
      update({ stage: "validating", detail: "Reopening and validating edited output…", progress: 0.82 });
      const [summary, afterInventory] = await Promise.all([
        inspectPdfBytes(result.bytes, passwordRef.current),
        inspectPdfAnnotationInventory(result.bytes, passwordRef.current, affectedPages)
      ]);
      if (summary.pageCount !== document?.numPages) throw new Error(`Validation failed: expected ${document?.numPages} pages, received ${summary.pageCount}.`);
      const annotationDelta = afterInventory.annotationCount - beforeInventory.annotationCount;
      const linkDelta = afterInventory.linkCount - beforeInventory.linkCount;
      if (annotationDelta < result.report.annotationCount) throw new Error(`Validation failed: ${result.report.annotationCount} annotations were compiled, but only ${Math.max(0, annotationDelta)} additional annotations reopened.`);
      if (linkDelta < result.report.linkCount) throw new Error(`Validation failed: ${result.report.linkCount} links were compiled, but only ${Math.max(0, linkDelta)} additional links reopened.`);
      setWarnings([...(nativeReport?.warnings ?? []), ...result.report.warnings]);
      const nativeSummary = nativeReport ? `${nativeReport.textEdits} text · ${nativeReport.imageEdits} image · ${nativeReport.vectorEdits} vector · ${nativeReport.tableCellEdits} table cells · ${nativeReport.formEdits} forms` : "0 existing-content edits";
      setLastReport(`${nativeSummary} · ${result.report.objectCount} overlay objects · ${formatBytes(result.report.outputBytes)}`);
      const filename = `${safeName(project.name)}_edited.pdf`;
      if (saveProject) {
        update({ stage: "committing", detail: "Saving a new project revision…", progress: 0.94 });
        const created = await createDerivedProjectFromBytes(project.id, result.bytes, filename, "unified-editor", "application/pdf", passwordRef.current);
        await Promise.all([
          writeEditorState({ ...editorState, projectId: created.id, objects: [], dirty: false, lastSavedAt: Date.now(), updatedAt: Date.now() }),
          writeNativeState({ projectId: created.id, schemaVersion: NATIVE_EDITOR_SCHEMA_VERSION, pageNumber: editorState.currentPage, queuedEdits: [], updatedAt: Date.now() })
        ]);
        window.location.hash = routeHref({ name: "viewer", projectId: created.id }).slice(1);
      } else {
        downloadBlob(new Blob([toOwnedArrayBuffer(result.bytes)], { type: "application/pdf" }), filename);
        const cleanState = { ...editorState, objects: cloneObjects(history.present.objects), dirty: false, lastSavedAt: Date.now(), updatedAt: Date.now() };
        await writeEditorState(cleanState);
        await updateProject({ ...project, recovery: { ...project.recovery, dirty: false, lastValidSnapshotAt: Date.now() } });
        setEditorState(cleanState);
        setStatus("Export validated and downloaded");
      }
      update({ progress: 1 });
      });
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("Ready");
    } finally { setProcessing(false); abortRef.current = null; }
  }

  function retryLocalSave(): void {
    const latest = latestLocalSaveRef.current;
    if (!latest) return;
    const revision = ++localSaveRevisionRef.current;
    const now = Date.now();
    const snapshot: LocalSaveSnapshot = {
      editor: { ...latest.snapshot.editor, updatedAt: now },
      native: { ...latest.snapshot.native, updatedAt: now },
      project: latest.snapshot.project
    };
    latestLocalSaveRef.current = { revision, snapshot };
    setLocalSave({ phase: "pending", revision });
    enqueueLocalSave(revision, snapshot);
  }

  async function retryPassword(): Promise<void> {
    if (!project || !sourceBytesRef.current || !password) return;
    try { await openDocument(project, sourceBytesRef.current, password); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  const activeTool = tools.find((tool) => tool.id === editorState.activeTool) ?? tools[0];
  const localSaveLabel = localSaveStatusLabel(localSave, lastReport, Boolean(editorState.dirty || nativeEdits.length));
  const chooseMobileTool = (tool: EditorTool) => {
    activateTool(tool);
    setMobileToolsOpen(false);
  };

  if (!project) return <div className="viewer-loading"><span className="spinner" /><strong>{error ?? status}</strong></div>;
  if (!document) return <div className="editor-app"><div className="viewer-loading"><span className="spinner" /><strong>{status}</strong></div>{passwordRequired ? <PasswordDialog error={error} password={password} onChange={setPassword} onSubmit={() => void retryPassword()} projectId={projectId} /> : null}</div>;

  return (
    <div className="editor-app">
      <header className="editor-commandbar">
        <div className="editor-file-group"><a aria-label="Back to viewer" className="icon-button" href={routeHref({ name: "viewer", projectId })}><Icon name="arrow-left" /></a><div><strong>{project.name}</strong><span>{status} · {nativeInspection ? `${nativeInspection.totals.text + nativeInspection.totals.images + nativeInspection.totals.vectors + nativeInspection.totals.tables + nativeInspection.totals.forms} PDF + ` : ""}{history.present.objects.length} overlay objects</span></div></div>
        <div className="editor-commandbar__center">
          <button aria-label="Undo" disabled={!history.past.length || processing} onClick={undo} title="Undo added-object change" type="button"><Icon name="undo" /></button><button aria-label="Redo" disabled={!history.future.length || processing} onClick={redo} title="Redo added-object change" type="button"><Icon name="redo" /></button><span />
          <button aria-label="Previous page" disabled={editorState.currentPage <= 1} onClick={() => setEditorState((state) => ({ ...state, currentPage: state.currentPage - 1 }))} type="button"><Icon name="chevron-left" /></button><label><input aria-label="Current page" max={document.numPages} min="1" onChange={(event) => setEditorState((state) => ({ ...state, currentPage: Math.max(1, Math.min(document.numPages, Number(event.target.value))) }))} type="number" value={editorState.currentPage} /><span>/ {document.numPages}</span></label><button aria-label="Next page" disabled={editorState.currentPage >= document.numPages} onClick={() => setEditorState((state) => ({ ...state, currentPage: state.currentPage + 1 }))} type="button"><Icon name="chevron-right" /></button><span />
          <button aria-label="Zoom out" onClick={() => setEditorState((state) => ({ ...state, zoom: Math.max(.5, state.zoom - .25) }))} type="button"><Icon name="minus" /></button><select aria-label="Zoom" onChange={(event) => setEditorState((state) => ({ ...state, zoom: Number(event.target.value) }))} value={editorState.zoom}><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select><button aria-label="Zoom in" onClick={() => setEditorState((state) => ({ ...state, zoom: Math.min(3, state.zoom + .25) }))} type="button"><Icon name="plus" /></button>
        </div>
        <div className="editor-commandbar__actions"><button className="button button--ghost button--small" disabled={!changeCount || processing} onClick={() => void exportPdf(false)} type="button">Download PDF</button><button className="button button--small" disabled={!changeCount || processing} onClick={() => void exportPdf(true)} type="button">Save as project</button>{processing ? <button className="button button--danger-ghost button--small" onClick={() => abortRef.current?.abort()} type="button">Cancel</button> : null}</div>
      </header>

      <div className="editor-contextbar">
        <button onClick={() => { const next = !sidebarOpen; setSidebarOpen(next); if (next && isCompactViewport()) setPropertiesOpen(false); }} type="button">{sidebarOpen ? "Hide sidebar" : "Pages / layers"}</button>
        <button onClick={() => { const next = !propertiesOpen; setPropertiesOpen(next); if (next && isCompactViewport()) setSidebarOpen(false); }} type="button">{propertiesOpen ? "Hide properties" : "Properties"}</button>
        <span />
        <label className="editor-toggle"><input checked={editorState.snapEnabled} onChange={(event) => setEditorState((state) => ({ ...state, snapEnabled: event.target.checked }))} type="checkbox" />Snap</label>
        <label className="editor-grid-size">Grid <input min="1" max="72" onChange={(event) => setEditorState((state) => ({ ...state, gridSize: Math.max(1, Number(event.target.value)) }))} type="number" value={editorState.gridSize} /></label>
        <label className="editor-toggle"><input checked={showNativeContent} disabled={!nativeInspection || nativeInspecting} onChange={(event) => setShowNativeContent(event.target.checked)} type="checkbox" />PDF content</label>
        {nativeEdits.length ? <span className="native-queued-count">{nativeEdits.length} existing-content edit{nativeEdits.length === 1 ? "" : "s"} queued</span> : null}
        {unifiedSelectionCount > 1 ? <><span className="p6-selection-count">{unifiedSelectionCount} selected</span>{selectedIds.size > 1 ? <><button onClick={groupSelection} type="button">Group added</button><button onClick={ungroupSelection} type="button">Ungroup</button></> : null}<button onClick={() => alignUnified("left")} type="button">Align left</button><button onClick={() => alignUnified("center")} type="button">Center</button><button onClick={() => alignUnified("right")} type="button">Align right</button><button onClick={() => alignUnified("top")} type="button">Top</button><button onClick={() => alignUnified("middle")} type="button">Middle</button><button onClick={() => alignUnified("bottom")} type="button">Bottom</button>{unifiedSelectionCount > 2 ? <><button onClick={() => distributeUnified("horizontal")} type="button">Distribute H</button><button onClick={() => distributeUnified("vertical")} type="button">Distribute V</button></> : null}</> : null}
        <strong aria-live="polite">{localSaveLabel}</strong>
      </div>

      <div className="editor-notices">
        {localSave.phase === "error" ? <div className="editor-banner error-banner" role="alert"><strong>Local autosave failed</strong><span>{localSave.message}</span><button onClick={retryLocalSave} type="button">Retry save</button></div> : null}
        {error ? <div className="editor-banner error-banner"><strong>Editor error</strong><span>{error}</span><button onClick={() => setError(null)} type="button">Dismiss</button></div> : null}
        {warnings.length ? <div className="editor-banner warning-banner"><strong>Editor report</strong><span>{warnings.join(" ")}</span><button onClick={() => setWarnings([])} type="button">Dismiss</button></div> : null}
        {redactionCount ? <div className="editor-banner warning-banner" role="status"><strong>Redaction marks are not permanent yet</strong><span>{redactionCount} marked region{redactionCount === 1 ? "" : "s"}. Open Forms & Protect and choose Apply redactions to permanently remove the covered content.</span></div> : null}
      </div>

      <div className={`editor-layout${sidebarOpen ? "" : " editor-layout--no-sidebar"}${propertiesOpen ? "" : " editor-layout--no-properties"}`}>
        <nav className="editor-toolrail" aria-label="Editor tools">{toolGroups.map((group) => <section className="editor-tool-group" aria-label={group.label} key={group.label}><strong>{group.label}</strong>{group.tools.map((tool) => <button aria-label={tool.label} className={editorState.activeTool === tool.id ? "active" : ""} key={tool.id} onClick={() => activateTool(tool.id)} title={`${tool.label}${tool.key ? ` (${tool.key})` : ""}`} type="button"><Icon name={tool.icon} /><small>{tool.label}</small></button>)}</section>)}<input accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importImage(file); event.target.value = ""; }} ref={imageInputRef} type="file" /></nav>
        {(sidebarOpen || propertiesOpen) ? <button aria-label="Close editor panel" className="editor-mobile-backdrop" onClick={() => { setSidebarOpen(false); setPropertiesOpen(false); }} type="button" /> : null}

        {sidebarOpen ? <aside className="editor-left-panel"><div className="editor-left-tabs">{(["pages", "layers", "comments"] as LeftTab[]).map((tab) => <button className={leftTab === tab ? "active" : ""} key={tab} onClick={() => setLeftTab(tab)} type="button">{tab}</button>)}</div><div className="editor-left-body">{leftTab === "pages" ? <div className="thumbnail-list">{Array.from({ length: document.numPages }, (_, index) => <Thumbnail document={document} key={index + 1} onSelect={(pageNumber) => { setSelectedIds(new Set()); setSelectedNativeIds(new Set()); setSelectedNativeId(undefined); setEditorState((state) => ({ ...state, currentPage: pageNumber })); }} pageNumber={index + 1} selected={editorState.currentPage === index + 1} />)}</div> : null}{leftTab === "layers" ? <LayerList nativeObjects={currentNativeObjects} nativeQueued={nativeEdits} objects={currentPageObjects} selectedIds={selectedIds} selectedNativeIds={selectedNativeIds} onSelect={selectObject} onSelectNative={selectNativeObject} onToggleHidden={(object) => commitObject(object.hidden ? "Show object" : "Hide object", { ...object, hidden: !object.hidden })} /> : null}{leftTab === "comments" ? <CommentList comments={comments} onSelect={(comment) => { setSelectedNativeIds(new Set()); setSelectedNativeId(undefined); setEditorState((state) => ({ ...state, currentPage: comment.pageNumber, activeTool: "select" })); setSelectedIds(new Set([comment.id])); }} /> : null}</div></aside> : null}

        <main className="editor-stage"><EditorCanvasPage activeTool={editorState.activeTool} assetUrls={assetUrls} author={editorState.author} document={document} gridSize={editorState.gridSize} nativeEffectiveBounds={nativeEffectiveBounds} nativeObjects={currentNativeObjects} nativeOrigin={currentNativePage ? { x: currentNativePage.originX, y: currentNativePage.originY } : undefined} nativeTransformableIds={nativeTransformableIds} objects={displayObjects} onCommit={commitObject} onCreate={addObject} onEditText={(object) => { setSelectedNativeIds(new Set()); setSelectedNativeId(undefined); setSelectedIds(new Set([object.id])); if (isCompactViewport()) setSidebarOpen(false); setPropertiesOpen(true); }} onPageGeometry={setPageGeometry} onPreview={setPreviewObject} onSelect={selectObject} onSelectNative={selectNativeObject} onTransformNative={transformNativeObject} pageNumber={editorState.currentPage} selectedIds={selectedIds} selectedNativeId={selectedNativeId} selectedNativeIds={selectedNativeIds} showNativeContent={showNativeContent} snapEnabled={editorState.snapEnabled} zoom={editorState.zoom} /></main>

        {propertiesOpen ? unifiedSelectionCount > 1 ? <UnifiedLayoutPropertiesPanel items={unifiedItems} nativeCount={selectedNativeIds.size} onAlign={alignUnified} onDelete={deleteSelection} onDistribute={distributeUnified} onDuplicateOverlays={duplicateSelection} onGroupOverlays={groupSelection} onMatchSize={matchUnifiedSize} onRotate={rotateUnified} onUngroupOverlays={ungroupSelection} overlayCount={selectedIds.size} primaryKey={primaryUnifiedKey} /> : selectedNativeObject ? <NativeContentPropertiesPanel object={selectedNativeObject} onQueue={queueNativeEdits} onRemove={removeNativeEdits} queuedEdits={nativeEdits} /> : <EditorPropertiesPanel onBringFront={() => arrange("front")} onChange={commitObject} onDelete={deleteSelection} onDuplicate={duplicateSelection} onSendBack={() => arrange("back")} selected={selectedObjects} /> : null}
      </div>
      <nav className="editor-mobile-toolbar" aria-label="Editor quick tools">
        {tools.slice(0, 4).map((tool) => <button aria-label={tool.label} className={editorState.activeTool === tool.id ? "active" : ""} key={tool.id} onClick={() => activateTool(tool.id)} type="button"><Icon name={tool.icon} /><small>{tool.label}</small></button>)}
        <button aria-expanded={mobileToolsOpen} aria-haspopup="dialog" aria-label={`Tools, active tool: ${activeTool.label}`} className="editor-mobile-toolbar__all" onClick={() => setMobileToolsOpen(true)} ref={mobileToolsTriggerRef} type="button"><Icon name={activeTool.icon} /><small>Tools</small></button>
      </nav>
      {mobileToolsOpen ? <div className="editor-tools-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeMobileTools(); }}>
        <div aria-label="Editor tools" aria-modal="true" className="editor-tools-sheet" ref={mobileToolsRef} role="dialog">
          <div className="editor-tools-sheet__handle" />
          <header><div><span>Editing tool</span><h2>{activeTool.label}</h2></div><button aria-label="Close tools" onClick={closeMobileTools} type="button"><Icon name="close" /></button></header>
          <div className="editor-tools-sheet__groups">{toolGroups.map((group) => <section key={group.label}><h3>{group.label}</h3><div>{group.tools.map((tool) => <button aria-pressed={editorState.activeTool === tool.id} className={editorState.activeTool === tool.id ? "active" : ""} key={tool.id} onClick={() => chooseMobileTool(tool.id)} type="button"><Icon name={tool.icon} /><span>{tool.label}</span>{tool.key ? <kbd>{tool.key}</kbd> : null}</button>)}</div></section>)}</div>
          <section className="editor-tools-sheet__document"><h3>Document</h3><div className="editor-tools-sheet__zoom"><button aria-label="Zoom out" onClick={() => setEditorState((state) => ({ ...state, zoom: Math.max(.5, state.zoom - .25) }))} type="button"><Icon name="minus" /></button><strong>{Math.round(editorState.zoom * 100)}%</strong><button aria-label="Zoom in" onClick={() => setEditorState((state) => ({ ...state, zoom: Math.min(3, state.zoom + .25) }))} type="button"><Icon name="plus" /></button></div><button aria-pressed={editorState.snapEnabled} onClick={() => setEditorState((state) => ({ ...state, snapEnabled: !state.snapEnabled }))} type="button">Snap {editorState.snapEnabled ? "on" : "off"}</button></section>
          <div className="editor-tools-sheet__actions"><button disabled={!changeCount || processing} onClick={() => { closeMobileTools(); void exportPdf(false); }} type="button"><Icon name="download" />Download PDF</button><button disabled={!changeCount || processing} onClick={() => { closeMobileTools(); void exportPdf(true); }} type="button"><Icon name="save" />Save as project</button></div>
        </div>
      </div> : null}
    </div>
  );
}

async function persistLocalSaveSnapshot(snapshot: LocalSaveSnapshot): Promise<void> {
  await writeEditorState(snapshot.editor);
  await writeNativeState(snapshot.native);
  await updateProject(snapshot.project);
}

function LayerList({ objects, nativeObjects, nativeQueued, selectedIds, selectedNativeIds, onSelect, onSelectNative, onToggleHidden }: { objects: EditorObject[]; nativeObjects: NativePageObject[]; nativeQueued: NativeEdit[]; selectedIds: Set<string>; selectedNativeIds: Set<string>; onSelect: (id: string, additive: boolean) => void; onSelectNative: (object: NativePageObject, additive?: boolean) => void; onToggleHidden: (object: EditorObject) => void }) {
  if (!objects.length && !nativeObjects.length) return <div className="editor-panel-empty"><strong>No editable objects detected</strong><p>Add an overlay object or inspect another page.</p></div>;
  return <div className="editor-layer-list unified-layer-list">
    {nativeObjects.length ? <><div className="editor-layer-heading"><strong>Existing PDF content</strong><span>{nativeObjects.length}</span></div>{nativeObjects.map((object) => { const queued = nativeQueued.filter((edit) => edit.objectId === object.id).length; return <div className={selectedNativeIds.has(object.id) ? "editor-layer-item native-layer-item active" : "editor-layer-item native-layer-item"} key={object.id}><button onClick={(event) => onSelectNative(object, event.ctrlKey || event.metaKey || event.shiftKey)} type="button"><span>{nativeObjectIcon(object)}</span><div><strong>{nativeObjectLabel(object)}</strong><small>{object.capability.label} · {Math.round(object.capability.confidence * 100)}%{queued ? ` · ${queued} queued` : ""}</small></div></button></div>; })}</> : null}
    {objects.length ? <><div className="editor-layer-heading"><strong>Overlay objects</strong><span>{objects.length}</span></div>{objects.slice().sort((a, b) => b.zIndex - a.zIndex).map((object) => <div className={selectedIds.has(object.id) ? "editor-layer-item active" : "editor-layer-item"} key={object.id}><button onClick={(event) => onSelect(object.id, event.ctrlKey || event.metaKey || event.shiftKey)} type="button"><span>{objectIcon(object)}</span><div><strong>{objectLabel(object)}</strong><small>{object.type} · z{object.zIndex}</small></div></button><button onClick={() => onToggleHidden(object)} title={object.hidden ? "Show" : "Hide"} type="button">{object.hidden ? "○" : "●"}</button></div>)}</> : null}
  </div>;
}

function nativeObjectIcon(object: NativePageObject): string { return object.type === "text" ? "T" : object.type === "image" ? "▧" : object.type === "vector" ? "◇" : object.type === "table" ? "▦" : "⌑"; }

function CommentList({ comments, onSelect }: { comments: Array<Extract<EditorObject, { type: "note" }>>; onSelect: (comment: Extract<EditorObject, { type: "note" }>) => void }) {
  if (!comments.length) return <div className="editor-panel-empty"><strong>No comments</strong><p>Use the Comment tool to place review notes.</p></div>;
  return <div className="editor-comment-list">{comments.map((comment) => <button className={comment.resolved ? "resolved" : ""} key={comment.id} onClick={() => onSelect(comment)} type="button"><span style={{ background: comment.color }} /><div><strong>{comment.subject || "Comment"}</strong><p>{comment.contents}</p><small>Page {comment.pageNumber} · {comment.author}</small></div></button>)}</div>;
}

function PasswordDialog({ error, password, onChange, onSubmit, projectId }: { error: string | null; password: string; onChange: (value: string) => void; onSubmit: () => void; projectId: string }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const close = useCallback(() => { window.location.hash = routeHref({ name: "viewer", projectId }).slice(1); }, [projectId]);
  useModalFocus(true, dialogRef, close, inputRef);
  return <div className="viewer-password-overlay" role="presentation"><div aria-describedby="editor-password-description" aria-labelledby="editor-password-title" aria-modal="true" className="viewer-password-dialog" ref={dialogRef} role="dialog"><p className="eyebrow">Protected document</p><h2 id="editor-password-title">Password required</h2><p id="editor-password-description">The password remains in memory and is passed only to the local PDF engines.</p><label className="visually-hidden" htmlFor="editor-password-input">PDF password</label><input autoComplete="off" id="editor-password-input" onChange={(event) => onChange(event.target.value)} placeholder="PDF password" ref={inputRef} type="password" value={password} /><button className="button" disabled={!password} onClick={onSubmit} type="button">Open editor</button><a className="button button--ghost" href={routeHref({ name: "viewer", projectId })}>Return to viewer</a>{error ? <span aria-live="assertive" className="selection-help selection-help--error" role="alert">{error}</span> : null}</div></div>;
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    try { return { width: bitmap.width, height: bitmap.height }; } finally { bitmap.close(); }
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The image could not be decoded.")); };
    image.src = url;
  });
}

function objectIcon(object: EditorObject): string { return object.type === "text" ? "T" : object.type === "image" ? "▧" : object.type === "shape" ? "□" : object.type === "ink" ? "✎" : object.type === "highlight" ? "▰" : object.type === "note" ? "●" : object.type === "link" ? "↗" : object.type === "signature" ? "✒" : object.type === "redaction" ? "■" : "印"; }
function objectLabel(object: EditorObject): string { if (object.type === "text") return object.text.slice(0, 28) || "Text"; if (object.type === "image") return object.name; if (object.type === "note") return object.subject || "Comment"; if (object.type === "stamp") return object.label; if (object.type === "signature") return object.signerName || "Visual signature"; if (object.type === "redaction") return object.overlayText || "Redaction mark"; if (object.type === "link") return object.target || "Link"; return object.type === "shape" ? object.shape : object.type; }
function isCompactViewport(): boolean { return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 760px)").matches : false; }
function safeName(value: string): string { return value.replace(/[\\/:*?"<>|]+/g, "-").trim() || "document"; }
function formatBytes(value: number): string { return value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }
