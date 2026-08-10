import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { routeHref } from "../core/appRouter";
import { useModalFocus } from "../accessibility/modalFocus";
import type { Rect } from "../core/coordinates";
import { openPdfWithPdfJs, inspectPdfAnnotationInventory, inspectPdfBytes } from "../engines/pdfjs";
import { EditorCanvasPage } from "../editor/components/EditorCanvasPage";
import { EditorPropertiesPanel } from "../editor/components/EditorPropertiesPanel";
import { createHistory, commitHistory, redoHistory, undoHistory } from "../editor/editorHistory";
import { cloneObjects, createEditorState, duplicateObjects, moveRect, updateObjects } from "../editor/editorModel";
import { listEditorAssets, readEditorState, writeEditorAsset, writeEditorState } from "../editor/editorRepository";
import { exportEditorPdf } from "../editor/editorExportClient";
import { NativeContentPropertiesPanel } from "../editor/native/NativeContentPropertiesPanel";
import { nativeObjectLabel } from "../editor/native/NativeContentOverlay";
import { applyNativeEdits, inspectNativePdf } from "../native/nativeClient";
import { discardNativeObjectEdits, mergeNativeEdits } from "../native/nativeEditQueue";
import { readNativeState, writeNativeState } from "../native/nativeRepository";
import { downloadBlob } from "../projects/download";
import { createDerivedProjectFromBytes, getProject, loadProjectBytes, updateProject } from "../projects/projectRepository";
import { runProjectOperation } from "../operations/projectOperationCoordinator";
import type { EditorAssetRecord, EditorDocumentState, EditorExportAsset, EditorHistoryState, EditorObject, EditorTool, ImageEditorObject } from "../types/editor";
import type { ProjectManifest } from "../types/project";
import { NATIVE_EDITOR_SCHEMA_VERSION, type NativeEdit, type NativeInspection, type NativePageObject } from "../types/nativeEditor";
import { Thumbnail } from "../viewer/Thumbnail";

interface Props { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }
type LeftTab = "pages" | "layers" | "comments";

const toolGroups: Array<{ label: string; tools: Array<{ id: EditorTool; label: string; key?: string; icon: string }> }> = [
  { label: "Navigate", tools: [
    { id: "select", label: "Select", key: "V", icon: "↖" },
    { id: "hand", label: "Pan", key: "H", icon: "✋" }
  ] },
  { label: "Insert", tools: [
    { id: "text", label: "Text", key: "T", icon: "T" },
    { id: "image", label: "Image", key: "I", icon: "▧" },
    { id: "link", label: "Link", icon: "↗" },
    { id: "signature", label: "Signature", icon: "✒" },
    { id: "stamp", label: "Stamp", icon: "印" }
  ] },
  { label: "Shapes", tools: [
    { id: "rectangle", label: "Rectangle", key: "R", icon: "□" },
    { id: "ellipse", label: "Ellipse", key: "E", icon: "○" },
    { id: "line", label: "Line", key: "L", icon: "／" },
    { id: "arrow", label: "Arrow", key: "A", icon: "↗" }
  ] },
  { label: "Markup", tools: [
    { id: "highlight", label: "Highlight", key: "K", icon: "▰" },
    { id: "underline", label: "Underline", icon: "U̲" },
    { id: "strikeout", label: "Strikeout", icon: "S̶" },
    { id: "squiggly", label: "Squiggly", icon: "≋" }
  ] },
  { label: "Review", tools: [
    { id: "pen", label: "Draw", key: "P", icon: "✎" },
    { id: "note", label: "Comment", key: "C", icon: "●" }
  ] },
  { label: "Redaction", tools: [
    { id: "redaction", label: "Mark redaction", key: "X", icon: "■" }
  ] }
];
const tools = toolGroups.flatMap((group) => group.tools);

