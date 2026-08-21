import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { asAffineMatrix, CoordinateService, type Point, type Rect } from "../../core/coordinates";
import type { EditorObject, EditorTool, InkPoint } from "../../types/editor";
import type { NativePageObject, NativeRect } from "../../types/nativeEditor";
import { NativeContentOverlay, type NativeTransformMode } from "../native/NativeContentOverlay";
import { clampRect, createObjectForTool, normalizeRect, rectHeight, rectWidth, snapRect } from "../editorModel";
import { EditorObjectView, type ResizeHandle } from "./EditorObjectView";

interface Props {
  document: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  objects: EditorObject[];
  selectedIds: Set<string>;
  activeTool: EditorTool;
  author: string;
  snapEnabled: boolean;
  gridSize: number;
  assetUrls: Map<string, string>;
  nativeObjects?: NativePageObject[];
  nativeOrigin?: { x: number; y: number };
  selectedNativeId?: string;
  selectedNativeIds?: Set<string>;
  nativeEffectiveBounds?: Map<string, NativeRect>;
  nativeTransformableIds?: Set<string>;
  showNativeContent?: boolean;
  onSelect: (id: string | null, additive: boolean) => void;
  onSelectNative?: (object: NativePageObject, additive: boolean) => void;
  onTransformNative?: (object: NativePageObject, bounds: NativeRect, mode: NativeTransformMode) => void;
  onCreate: (object: EditorObject) => void;
  onPreview: (object: EditorObject | null) => void;
  onCommit: (label: string, object: EditorObject) => void;
  onEditText: (object: EditorObject) => void;
  onPageGeometry?: (rect: Rect) => void;
}

interface PageState {
  width: number;
  height: number;
  service: CoordinateService | null;
  pdfBounds: Rect;
}

interface DragState {
  mode: "create" | "move" | "resize" | "ink" | "pan";
  startViewport: Point;
  startPdf: Point;
  object?: EditorObject;
  handle?: ResizeHandle;
  points?: InkPoint[];
  stage?: HTMLElement;
  startScrollLeft?: number;
  startScrollTop?: number;
}

