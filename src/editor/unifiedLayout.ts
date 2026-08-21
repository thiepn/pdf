import type { Rect } from "../core/coordinates";
import { cjkLanguageForScript, detectScript } from "../native/nativeModel";
import { buildPreservedEditRuns, editableFamilyForSource } from "../native/textStyle";
import { evaluateTextFit } from "../native/textFit";
import type { EditorObject } from "../types/editor";
import type {
  NativeComplexEdit,
  NativeEdit,
  NativeEditableFontFamily,
  NativeImageEdit,
  NativePageObject,
  NativePageTree,
  NativeRect,
  NativeTableEdit,
  NativeTableEditCell,
  NativeTextEdit,
  NativeTextObject,
  NativeVectorEdit,
  NativeVectorObject
} from "../types/nativeEditor";

/**
 * P6 uses one page-local, top-left coordinate space for layout decisions.
 * Existing-content inspection already uses MuPDF page coordinates in this
 * orientation. Overlay editor objects use PDF user-space coordinates, so the
 * conversion is kept here instead of leaking coordinate assumptions into the
 * qualified P1-P5 writers.
 */
export interface UnifiedCanvasBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UnifiedLayoutItem {
  key: string;
  source: "editor" | "native";
  id: string;
  pageNumber: number;
  type: string;
  bounds: UnifiedCanvasBounds;
  rotation: number;
  movable: boolean;
  resizable: boolean;
  rotatable: boolean;
  reason?: string;
}

export type UnifiedAlign = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type UnifiedDistributionAxis = "horizontal" | "vertical";

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function editorRectToCanvas(rect: Rect, page: Rect): UnifiedCanvasBounds {
  const x0 = Math.min(rect.x0, rect.x1);
  const x1 = Math.max(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1);
  const y1 = Math.max(rect.y0, rect.y1);
  return {
    x: x0 - page.x0,
    y: page.y1 - y1,
    w: x1 - x0,
    h: y1 - y0
  };
}

export function canvasToEditorRect(bounds: UnifiedCanvasBounds, page: Rect): Rect {
  const x0 = page.x0 + bounds.x;
  const x1 = x0 + Math.max(1, bounds.w);
  const y1 = page.y1 - bounds.y;
  const y0 = y1 - Math.max(1, bounds.h);
  return { x0, y0, x1, y1 };
}

export function nativeRectToCanvas(rect: NativeRect, page: NativePageTree): UnifiedCanvasBounds {
  return {
    x: rect.x - page.originX,
    y: rect.y - page.originY,
    w: rect.w,
    h: rect.h
  };
}

export function canvasToNativeRect(bounds: UnifiedCanvasBounds, page: NativePageTree): NativeRect {
  return {
    x: page.originX + bounds.x,
    y: page.originY + bounds.y,
    w: Math.max(1, bounds.w),
    h: Math.max(1, bounds.h)
  };
}

export function effectiveNativeBounds(object: NativePageObject, queuedEdits: NativeEdit[]): NativeRect {
  const wholeObject = [...queuedEdits].reverse().find((edit) => edit.objectId === object.id
    && (edit.kind === "text" || edit.kind === "image" || edit.kind === "vector" || edit.kind === "table" || edit.kind === "complex"));
  if (wholeObject && "bounds" in wholeObject) return { ...wholeObject.bounds };
  return { ...object.bounds };
}

export function effectiveNativeRotation(object: NativePageObject, queuedEdits: NativeEdit[]): number {
  const edit = [...queuedEdits].reverse().find((candidate) => candidate.objectId === object.id);
  if (object.type === "vector" && edit?.kind === "vector") return finite(edit.rotation);
  if (object.type === "image" && edit?.kind === "image") return finite(edit.rotation ?? 0);
  if (object.type === "complex" && edit?.kind === "complex") return finite(edit.rotation);
  return 0;
}

