import { idbDelete, idbGet, idbPut } from "../storage/database";
import {
  NATIVE_EDITOR_SCHEMA_VERSION,
  type NativeEdit,
  type NativeEditorState,
  type NativeImageEdit,
  type NativeRect,
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
