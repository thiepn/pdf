import { idbDelete, idbGet, idbPut } from "../storage/database";
import { NATIVE_EDITOR_SCHEMA_VERSION, type NativeEdit, type NativeEditorState, type NativeImageEdit, type NativeTextEdit } from "../types/nativeEditor";
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