export function nativeTransformSupport(object: NativePageObject, queuedEdits: NativeEdit[]): Pick<UnifiedLayoutItem, "movable" | "resizable" | "rotatable" | "reason"> {
  if (object.type === "form") return { movable: false, resizable: false, rotatable: false, reason: "Interactive form geometry is not rewritten by the qualified form-value engine." };
  if (object.type === "complex" && object.editability === "unsupported") return { movable: false, resizable: false, rotatable: false, reason: object.capability.reason };
  if (object.type === "complex") return { movable: true, resizable: true, rotatable: true, reason: object.clipped ? "The nested group remains inside its original page clipping boundary." : undefined };
  if (object.type === "vector" && object.editability === "clip-protected") return { movable: false, resizable: false, rotatable: false, reason: "This vector controls clipping for other page content." };
  if (object.type === "table" && (object.editability === "unsupported" || object.complexContent)) return { movable: false, resizable: false, rotatable: false, reason: "This table contains complex content that P5 intentionally preserves unchanged." };
  if (object.type === "text") {
    if (object.editability === "unsupported") return { movable: false, resizable: false, rotatable: false, reason: object.reason };
    if (object.editability === "overlay-only") return { movable: false, resizable: false, rotatable: false, reason: "Appearance-only complex-script text cannot be moved or resized as source content because the original text cannot be safely removed and reconstructed." };
    const existing = queuedEdits.find((edit): edit is NativeTextEdit => edit.kind === "text" && edit.objectId === object.id);
    if (existing?.reflowFollower) return { movable: false, resizable: false, rotatable: false, reason: "This paragraph is currently owned by another queued P2 reflow." };
    if (existing?.layoutMode === "expand-flow") return { movable: false, resizable: false, rotatable: false, reason: "Apply or discard the queued P2 layout-aware reflow before manually transforming this paragraph." };
  }
  if (object.type === "table") {
    const hasLegacyCells = queuedEdits.some((edit) => edit.kind === "table-cell" && edit.objectId === object.id);
    const hasStructured = queuedEdits.some((edit) => edit.kind === "table" && edit.objectId === object.id);
    if (hasLegacyCells && !hasStructured) return { movable: false, resizable: false, rotatable: false, reason: "Apply or discard the legacy cell-only table edits before changing whole-table geometry." };
  }
  return {
    movable: true,
    resizable: true,
    rotatable: object.type === "image" || object.type === "vector"
  };
}

export function editorLayoutItem(object: EditorObject, page: Rect): UnifiedLayoutItem {
  return {
    key: `editor:${object.id}`,
    source: "editor",
    id: object.id,
    pageNumber: object.pageNumber,
    type: object.type,
    bounds: editorRectToCanvas(object.bounds, page),
    rotation: object.rotation,
    movable: !object.locked,
    resizable: !object.locked,
    rotatable: !object.locked
  };
}

export function nativeLayoutItem(object: NativePageObject, page: NativePageTree, queuedEdits: NativeEdit[]): UnifiedLayoutItem {
  const support = nativeTransformSupport(object, queuedEdits);
  return {
    key: `native:${object.id}`,
    source: "native",
    id: object.id,
    pageNumber: object.pageNumber,
    type: object.type,
    bounds: nativeRectToCanvas(effectiveNativeBounds(object, queuedEdits), page),
    rotation: effectiveNativeRotation(object, queuedEdits),
    ...support
  };
}

function colorValue(value?: string): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value as string : "#111111";
}