export function EditorPage({ projectId, onTitleChange }: Props) {
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const sourceBytesRef = useRef<Uint8Array | null>(null);
  const passwordRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const internalClipboardRef = useRef<EditorObject[]>([]);
  const objectUrlsRef = useRef<Map<string, string>>(new Map());
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
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [lastReport, setLastReport] = useState<string | null>(null);
  const [nativeInspection, setNativeInspection] = useState<NativeInspection | null>(null);
  const [nativeEdits, setNativeEdits] = useState<NativeEdit[]>([]);
  const [selectedNativeId, setSelectedNativeId] = useState<string | undefined>();
  const [showNativeContent, setShowNativeContent] = useState(true);
  const [nativeInspecting, setNativeInspecting] = useState(false);

  const displayObjects = useMemo(() => {
    const base = history.present.objects;
    if (!previewObject) return base;
    const found = base.some((object) => object.id === previewObject.id);
    return found ? base.map((object) => object.id === previewObject.id ? previewObject : object) : [...base, previewObject];
  }, [history.present.objects, previewObject]);
  const selectedObjects = useMemo(() => displayObjects.filter((object) => selectedIds.has(object.id)), [displayObjects, selectedIds]);
  const currentPageObjects = useMemo(() => displayObjects.filter((object) => object.pageNumber === editorState.currentPage), [displayObjects, editorState.currentPage]);
  const comments = useMemo(() => displayObjects.filter((object): object is Extract<EditorObject, { type: "note" }> => object.type === "note"), [displayObjects]);
  const redactionCount = useMemo(() => displayObjects.filter((object) => object.type === "redaction").length, [displayObjects]);
  const currentNativePage = useMemo(() => nativeInspection?.pages.find((page) => page.pageNumber === editorState.currentPage), [nativeInspection, editorState.currentPage]);
  const currentNativeObjects = currentNativePage?.objects ?? [];
  const selectedNativeObject = useMemo(() => nativeInspection?.pages.flatMap((page) => page.objects).find((object) => object.id === selectedNativeId), [nativeInspection, selectedNativeId]);
  const changeCount = history.present.objects.length + nativeEdits.length;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const manifest = await getProject(projectId);
        if (!manifest) throw new Error("Project not found.");
        const [bytes, storedState, assets, storedNativeState] = await Promise.all([loadProjectBytes(manifest), readEditorState(projectId), listEditorAssets(projectId), readNativeState(projectId)]);
        if (cancelled) return;
        setProject(manifest);
        sourceBytesRef.current = bytes;
        setEditorState({ ...storedState, currentPage: Math.max(1, Math.min(manifest.summary.pageCount, storedState.currentPage)) });
        setHistory(createHistory(storedState.objects));
        setNativeEdits(storedNativeState.queuedEdits);
        createAssetUrls(assets);
        await openDocument(manifest, bytes);
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Failed"); }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      passwordRef.current = undefined;
      sourceBytesRef.current = null;
      const current = documentRef.current;
      documentRef.current = null;
      if (current) void current.destroy();
      for (const url of objectUrlsRef.current.values()) URL.revokeObjectURL(url);
      objectUrlsRef.current.clear();
    };
  }, [projectId]);

  useEffect(() => {
    if (!project || !document) return;
    const timer = window.setTimeout(() => {
      const state: EditorDocumentState = { ...editorState, objects: cloneObjects(history.present.objects), updatedAt: Date.now() };
      void Promise.all([
        writeEditorState(state),
        writeNativeState({ projectId, schemaVersion: NATIVE_EDITOR_SCHEMA_VERSION, pageNumber: editorState.currentPage, queuedEdits: nativeEdits, updatedAt: Date.now() }),
        updateProject({ ...project, recovery: { ...project.recovery, dirty: state.dirty || nativeEdits.length > 0 } })
      ]).catch(() => undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [document, editorState, history.present.objects, nativeEdits, project, projectId]);

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
      if (event.key === "Delete" || event.key === "Backspace") { if (selectedIds.size) { event.preventDefault(); deleteSelection(); } return; }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && selectedIds.size) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowDown" ? -step : event.key === "ArrowUp" ? step : 0;
        commitObjects("Nudge objects", updateObjects(history.present.objects, selectedIds, (object) => ({ ...object, bounds: moveRect(object.bounds, dx, dy) })), "nudge");
        return;
      }
      const match = tools.find((tool) => tool.key?.toLowerCase() === event.key.toLowerCase());
      if (match) { event.preventDefault(); activateTool(match.id); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [history, selectedIds, editorState]);

  async function openDocument(manifest: ProjectManifest, bytes: Uint8Array, suppliedPassword?: string): Promise<void> {
    setStatus("Opening PDF engine…"); setError(null);
    try {
      const previous = documentRef.current;
      documentRef.current = null;
      if (previous) await previous.destroy();
      const pdf = await openPdfWithPdfJs(bytes, suppliedPassword);
      documentRef.current = pdf;
      setDocument(pdf);
      passwordRef.current = suppliedPassword;
      setPasswordRequired(false); setPassword("");
      setNativeInspecting(true);
      setStatus("Inspecting existing PDF content…");
      try {
        const inspection = await inspectNativePdf(bytes, suppliedPassword);
        setNativeInspection(inspection);
        setStatus("Ready");
        onTitleChange?.(`Edit · ${manifest.name}`, `${pdf.numPages} pages · ${inspection.totals.text + inspection.totals.images + inspection.totals.vectors + inspection.totals.tables + inspection.totals.forms} detected PDF objects · Unified editor`);
      } catch (inspectionError) {
        setNativeInspection(null);
        setWarnings((current) => [...current, `Existing-content inspection unavailable: ${inspectionError instanceof Error ? inspectionError.message : String(inspectionError)}`]);
        setStatus("Ready · overlay editing only");
      } finally { setNativeInspecting(false); }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message)) { setPasswordRequired(true); setError("Enter the PDF password for this in-memory editing session."); }
      else throw reason;
    }
  }

  function createAssetUrls(assets: EditorAssetRecord[]): void {
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
    if (tool !== "select") { setSelectedIds(new Set()); setSelectedNativeId(undefined); }
  }

  function selectObject(id: string | null, additive: boolean): void {
    if (id) setSelectedNativeId(undefined);
    if (!id) { if (!additive) setSelectedIds(new Set()); return; }
    const object = history.present.objects.find((item) => item.id === id);
    const targetIds = object?.groupId ? history.present.objects.filter((item) => item.groupId === object.groupId).map((item) => item.id) : [id];
    setSelectedIds((current) => {
      const next = additive ? new Set(current) : new Set<string>();
      const removing = additive && targetIds.every((targetId) => next.has(targetId));
      for (const targetId of targetIds) removing ? next.delete(targetId) : next.add(targetId);
      return next;
    });
  }

  function selectNativeObject(object: NativePageObject): void {
    setSelectedNativeId(object.id);
    setSelectedIds(new Set());
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
    setEditorState((state) => ({ ...state, activeTool: object.type === "ink" ? "pen" : "select" }));
    if (object.type === "note") setLeftTab("comments");
  }

  function commitObject(label: string, object: EditorObject, mergeKey?: string): void {
    const previous = history.present.objects.find((item) => item.id === object.id);
    if (label === "Move object" && previous && selectedIds.size > 1 && selectedIds.has(object.id)) {
      const dx = object.bounds.x0 - previous.bounds.x0;
      const dy = object.bounds.y0 - previous.bounds.y0;
      commitObjects(label, updateObjects(history.present.objects, selectedIds, (item) => item.id === object.id ? object : { ...item, bounds: moveRect(item.bounds, dx, dy) }), mergeKey);
      return;
    }
    const objects = history.present.objects.map((item) => item.id === object.id ? object : item);
    commitObjects(label, objects, mergeKey);
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
    if (!selectedIds.size) return;
    commitObjects("Delete objects", history.present.objects.filter((object) => !selectedIds.has(object.id)), undefined, new Set());
    setSelectedIds(new Set());
  }

  function duplicateSelection(): void {
    if (!selectedIds.size) return;
    const next = duplicateObjects(history.present.objects, selectedIds);
    const existing = new Set(history.present.objects.map((object) => object.id));
    const selection = new Set(next.filter((object) => !existing.has(object.id)).map((object) => object.id));
    commitObjects("Duplicate objects", next, undefined, selection);
    setSelectedIds(selection);
  }

  function arrange(direction: "front" | "back"): void {
    if (!selectedIds.size) return;
    const ordered = history.present.objects.slice().sort((a, b) => a.zIndex - b.zIndex);
    const unselected = ordered.filter((object) => !selectedIds.has(object.id));
    const selected = ordered.filter((object) => selectedIds.has(object.id));
    const nextOrder = direction === "front" ? [...unselected, ...selected] : [...selected, ...unselected];
    commitObjects(direction === "front" ? "Bring to front" : "Send to back", nextOrder.map((object, index) => ({ ...object, zIndex: index + 1 })));
  }

  function align(type: "left" | "center" | "right" | "top" | "middle" | "bottom"): void {
    if (selectedObjects.length < 2) return;
    const left = Math.min(...selectedObjects.map((object) => object.bounds.x0));
    const right = Math.max(...selectedObjects.map((object) => object.bounds.x1));
    const bottom = Math.min(...selectedObjects.map((object) => object.bounds.y0));
    const top = Math.max(...selectedObjects.map((object) => object.bounds.y1));
    const center = (left + right) / 2;
    const middle = (bottom + top) / 2;
    commitObjects(`Align ${type}`, updateObjects(history.present.objects, selectedIds, (object) => {
      const width = object.bounds.x1 - object.bounds.x0;
      const height = object.bounds.y1 - object.bounds.y0;
      if (type === "left") return { ...object, bounds: { ...object.bounds, x0: left, x1: left + width } };
      if (type === "right") return { ...object, bounds: { ...object.bounds, x0: right - width, x1: right } };
      if (type === "center") return { ...object, bounds: { ...object.bounds, x0: center - width / 2, x1: center + width / 2 } };
      if (type === "bottom") return { ...object, bounds: { ...object.bounds, y0: bottom, y1: bottom + height } };
      if (type === "top") return { ...object, bounds: { ...object.bounds, y0: top - height, y1: top } };
      return { ...object, bounds: { ...object.bounds, y0: middle - height / 2, y1: middle + height / 2 } };
    }));
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

  function distribute(axis: "horizontal" | "vertical"): void {
    if (selectedObjects.length < 3) return;
    const sorted = selectedObjects.slice().sort((left, right) => axis === "horizontal"
      ? (left.bounds.x0 + left.bounds.x1) - (right.bounds.x0 + right.bounds.x1)
      : (left.bounds.y0 + left.bounds.y1) - (right.bounds.y0 + right.bounds.y1));
    const firstCenter = axis === "horizontal" ? (sorted[0].bounds.x0 + sorted[0].bounds.x1) / 2 : (sorted[0].bounds.y0 + sorted[0].bounds.y1) / 2;
    const last = sorted.at(-1) as EditorObject;
    const lastCenter = axis === "horizontal" ? (last.bounds.x0 + last.bounds.x1) / 2 : (last.bounds.y0 + last.bounds.y1) / 2;
    const step = (lastCenter - firstCenter) / (sorted.length - 1);
    const centers = new Map(sorted.map((object, index) => [object.id, firstCenter + step * index]));
    commitObjects(`Distribute ${axis}`, updateObjects(history.present.objects, selectedIds, (object) => {
      const center = centers.get(object.id);
      if (center === undefined) return object;
      const width = object.bounds.x1 - object.bounds.x0;
      const height = object.bounds.y1 - object.bounds.y0;
      return axis === "horizontal"
        ? { ...object, bounds: { ...object.bounds, x0: center - width / 2, x1: center + width / 2 } }
        : { ...object, bounds: { ...object.bounds, y0: center - height / 2, y1: center + height / 2 } };
    }));
  }

  async function copySelection(): Promise<void> {
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
        downloadBlob(new Blob([result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength)], { type: "application/pdf" }), filename);
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

  async function retryPassword(): Promise<void> {
    if (!project || !sourceBytesRef.current || !password) return;
    try { await openDocument(project, sourceBytesRef.current, password); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  if (!project) return <div className="viewer-loading"><span className="spinner" /><strong>{error ?? status}</strong></div>;
  if (!document) return <div className="editor-app"><div className="viewer-loading"><span className="spinner" /><strong>{status}</strong></div>{passwordRequired ? <PasswordDialog error={error} password={password} onChange={setPassword} onSubmit={() => void retryPassword()} projectId={projectId} /> : null}</div>;

  return (
    <div className="editor-app">
      <header className="editor-commandbar">
        <div className="editor-file-group"><a className="icon-button" href={routeHref({ name: "viewer", projectId })}>←</a><div><strong>{project.name}</strong><span>{status} · {nativeInspection ? `${nativeInspection.totals.text + nativeInspection.totals.images + nativeInspection.totals.vectors + nativeInspection.totals.tables + nativeInspection.totals.forms} PDF + ` : ""}{history.present.objects.length} overlay objects</span></div></div>
        <div className="editor-commandbar__center">
          <button disabled={!history.past.length || processing} onClick={undo} title="Undo" type="button">↶</button><button disabled={!history.future.length || processing} onClick={redo} title="Redo" type="button">↷</button><span />
          <button disabled={editorState.currentPage <= 1} onClick={() => setEditorState((state) => ({ ...state, currentPage: state.currentPage - 1 }))} type="button">‹</button><label><input max={document.numPages} min="1" onChange={(event) => setEditorState((state) => ({ ...state, currentPage: Math.max(1, Math.min(document.numPages, Number(event.target.value))) }))} type="number" value={editorState.currentPage} /><span>/ {document.numPages}</span></label><button disabled={editorState.currentPage >= document.numPages} onClick={() => setEditorState((state) => ({ ...state, currentPage: state.currentPage + 1 }))} type="button">›</button><span />
          <button onClick={() => setEditorState((state) => ({ ...state, zoom: Math.max(.5, state.zoom - .25) }))} type="button">−</button><select onChange={(event) => setEditorState((state) => ({ ...state, zoom: Number(event.target.value) }))} value={editorState.zoom}><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select><button onClick={() => setEditorState((state) => ({ ...state, zoom: Math.min(3, state.zoom + .25) }))} type="button">+</button>
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
        {selectedIds.size > 1 ? <><span /><button onClick={groupSelection} type="button">Group</button><button onClick={ungroupSelection} type="button">Ungroup</button><button onClick={() => align("left")} type="button">Align left</button><button onClick={() => align("center")} type="button">Center</button><button onClick={() => align("right")} type="button">Align right</button><button onClick={() => align("top")} type="button">Top</button><button onClick={() => align("middle")} type="button">Middle</button><button onClick={() => align("bottom")} type="button">Bottom</button>{selectedIds.size > 2 ? <><button onClick={() => distribute("horizontal")} type="button">Distribute H</button><button onClick={() => distribute("vertical")} type="button">Distribute V</button></> : null}</> : null}
        <strong>{lastReport ?? (editorState.dirty || nativeEdits.length ? "Local edits autosaved" : "No pending editor changes")}</strong>
      </div>

      <div className="editor-notices">
        {error ? <div className="editor-banner error-banner"><strong>Editor error</strong><span>{error}</span><button onClick={() => setError(null)} type="button">Dismiss</button></div> : null}
        {warnings.length ? <div className="editor-banner warning-banner"><strong>Export report</strong><span>{warnings.join(" ")}</span><button onClick={() => setWarnings([])} type="button">Dismiss</button></div> : null}
        {redactionCount ? <div className="editor-banner warning-banner" role="status"><strong>Redaction marks are not permanent yet</strong><span>{redactionCount} marked region{redactionCount === 1 ? "" : "s"}. Open Forms & Protect and choose Apply redactions to permanently remove the covered content.</span></div> : null}
      </div>

      <div className={`editor-layout${sidebarOpen ? "" : " editor-layout--no-sidebar"}${propertiesOpen ? "" : " editor-layout--no-properties"}`}>
        <nav className="editor-toolrail" aria-label="Editor tools">{toolGroups.map((group) => <section className="editor-tool-group" aria-label={group.label} key={group.label}><strong>{group.label}</strong>{group.tools.map((tool) => <button className={editorState.activeTool === tool.id ? "active" : ""} key={tool.id} onClick={() => activateTool(tool.id)} title={`${tool.label}${tool.key ? ` (${tool.key})` : ""}`} type="button"><span>{tool.icon}</span><small>{tool.label}</small></button>)}</section>)}<input accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importImage(file); event.target.value = ""; }} ref={imageInputRef} type="file" /></nav>
        {(sidebarOpen || propertiesOpen) ? <button aria-label="Close editor panel" className="editor-mobile-backdrop" onClick={() => { setSidebarOpen(false); setPropertiesOpen(false); }} type="button" /> : null}

        {sidebarOpen ? <aside className="editor-left-panel"><div className="editor-left-tabs">{(["pages", "layers", "comments"] as LeftTab[]).map((tab) => <button className={leftTab === tab ? "active" : ""} key={tab} onClick={() => setLeftTab(tab)} type="button">{tab}</button>)}</div><div className="editor-left-body">{leftTab === "pages" ? <div className="thumbnail-list">{Array.from({ length: document.numPages }, (_, index) => <Thumbnail document={document} key={index + 1} onSelect={(pageNumber) => setEditorState((state) => ({ ...state, currentPage: pageNumber }))} pageNumber={index + 1} selected={editorState.currentPage === index + 1} />)}</div> : null}{leftTab === "layers" ? <LayerList nativeObjects={currentNativeObjects} nativeQueued={nativeEdits} objects={currentPageObjects} selectedIds={selectedIds} selectedNativeId={selectedNativeId} onSelect={selectObject} onSelectNative={selectNativeObject} onToggleHidden={(object) => commitObject(object.hidden ? "Show object" : "Hide object", { ...object, hidden: !object.hidden })} /> : null}{leftTab === "comments" ? <CommentList comments={comments} onSelect={(comment) => { setEditorState((state) => ({ ...state, currentPage: comment.pageNumber, activeTool: "select" })); setSelectedIds(new Set([comment.id])); }} /> : null}</div></aside> : null}

        <main className="editor-stage"><EditorCanvasPage activeTool={editorState.activeTool} assetUrls={assetUrls} author={editorState.author} document={document} gridSize={editorState.gridSize} nativeObjects={currentNativeObjects} nativeOrigin={currentNativePage ? { x: currentNativePage.originX, y: currentNativePage.originY } : undefined} objects={displayObjects} onCommit={commitObject} onCreate={addObject} onEditText={(object) => { setSelectedNativeId(undefined); setSelectedIds(new Set([object.id])); if (isCompactViewport()) setSidebarOpen(false); setPropertiesOpen(true); }} onPageGeometry={setPageGeometry} onPreview={setPreviewObject} onSelect={selectObject} onSelectNative={selectNativeObject} pageNumber={editorState.currentPage} selectedIds={selectedIds} selectedNativeId={selectedNativeId} showNativeContent={showNativeContent} snapEnabled={editorState.snapEnabled} zoom={editorState.zoom} /></main>

        {propertiesOpen ? selectedNativeObject ? <NativeContentPropertiesPanel object={selectedNativeObject} onQueue={queueNativeEdits} onRemove={removeNativeEdits} queuedEdits={nativeEdits} /> : <EditorPropertiesPanel onBringFront={() => arrange("front")} onChange={commitObject} onDelete={deleteSelection} onDuplicate={duplicateSelection} onSendBack={() => arrange("back")} selected={selectedObjects} /> : null}
      </div>
    </div>
  );
}