export function EditorCanvasPage(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const previousPageRef = useRef(props.pageNumber);
  const [pageState, setPageState] = useState<PageState>({ width: 612 * props.zoom, height: 792 * props.zoom, service: null, pdfBounds: { x0: 0, y0: 0, x1: 612, y1: 792 } });
  const [draftRect, setDraftRect] = useState<Rect | null>(null);
  const [guides, setGuides] = useState<Array<{ axis: "x" | "y"; value: number }>>([]);
  const pageObjects = useMemo(() => props.objects.filter((object) => object.pageNumber === props.pageNumber && !object.hidden), [props.objects, props.pageNumber]);

  useEffect(() => {
    if (previousPageRef.current === props.pageNumber) return;
    previousPageRef.current = props.pageNumber;
    dragRef.current = null;
    setDraftRect(null);
    setGuides([]);
    props.onPreview(null);
    props.onSelect(null, false);
  }, [props.pageNumber]);

  useEffect(() => {
    let cancelled = false;
    void props.document.getPage(props.pageNumber).then(async (page) => {
      try {
        const viewport = page.getViewport({ scale: props.zoom });
        if (cancelled) return;
        const service = new CoordinateService(asAffineMatrix(viewport.transform));
        const pdfBounds = service.viewportRectToPdf({ x0: 0, y0: 0, x1: viewport.width, y1: viewport.height });
        setPageState({ width: viewport.width, height: viewport.height, service, pdfBounds });
        props.onPageGeometry?.(pdfBounds);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas context unavailable.");
        taskRef.current?.cancel();
        const task = page.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
        taskRef.current = task;
        await task.promise;
      } finally { page.cleanup(); }
    }).catch(() => undefined);
    return () => { cancelled = true; taskRef.current?.cancel(); };
  }, [props.document, props.pageNumber, props.zoom]);

  function localViewportPoint(event: ReactPointerEvent): Point {
    const rect = hostRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }

  function beginCanvasPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || !pageState.service) return;
    if (props.activeTool === "select") { props.onSelect(null, false); return; }
    if (props.activeTool === "image") return;
    const viewportPoint = localViewportPoint(event);
    if (props.activeTool === "hand") {
      const stage = event.currentTarget.closest(".editor-stage") as HTMLElement | null;
      if (!stage) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { mode: "pan", startViewport: { x: event.clientX, y: event.clientY }, startPdf: { x: 0, y: 0 }, stage, startScrollLeft: stage.scrollLeft, startScrollTop: stage.scrollTop };
      return;
    }
    const pdfPoint = pageState.service.viewportToPdf(viewportPoint);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (props.activeTool === "pen") {
      dragRef.current = { mode: "ink", startViewport: viewportPoint, startPdf: pdfPoint, points: [pdfPoint] };
    } else {
      dragRef.current = { mode: "create", startViewport: viewportPoint, startPdf: pdfPoint };
      setDraftRect({ x0: viewportPoint.x, y0: viewportPoint.y, x1: viewportPoint.x, y1: viewportPoint.y });
    }
  }

  function beginObjectPointer(event: ReactPointerEvent<HTMLDivElement>, object: EditorObject): void {
    event.stopPropagation();
    if (props.activeTool !== "select" || object.locked || !pageState.service) { props.onSelect(object.id, event.ctrlKey || event.metaKey || event.shiftKey); return; }
    props.onSelect(object.id, event.ctrlKey || event.metaKey || event.shiftKey);
    const viewportPoint = localViewportPoint(event);
    dragRef.current = { mode: "move", startViewport: viewportPoint, startPdf: pageState.service.viewportToPdf(viewportPoint), object: structuredClone(object) };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>, object: EditorObject, handle: ResizeHandle): void {
    event.stopPropagation();
    if (!pageState.service) return;
    const viewportPoint = localViewportPoint(event);
    dragRef.current = { mode: "resize", startViewport: viewportPoint, startPdf: pageState.service.viewportToPdf(viewportPoint), object: structuredClone(object), handle };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    const service = pageState.service;
    if (!drag || !service) return;
    const viewportPoint = localViewportPoint(event);
    if (drag.mode === "pan") {
      if (drag.stage) {
        drag.stage.scrollLeft = (drag.startScrollLeft ?? 0) - (event.clientX - drag.startViewport.x);
        drag.stage.scrollTop = (drag.startScrollTop ?? 0) - (event.clientY - drag.startViewport.y);
      }
      return;
    }
    const pdfPoint = service.viewportToPdf(viewportPoint);
    if (drag.mode === "create") {
      setDraftRect(normalizeRect({ x0: drag.startViewport.x, y0: drag.startViewport.y, x1: viewportPoint.x, y1: viewportPoint.y }, 1));
      return;
    }
    if (drag.mode === "ink") {
      const points = drag.points ?? [];
      const last = points.at(-1);
      if (!last || Math.hypot(last.x - pdfPoint.x, last.y - pdfPoint.y) > 1.2) points.push(pdfPoint);
      drag.points = points;
      const bounds = boundsForPoints(points);
      props.onPreview({
        id: "draft-ink",
        type: "ink",
        pageNumber: props.pageNumber,
        bounds,
        rotation: 0,
        opacity: 1,
        zIndex: Math.max(0, ...props.objects.map((object) => object.zIndex)) + 1,
        locked: false,
        hidden: false,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        strokes: [points],
        color: "#174d91",
        strokeWidth: 2.2,
        highlighter: false
      });
      return;
    }
    if (!drag.object) return;
    if (drag.mode === "move") {
      const dx = pdfPoint.x - drag.startPdf.x;
      const dy = pdfPoint.y - drag.startPdf.y;
      const raw = { x0: drag.object.bounds.x0 + dx, y0: drag.object.bounds.y0 + dy, x1: drag.object.bounds.x1 + dx, y1: drag.object.bounds.y1 + dy };
      const snapped = snapRect(raw, pageState.pdfBounds, props.gridSize, props.snapEnabled);
      setGuides(snapped.guides);
      props.onPreview({ ...drag.object, bounds: snapped.rect });
      return;
    }
    const bounds = { ...drag.object.bounds };
    if (drag.handle?.includes("n")) bounds.y1 = pdfPoint.y;
    if (drag.handle?.includes("s")) bounds.y0 = pdfPoint.y;
    if (drag.handle?.includes("w")) bounds.x0 = pdfPoint.x;
    if (drag.handle?.includes("e")) bounds.x1 = pdfPoint.x;
    let normalized = normalizeRect(bounds, 8);
    if (drag.object.type === "image" && drag.object.preserveAspectRatio && drag.object.intrinsicHeight > 0) {
      const ratio = drag.object.intrinsicWidth / drag.object.intrinsicHeight;
      let width = rectWidth(normalized);
      let height = rectHeight(normalized);
      if (width / height > ratio) height = width / ratio; else width = height * ratio;
      if (drag.handle?.includes("w")) normalized.x0 = normalized.x1 - width; else normalized.x1 = normalized.x0 + width;
      if (drag.handle?.includes("s")) normalized.y0 = normalized.y1 - height; else normalized.y1 = normalized.y0 + height;
    }
    props.onPreview({ ...drag.object, bounds: clampRect(normalized, pageState.pdfBounds) });
  }

  function endPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    const service = pageState.service;
    if (!drag || !service) return;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    dragRef.current = null;
    setGuides([]);
    if (drag.mode === "pan") return;
    if (drag.mode === "create") {
      const viewportPoint = localViewportPoint(event);
      let viewportRect = normalizeRect({ x0: drag.startViewport.x, y0: drag.startViewport.y, x1: viewportPoint.x, y1: viewportPoint.y }, 1);
      const minimum = defaultViewportSize(props.activeTool);
      if (rectWidth(viewportRect) < 8 && rectHeight(viewportRect) < 8) viewportRect = { x0: viewportPoint.x, y0: viewportPoint.y, x1: viewportPoint.x + minimum.width, y1: viewportPoint.y + minimum.height };
      const pdfRect = service.viewportRectToPdf(viewportRect);
      const object = createObjectForTool({ tool: props.activeTool, pageNumber: props.pageNumber, bounds: pdfRect, author: props.author, zIndex: Math.max(0, ...props.objects.map((item) => item.zIndex)) + 1 });
      setDraftRect(null);
      if (object) props.onCreate(object);
      return;
    }
    if (drag.mode === "ink") {
      const points = drag.points ?? [];
      props.onPreview(null);
      if (points.length < 2) return;
      const now = Date.now();
      props.onCreate({ id: crypto.randomUUID(), type: "ink", pageNumber: props.pageNumber, bounds: boundsForPoints(points), rotation: 0, opacity: 1, zIndex: Math.max(0, ...props.objects.map((item) => item.zIndex)) + 1, locked: false, hidden: false, createdAt: now, modifiedAt: now, strokes: [points], color: "#174d91", strokeWidth: 2.2, highlighter: false });
      return;
    }
    if (drag.object) {
      const preview = props.objects.find((object) => object.id === drag.object?.id);
      void preview;
    }
  }

  function objectPointerUp(event: ReactPointerEvent, object: EditorObject): void {
    const drag = dragRef.current;
    if (!drag || !drag.object || drag.object.id !== object.id) return;
    const target = document.querySelector(`[data-object-id="${CSS.escape(object.id)}"]`) as HTMLElement | null;
    void target;
    const preview = props.objects.find((item) => item.id === object.id) ?? object;
    dragRef.current = null;
    setGuides([]);
    props.onPreview(null);
    props.onCommit(drag.mode === "move" ? "Move object" : "Resize object", preview);
    try { (event.currentTarget as Element).releasePointerCapture(event.pointerId); } catch { /* no capture */ }
  }

  const draftStyle = draftRect ? { left: draftRect.x0, top: draftRect.y0, width: rectWidth(draftRect), height: rectHeight(draftRect) } : undefined;
  const nativePageSize = { width: pageState.width / Math.max(.05, props.zoom), height: pageState.height / Math.max(.05, props.zoom) };
  return (
    <section className="editor-page-shell" style={{ width: pageState.width, height: pageState.height }}>
      <div
        className={`editor-page-layers editor-cursor--${props.activeTool}`}
        onPointerDown={beginCanvasPointer}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        ref={hostRef}
        style={{ width: pageState.width, height: pageState.height }}
      >
        <canvas ref={canvasRef} />
        <NativeContentOverlay
          effectiveBounds={props.nativeEffectiveBounds}
          enabled={Boolean(props.showNativeContent && props.activeTool === "select")}
          gridSize={props.gridSize}
          objects={props.nativeObjects ?? []}
          onSelect={(object, additive) => props.onSelectNative?.(object, additive)}
          onTransform={props.onTransformNative}
          originX={props.nativeOrigin?.x}
          originY={props.nativeOrigin?.y}
          pageSize={nativePageSize}
          selectedId={props.selectedNativeId}
          selectedIds={props.selectedNativeIds}
          snapEnabled={props.snapEnabled}
          transformableIds={props.nativeTransformableIds}
          zoom={props.zoom}
        />
        <div className="editor-object-layer">
          {pageObjects.map((object) => {
            const viewportBounds = pageState.service?.pdfRectToViewport(object.bounds) ?? object.bounds;
            return (
              <div key={object.id} onPointerUp={(event) => objectPointerUp(event, object)}>
                <EditorObjectView
                  assetUrl={object.type === "image" ? props.assetUrls.get(object.assetId) : undefined}
                  object={object}
                  onDoubleClick={props.onEditText}
                  onPointerDown={beginObjectPointer}
                  onResizePointerDown={beginResize}
                  selected={props.selectedIds.has(object.id)}
                  viewportBounds={viewportBounds}
                  viewportScale={props.zoom}
                />
              </div>
            );
          })}
          {draftRect ? <div className="editor-draft-rect" style={draftStyle} /> : null}
          {guides.map((guide, index) => {
            const viewport = guide.axis === "x" ? pageState.service?.pdfToViewport({ x: guide.value, y: pageState.pdfBounds.y0 }).x ?? 0 : pageState.service?.pdfToViewport({ x: pageState.pdfBounds.x0, y: guide.value }).y ?? 0;
            return <div className={`editor-guide editor-guide--${guide.axis}`} key={`${guide.axis}-${index}`} style={guide.axis === "x" ? { left: viewport } : { top: viewport }} />;
          })}
        </div>
      </div>
      <span className="editor-page-label">Page {props.pageNumber}</span>
    </section>
  );
}

function defaultViewportSize(tool: EditorTool): { width: number; height: number } {
  if (tool === "note") return { width: 32, height: 32 };
  if (["highlight", "underline", "strikeout", "squiggly"].includes(tool)) return { width: 160, height: 24 };
  if (tool === "link") return { width: 180, height: 32 };
  if (tool === "stamp") return { width: 150, height: 48 };
  if (tool === "line" || tool === "arrow") return { width: 130, height: 40 };
  return { width: 180, height: 90 };
}

function boundsForPoints(points: Point[]): Rect {
  const x = points.map((point) => point.x);
  const y = points.map((point) => point.y);
  return { x0: Math.min(...x), y0: Math.min(...y), x1: Math.max(...x), y1: Math.max(...y) };
}