function textGeometryEdit(object: NativeTextObject, bounds: NativeRect, queuedEdits: NativeEdit[]): NativeTextEdit | undefined {
  const existing = queuedEdits.find((edit): edit is NativeTextEdit => edit.kind === "text" && edit.objectId === object.id && !edit.reflowFollower);
  if (existing?.layoutMode === "expand-flow") return undefined;
  const language = cjkLanguageForScript(object.script);
  const family = editableFamilyForSource(object.family, object.script);
  const base: NativeTextEdit = existing ? structuredClone(existing) : {
    id: crypto.randomUUID(),
    kind: "text",
    objectId: object.id,
    pageNumber: object.pageNumber,
    originalText: object.text,
    text: object.text,
    sourceBounds: object.bounds,
    bounds: object.bounds,
    fontFamily: family,
    fontSize: Math.max(1, object.size),
    color: colorValue(object.color),
    backgroundColor: "transparent",
    align: object.align ?? "left",
    mode: object.editability === "overlay-only" ? "overlay" : "replace",
    wrap: true,
    fontSource: object.editability === "overlay-only" ? "annotation-fallback" : language ? "built-in-cjk" : "built-in",
    fontLanguage: language,
    writingMode: object.writingMode,
    fontWeight: object.weight,
    fontStyle: object.style,
    lineHeight: object.lineHeight,
    layoutMode: "fixed-box",
    styleRuns: object.editability === "overlay-only" ? undefined : buildPreservedEditRuns(object, object.text, colorValue(object.color)),
    preserveSourceStyle: object.editability !== "overlay-only" && Boolean(object.runs?.length)
  };
  const fit = evaluateTextFit(base.text, bounds, base.fontSize, base.wrap, base.lineHeight);
  if (base.mode !== "overlay" && !fit.fits) return undefined;
  return { ...base, bounds, sourceBounds: base.sourceBounds ?? object.bounds, layoutMode: "fixed-box", reflowFollower: false };
}

function imageGeometryEdit(object: Extract<NativePageObject, { type: "image" }>, bounds: NativeRect, queuedEdits: NativeEdit[]): NativeImageEdit {
  const existing = queuedEdits.find((edit): edit is NativeImageEdit => edit.kind === "image" && edit.objectId === object.id);
  return existing ? { ...structuredClone(existing), action: existing.action === "delete" ? "transform" : existing.action ?? "transform", bounds, sourceBounds: existing.sourceBounds ?? object.bounds } : {
    id: crypto.randomUUID(),
    kind: "image",
    objectId: object.id,
    pageNumber: object.pageNumber,
    action: "transform",
    bounds,
    sourceBounds: object.bounds,
    removeUnderlying: true,
    fit: "contain",
    rotation: 0,
    opacity: 1
  };
}

function sourceAlpha(object: NativeVectorObject): number {
  if (object.paint === "fill") return object.fillAlpha;
  if (object.paint === "stroke") return object.strokeAlpha;
  return Math.min(object.fillAlpha, object.strokeAlpha);
}

function vectorGeometryEdit(object: NativeVectorObject, bounds: NativeRect, queuedEdits: NativeEdit[]): NativeVectorEdit | undefined {
  if (object.editability === "clip-protected") return undefined;
  const existing = queuedEdits.find((edit): edit is NativeVectorEdit => edit.kind === "vector" && edit.objectId === object.id);
  return existing ? { ...structuredClone(existing), action: "edit", bounds, sourceBounds: existing.sourceBounds ?? object.bounds } : {
    id: crypto.randomUUID(),
    kind: "vector",
    objectId: object.id,
    pageNumber: object.pageNumber,
    action: "edit",
    bounds,
    sourceBounds: object.bounds,
    sourceStreamIndex: object.sourceStreamIndex,
    sourcePathIndex: object.sourcePathIndex,
    sourceSignature: object.sourceSignature,
    commands: object.commands,
    paint: object.paint,
    rotation: 0,
    appearanceOverride: false,
    fillEnabled: object.paint !== "stroke",
    strokeEnabled: object.paint !== "fill",
    fillColor: object.fillColor,
    strokeColor: object.strokeColor,
    lineWidth: Math.max(0.01, object.lineWidth),
    lineCap: object.lineCap,
    lineJoin: object.lineJoin,
    miterLimit: Math.max(1, object.miterLimit),
    dashPattern: [...object.dashPattern],
    dashPhase: object.dashPhase,
    alpha: sourceAlpha(object),
    evenOdd: object.evenOdd
  };
}

