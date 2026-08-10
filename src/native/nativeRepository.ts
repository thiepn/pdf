import { idbDelete, idbGet, idbPut } from "../storage/database";
import { NATIVE_EDITOR_SCHEMA_VERSION, type NativeEditorState } from "../types/nativeEditor";
import { assertReadableStateSchema } from "../projects/stateSchemaGuard";

export async function readNativeState(projectId: string): Promise<NativeEditorState> {
  const stored = await idbGet<NativeEditorState>("nativeStates", projectId);
  if (!stored) return { projectId, schemaVersion: NATIVE_EDITOR_SCHEMA_VERSION, pageNumber: 1, queuedEdits: [], updatedAt: Date.now() };
  const schemaVersion = assertReadableStateSchema(stored.schemaVersion, NATIVE_EDITOR_SCHEMA_VERSION, "Native editor state");
  return { ...stored, schemaVersion: NATIVE_EDITOR_SCHEMA_VERSION, queuedEdits: Array.isArray(stored.queuedEdits) ? stored.queuedEdits : [], updatedAt: schemaVersion < NATIVE_EDITOR_SCHEMA_VERSION ? Date.now() : stored.updatedAt };
}

export async function writeNativeState(state: NativeEditorState) {
  await idbPut("nativeStates", { ...state, schemaVersion: NATIVE_EDITOR_SCHEMA_VERSION, updatedAt: Date.now() });
}

export async function deleteNativeState(projectId: string) {
  await idbDelete("nativeStates", projectId);
}