function LayerList({ objects, nativeObjects, nativeQueued, selectedIds, selectedNativeId, onSelect, onSelectNative, onToggleHidden }: { objects: EditorObject[]; nativeObjects: NativePageObject[]; nativeQueued: NativeEdit[]; selectedIds: Set<string>; selectedNativeId?: string; onSelect: (id: string, additive: boolean) => void; onSelectNative: (object: NativePageObject) => void; onToggleHidden: (object: EditorObject) => void }) {
  if (!objects.length && !nativeObjects.length) return <div className="editor-panel-empty"><strong>No editable objects detected</strong><p>Add an overlay object or inspect another page.</p></div>;
  return <div className="editor-layer-list unified-layer-list">
    {nativeObjects.length ? <><div className="editor-layer-heading"><strong>Existing PDF content</strong><span>{nativeObjects.length}</span></div>{nativeObjects.map((object) => { const queued = nativeQueued.filter((edit) => edit.objectId === object.id).length; return <div className={selectedNativeId === object.id ? "editor-layer-item native-layer-item active" : "editor-layer-item native-layer-item"} key={object.id}><button onClick={() => onSelectNative(object)} type="button"><span>{nativeObjectIcon(object)}</span><div><strong>{nativeObjectLabel(object)}</strong><small>{object.capability.label} · {Math.round(object.capability.confidence * 100)}%{queued ? ` · ${queued} queued` : ""}</small></div></button></div>; })}</> : null}
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