function complexGeometryEdit(object: Extract<NativePageObject, { type: "complex" }>, bounds: NativeRect, queuedEdits: NativeEdit[]): NativeComplexEdit | undefined {
  if (object.editability === "unsupported") return undefined;
  const existing = queuedEdits.find((edit): edit is NativeComplexEdit => edit.kind === "complex" && edit.objectId === object.id);
  return existing ? {
    ...structuredClone(existing),
    action: "transform",
    bounds,
    sourceBounds: existing.sourceBounds ?? object.bounds
  } : {
    id: crypto.randomUUID(),
    kind: "complex",
    objectId: object.id,
    pageNumber: object.pageNumber,
    action: "transform",
    sourceBounds: object.bounds,
    bounds,
    resourceName: object.resourceName,
    sourceStreamIndex: object.sourceStreamIndex,
    sourceInvocationIndex: object.sourceInvocationIndex,
    sourceSignature: object.sourceSignature,
    rotation: 0
  };
}

function defaultSizes(values: number[] | undefined, count: number, total: number): number[] {
  if (values?.length === count && values.every((value) => Number.isFinite(value) && value > 0)) return [...values];
  return Array.from({ length: Math.max(1, count) }, () => total / Math.max(1, count));
}

function tableFamily(text: string, fallback?: NativeEditableFontFamily): NativeEditableFontFamily {
  return cjkLanguageForScript(detectScript(text)) ?? fallback ?? "Helvetica";
}

function tableCells(object: Extract<NativePageObject, { type: "table" }>): NativeTableEditCell[] {
  return object.cells.map((cell) => ({
    id: cell.id,
    row: cell.row,
    column: cell.column,
    rowSpan: Math.max(1, cell.rowSpan ?? 1),
    columnSpan: Math.max(1, cell.columnSpan ?? 1),
    text: cell.text,
    fontSize: Math.max(4, cell.fontSize ?? 10),
    fontFamily: tableFamily(cell.text, cell.fontFamily),
    align: cell.align ?? "left",
    verticalAlign: cell.verticalAlign ?? "middle",
    fillColor: cell.fillColor,
    textColor: cell.textColor ?? "#111111"
  }));
}

function tableGeometryEdit(object: Extract<NativePageObject, { type: "table" }>, bounds: NativeRect, queuedEdits: NativeEdit[]): NativeTableEdit | undefined {
  if (object.editability === "unsupported" || object.complexContent) return undefined;
  const existing = queuedEdits.find((edit): edit is NativeTableEdit => edit.kind === "table" && edit.objectId === object.id);
  return existing ? { ...structuredClone(existing), action: "rebuild", bounds, sourceBounds: existing.sourceBounds ?? object.bounds } : {
    id: crypto.randomUUID(),
    kind: "table",
    objectId: object.id,
    pageNumber: object.pageNumber,
    action: "rebuild",
    sourceBounds: object.bounds,
    bounds,
    rows: object.rows,
    columns: object.columns,
    rowHeights: defaultSizes(object.rowHeights, object.rows, object.bounds.h),
    columnWidths: defaultSizes(object.columnWidths, object.columns, object.bounds.w),
    headerRows: object.headerRows ?? 0,
    borderColor: object.borderColor ?? "#444444",
    borderWidth: object.borderWidth ?? 1,
    borderStyle: "solid",
    cellPadding: object.cellPadding ?? 4,
    cells: tableCells(object)
  };
}

export interface NativeGeometryResult {
  edit?: NativeEdit;
  blocked?: string;
}

