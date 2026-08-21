import { idbDelete, idbGet, idbPut } from "../storage/database";
import {
  NATIVE_EDITOR_SCHEMA_VERSION,
  type NativeComplexEdit,
  type NativeEdit,
  type NativeEditorState,
  type NativeImageEdit,
  type NativeRect,
  type NativeTableEdit,
  type NativeTextEdit,
  type NativeVectorEdit
} from "../types/nativeEditor";
import { assertReadableStateSchema } from "../projects/stateSchemaGuard";

function bytesFromStored(value: unknown): Uint8Array | undefined {
  if (!value) return undefined;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return new Uint8Array(value.map(Number));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const numericKeys = Object.keys(record).filter((key) => /^\d+$/.test(key)).sort((a, b) => Number(a) - Number(b));
    if (numericKeys.length) return new Uint8Array(numericKeys.map((key) => Number(record[key]) || 0));
  }
  return undefined;
}

function finite(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizedRect(rect: NativeRect): NativeRect {
  const x = finite(rect?.x, 0);
  const y = finite(rect?.y, 0);
  const w = Math.max(0.01, Math.abs(finite(rect?.w, 0.01)));
  const h = Math.max(0.01, Math.abs(finite(rect?.h, 0.01)));
  return { x, y, w, h };
}

function normalizeVectorEdit(edit: NativeVectorEdit & Record<string, unknown>): NativeVectorEdit {
  const sourceBounds = normalizedRect((edit.sourceBounds as NativeRect | undefined) ?? edit.bounds);
  const legacyDx = finite(edit.dx, 0);
  const legacyDy = finite(edit.dy, 0);
  const legacyScaleX = Math.max(0.001, Math.abs(finite(edit.scaleX, 1)));
  const legacyScaleY = Math.max(0.001, Math.abs(finite(edit.scaleY, 1)));
  const hasP4Bounds = Boolean(edit.sourceBounds);
  const bounds = hasP4Bounds
    ? normalizedRect(edit.bounds)
    : { x: sourceBounds.x + legacyDx, y: sourceBounds.y + legacyDy, w: sourceBounds.w * legacyScaleX, h: sourceBounds.h * legacyScaleY };
  const legacyAction = String(edit.action ?? "edit");
  const action: NativeVectorEdit["action"] = legacyAction === "delete" ? "delete" : "edit";
  const appearanceOverride = typeof edit.appearanceOverride === "boolean" ? edit.appearanceOverride : legacyAction === "restyle";
  const fillEnabled = typeof edit.fillEnabled === "boolean" ? edit.fillEnabled : Boolean(edit.fillColor);
  const strokeEnabled = typeof edit.strokeEnabled === "boolean" ? edit.strokeEnabled : Boolean(edit.strokeColor) || !fillEnabled;
  const lineCap = ["Butt", "Round", "Square"].includes(String(edit.lineCap)) ? edit.lineCap as NativeVectorEdit["lineCap"] : "Butt";
  const lineJoin = ["Miter", "Round", "Bevel"].includes(String(edit.lineJoin)) ? edit.lineJoin as NativeVectorEdit["lineJoin"] : "Miter";
  const dashPattern = Array.isArray(edit.dashPattern) ? edit.dashPattern.map((value) => Math.max(0, finite(value, 0))).filter(Number.isFinite) : [];
  return {
    id: edit.id,
    kind: "vector",
    objectId: edit.objectId,
    pageNumber: edit.pageNumber,
    action,
    bounds,
    sourceBounds,
    sourceStreamIndex: Number.isInteger(edit.sourceStreamIndex) ? Number(edit.sourceStreamIndex) : undefined,
    sourcePathIndex: Number.isInteger(edit.sourcePathIndex) ? Number(edit.sourcePathIndex) : undefined,
    sourceSignature: typeof edit.sourceSignature === "string" ? edit.sourceSignature : undefined,
    commands: Array.isArray(edit.commands) ? edit.commands : [],
    paint: ["fill", "stroke", "fill-stroke"].includes(String(edit.paint)) ? edit.paint as NativeVectorEdit["paint"] : fillEnabled && strokeEnabled ? "fill-stroke" : fillEnabled ? "fill" : "stroke",
    rotation: finite(edit.rotation, 0),
    appearanceOverride,
    fillEnabled,
    strokeEnabled,
    fillColor: typeof edit.fillColor === "string" ? edit.fillColor : undefined,
    strokeColor: typeof edit.strokeColor === "string" ? edit.strokeColor : undefined,
    lineWidth: Math.max(0.01, finite(edit.lineWidth, 1)),
    lineCap,
    lineJoin,
    miterLimit: Math.max(1, finite(edit.miterLimit, 10)),
    dashPattern,
    dashPhase: finite(edit.dashPhase, 0),
    alpha: Math.max(0, Math.min(1, finite(edit.alpha, 1))),
    evenOdd: Boolean(edit.evenOdd)
  };
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function normalizeTableEdit(edit: NativeTableEdit & Record<string, unknown>): NativeTableEdit {
  const bounds = normalizedRect(edit.bounds);
  const sourceBounds = normalizedRect((edit.sourceBounds as NativeRect | undefined) ?? edit.bounds);
  const rows = Math.max(1, Math.min(100, Math.floor(finite(edit.rows, 1))));
  const columns = Math.max(1, Math.min(50, Math.floor(finite(edit.columns, 1))));
  const rowHeights = Array.from({ length: rows }, (_, index) => Math.max(1, finite(Array.isArray(edit.rowHeights) ? edit.rowHeights[index] : undefined, bounds.h / rows)));
  const columnWidths = Array.from({ length: columns }, (_, index) => Math.max(1, finite(Array.isArray(edit.columnWidths) ? edit.columnWidths[index] : undefined, bounds.w / columns)));
  const validFamilies = new Set(["Helvetica", "Times-Roman", "Courier", "ko", "ja", "zh-Hans", "zh-Hant"]);
  const cells = (Array.isArray(edit.cells) ? edit.cells : []).map((raw, index) => {
    const cell = raw as NativeTableEdit["cells"][number] & Record<string, unknown>;
    const row = Math.max(0, Math.min(rows - 1, Math.floor(finite(cell.row, 0))));
    const column = Math.max(0, Math.min(columns - 1, Math.floor(finite(cell.column, 0))));
    const rowSpan = Math.max(1, Math.min(rows - row, Math.floor(finite(cell.rowSpan, 1))));
    const columnSpan = Math.max(1, Math.min(columns - column, Math.floor(finite(cell.columnSpan, 1))));
    const family = validFamilies.has(String(cell.fontFamily)) ? cell.fontFamily as NativeTableEdit["cells"][number]["fontFamily"] : "Helvetica";
    const align = ["left", "center", "right"].includes(String(cell.align)) ? cell.align as NativeTableEdit["cells"][number]["align"] : "left";
    const verticalAlign = ["top", "middle", "bottom"].includes(String(cell.verticalAlign)) ? cell.verticalAlign as NativeTableEdit["cells"][number]["verticalAlign"] : "middle";
    return {
      id: typeof cell.id === "string" && cell.id ? cell.id : `${edit.objectId}:cell:${index}`,
      row,
      column,
      rowSpan,
      columnSpan,
      text: typeof cell.text === "string" ? cell.text : "",
      fontSize: Math.max(4, Math.min(72, finite(cell.fontSize, 10))),
      fontFamily: family,
      align,
      verticalAlign,
      fillColor: typeof cell.fillColor === "string" && /^#[0-9a-f]{6}$/i.test(cell.fillColor) ? cell.fillColor.toLowerCase() : undefined,
      textColor: color(cell.textColor, "#111111")
    };
  });
  return {
    id: edit.id,
    kind: "table",
    objectId: edit.objectId,
    pageNumber: Math.max(1, Math.floor(finite(edit.pageNumber, 1))),
    action: edit.action === "delete" ? "delete" : "rebuild",
    sourceBounds,
    bounds,
    rows,
    columns,
    rowHeights,
    columnWidths,
    headerRows: Math.max(0, Math.min(rows, Math.floor(finite(edit.headerRows, 0)))),
    borderColor: color(edit.borderColor, "#444444"),
    borderWidth: Math.max(0, Math.min(20, finite(edit.borderWidth, 1))),
    borderStyle: ["solid", "dashed", "none"].includes(String(edit.borderStyle)) ? edit.borderStyle as NativeTableEdit["borderStyle"] : "solid",
    cellPadding: Math.max(0, Math.min(50, finite(edit.cellPadding, 4))),
    cells
  };
}

function normalizeComplexEdit(edit: NativeComplexEdit & Record<string, unknown>): NativeComplexEdit {
  const sourceBounds = normalizedRect((edit.sourceBounds as NativeRect | undefined) ?? edit.bounds);
  const bounds = normalizedRect((edit.bounds as NativeRect | undefined) ?? sourceBounds);
  return {
    id: edit.id,
    kind: "complex",
    objectId: edit.objectId,
    pageNumber: Math.max(1, Math.floor(finite(edit.pageNumber, 1))),
    action: edit.action === "delete" ? "delete" : "transform",
    sourceBounds,
    bounds,
    resourceName: typeof edit.resourceName === "string" ? edit.resourceName.replace(/^\//, "") : "",
    sourceStreamIndex: Math.max(0, Math.floor(finite(edit.sourceStreamIndex, 0))),
    sourceInvocationIndex: Math.max(0, Math.floor(finite(edit.sourceInvocationIndex, 0))),
    sourceSignature: typeof edit.sourceSignature === "string" ? edit.sourceSignature : "",
    rotation: finite(edit.rotation, 0)
  };
}

function normalizeEdit(edit: NativeEdit): NativeEdit {
  if (edit.kind === "image") {
    const stored = edit as NativeImageEdit & { bytes?: unknown };
    const bytes = bytesFromStored(stored.bytes);
    const action = stored.action ?? (bytes?.byteLength ? "replace" : "transform");
    const rotation = [0, 90, 180, 270].includes(Number(stored.rotation)) ? stored.rotation : 0;
    return {
      ...stored,
      action,
      bytes,
      mimeType: stored.mimeType || (bytes?.byteLength ? "image/png" : undefined),
      sourceBounds: stored.sourceBounds ?? stored.bounds,
      removeUnderlying: action === "transform" || action === "delete" ? true : stored.removeUnderlying !== false,
      fit: stored.fit ?? "contain",
      rotation,
      opacity: Math.max(0, Math.min(1, Number.isFinite(stored.opacity) ? Number(stored.opacity) : 1))
    };
  }
  if (edit.kind === "text") {
    const stored = edit as NativeTextEdit & { fontBytes?: unknown };
    const fontBytes = bytesFromStored(stored.fontBytes);
    return fontBytes ? { ...stored, fontBytes } : { ...stored, fontBytes: undefined };
  }
  if (edit.kind === "vector") return normalizeVectorEdit(edit as NativeVectorEdit & Record<string, unknown>);
  if (edit.kind === "table") return normalizeTableEdit(edit as NativeTableEdit & Record<string, unknown>);
  if (edit.kind === "complex") return normalizeComplexEdit(edit as NativeComplexEdit & Record<string, unknown>);
  return edit;
}

export async function readNativeState(projectId: string): Promise<NativeEditorState> {
  const stored = await idbGet<NativeEditorState>("nativeStates", projectId);
  if (!stored) return { projectId, schemaVersion: NATIVE_EDITOR_SCHEMA_VERSION, pageNumber: 1, queuedEdits: [], updatedAt: Date.now() };
  const schemaVersion = assertReadableStateSchema(stored.schemaVersion, NATIVE_EDITOR_SCHEMA_VERSION, "Native editor state");
  const queuedEdits = Array.isArray(stored.queuedEdits) ? stored.queuedEdits.map(normalizeEdit) : [];
  return { ...stored, schemaVersion: NATIVE_EDITOR_SCHEMA_VERSION, queuedEdits, updatedAt: schemaVersion < NATIVE_EDITOR_SCHEMA_VERSION ? Date.now() : stored.updatedAt };
}

export async function writeNativeState(state: NativeEditorState) {
  await idbPut("nativeStates", { ...state, schemaVersion: NATIVE_EDITOR_SCHEMA_VERSION, queuedEdits: state.queuedEdits.map(normalizeEdit), updatedAt: Date.now() });
}

export async function deleteNativeState(projectId: string) {
  await idbDelete("nativeStates", projectId);
}