export function nativeGeometryEdit(object: NativePageObject, bounds: NativeRect, queuedEdits: NativeEdit[]): NativeGeometryResult {
  const support = nativeTransformSupport(object, queuedEdits);
  if (!support.movable && !support.resizable) return { blocked: support.reason ?? "This object cannot be transformed safely." };
  if (object.type === "text") {
    const edit = textGeometryEdit(object, bounds, queuedEdits);
    return edit ? { edit } : { blocked: "The text would not fit the requested destination or is controlled by a queued layout-aware reflow." };
  }
  if (object.type === "image") return { edit: imageGeometryEdit(object, bounds, queuedEdits) };
  if (object.type === "vector") {
    const edit = vectorGeometryEdit(object, bounds, queuedEdits);
    return edit ? { edit } : { blocked: support.reason ?? "This vector cannot be transformed safely." };
  }
  if (object.type === "table") {
    const edit = tableGeometryEdit(object, bounds, queuedEdits);
    return edit ? { edit } : { blocked: support.reason ?? "This table cannot be transformed safely." };
  }
  if (object.type === "complex") {
    const edit = complexGeometryEdit(object, bounds, queuedEdits);
    return edit ? { edit } : { blocked: support.reason ?? "This nested PDF group cannot be transformed safely." };
  }
  return { blocked: support.reason ?? "This object type does not expose editable geometry." };
}

export function nativeDeleteEdit(object: NativePageObject, queuedEdits: NativeEdit[]): NativeGeometryResult {
  if (object.type === "image") return { edit: { ...imageGeometryEdit(object, effectiveNativeBounds(object, queuedEdits), queuedEdits), action: "delete" } };
  if (object.type === "vector") {
    const edit = vectorGeometryEdit(object, effectiveNativeBounds(object, queuedEdits), queuedEdits);
    return edit ? { edit: { ...edit, action: "delete" } } : { blocked: "Clip-protected vectors cannot be deleted safely." };
  }
  if (object.type === "table") {
    const edit = tableGeometryEdit(object, effectiveNativeBounds(object, queuedEdits), queuedEdits);
    return edit ? { edit: { ...edit, action: "delete" } } : { blocked: "This table cannot be deleted safely as one structured object." };
  }
  if (object.type === "complex") {
    const edit = complexGeometryEdit(object, effectiveNativeBounds(object, queuedEdits), queuedEdits);
    return edit ? { edit: { ...edit, action: "delete" } } : { blocked: "This nested PDF group cannot be deleted safely." };
  }
  return { blocked: object.type === "text" ? "P6 does not delete source text by broad rectangular redaction; edit its content through the qualified text panel instead." : "Interactive form fields are not deleted by the value-editing engine." };
}

export function nativeRotationEdit(object: NativePageObject, deltaDegrees: number, queuedEdits: NativeEdit[]): NativeGeometryResult {
  const bounds = effectiveNativeBounds(object, queuedEdits);
  if (object.type === "vector") {
    const edit = vectorGeometryEdit(object, bounds, queuedEdits);
    return edit ? { edit: { ...edit, rotation: finite(edit.rotation) + deltaDegrees } } : { blocked: "This vector cannot be rotated safely." };
  }
  if (object.type === "image") {
    const edit = imageGeometryEdit(object, bounds, queuedEdits);
    const current = finite(edit.rotation ?? 0);
    const normalized = ((Math.round((current + deltaDegrees) / 90) * 90) % 360 + 360) % 360 as 0 | 90 | 180 | 270;
    return { edit: { ...edit, rotation: normalized } };
  }
  if (object.type === "complex") {
    const edit = complexGeometryEdit(object, bounds, queuedEdits);
    return edit ? { edit: { ...edit, rotation: finite(edit.rotation) + deltaDegrees } } : { blocked: "This nested PDF group cannot be rotated safely." };
  }
  return { blocked: "This existing-content engine does not expose safe rotation for the selected object type." };
}

export function moveBounds(bounds: UnifiedCanvasBounds, dx: number, dy: number): UnifiedCanvasBounds {
  return { ...bounds, x: bounds.x + dx, y: bounds.y + dy };
}

export function clampCanvasBounds(bounds: UnifiedCanvasBounds, pageWidth: number, pageHeight: number): UnifiedCanvasBounds {
  const w = Math.min(Math.max(1, bounds.w), Math.max(1, pageWidth));
  const h = Math.min(Math.max(1, bounds.h), Math.max(1, pageHeight));
  return {
    x: Math.max(0, Math.min(Math.max(0, pageWidth - w), bounds.x)),
    y: Math.max(0, Math.min(Math.max(0, pageHeight - h), bounds.y)),
    w,
    h
  };
}

export function alignBounds(items: UnifiedLayoutItem[], mode: UnifiedAlign, pageSize?: { width: number; height: number }): Map<string, UnifiedCanvasBounds> {
  const movable = items.filter((item) => item.movable);
  if (!movable.length) return new Map();
  const left = pageSize ? 0 : Math.min(...movable.map((item) => item.bounds.x));
  const right = pageSize ? pageSize.width : Math.max(...movable.map((item) => item.bounds.x + item.bounds.w));
  const top = pageSize ? 0 : Math.min(...movable.map((item) => item.bounds.y));
  const bottom = pageSize ? pageSize.height : Math.max(...movable.map((item) => item.bounds.y + item.bounds.h));
  const center = (left + right) / 2;
  const middle = (top + bottom) / 2;
  const result = new Map<string, UnifiedCanvasBounds>();
  for (const item of movable) {
    const bounds = { ...item.bounds };
    if (mode === "left") bounds.x = left;
    else if (mode === "right") bounds.x = right - bounds.w;
    else if (mode === "center") bounds.x = center - bounds.w / 2;
    else if (mode === "top") bounds.y = top;
    else if (mode === "bottom") bounds.y = bottom - bounds.h;
    else bounds.y = middle - bounds.h / 2;
    result.set(item.key, bounds);
  }
  return result;
}

export function distributeBounds(items: UnifiedLayoutItem[], axis: UnifiedDistributionAxis): Map<string, UnifiedCanvasBounds> {
  const movable = items.filter((item) => item.movable);
  if (movable.length < 3) return new Map();
  const sorted = [...movable].sort((a, b) => axis === "horizontal"
    ? (a.bounds.x + a.bounds.w / 2) - (b.bounds.x + b.bounds.w / 2)
    : (a.bounds.y + a.bounds.h / 2) - (b.bounds.y + b.bounds.h / 2));
  const center = (item: UnifiedLayoutItem) => axis === "horizontal" ? item.bounds.x + item.bounds.w / 2 : item.bounds.y + item.bounds.h / 2;
  const first = center(sorted[0]);
  const last = center(sorted[sorted.length - 1]);
  const step = (last - first) / (sorted.length - 1);
  return new Map(sorted.map((item, index) => {
    const bounds = { ...item.bounds };
    const target = first + step * index;
    if (axis === "horizontal") bounds.x = target - bounds.w / 2;
    else bounds.y = target - bounds.h / 2;
    return [item.key, bounds];
  }));
}

export function matchSizeBounds(items: UnifiedLayoutItem[], referenceKey: string, dimension: "width" | "height" | "both"): Map<string, UnifiedCanvasBounds> {
  const reference = items.find((item) => item.key === referenceKey);
  if (!reference) return new Map();
  const result = new Map<string, UnifiedCanvasBounds>();
  for (const item of items.filter((candidate) => candidate.resizable)) {
    const bounds = { ...item.bounds };
    if (dimension === "width" || dimension === "both") bounds.w = reference.bounds.w;
    if (dimension === "height" || dimension === "both") bounds.h = reference.bounds.h;
    result.set(item.key, bounds);
  }
  return result;
}

export function boundsIntersects(a: UnifiedCanvasBounds, b: UnifiedCanvasBounds): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
