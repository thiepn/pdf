import { idbDelete, idbDeleteAllByIndex, idbGet, idbGetAllByIndex, idbPut } from "../storage/database";
import { EDITOR_SCHEMA_VERSION, type EditorAssetRecord, type EditorDocumentState } from "../types/editor";
import { createEditorState } from "./editorModel";
import { assertReadableStateSchema } from "../projects/stateSchemaGuard";

export async function readEditorState(projectId: string): Promise<EditorDocumentState> {
  const stored = await idbGet<EditorDocumentState>("editorStates", projectId);
  if (!stored) return createEditorState(projectId);
  const schemaVersion = assertReadableStateSchema(stored.schemaVersion, EDITOR_SCHEMA_VERSION, "Editor state");
  if (schemaVersion < EDITOR_SCHEMA_VERSION) return migrateEditorState(stored);
  return stored;
}

export async function writeEditorState(state: EditorDocumentState): Promise<void> {
  await idbPut("editorStates", { ...state, schemaVersion: EDITOR_SCHEMA_VERSION, updatedAt: Date.now() });
}

export async function deleteEditorState(projectId: string): Promise<void> {
  await Promise.allSettled([
    idbDelete("editorStates", projectId),
    idbDeleteAllByIndex("editorAssets", "projectId", projectId)
  ]);
}

export async function writeEditorAsset(asset: EditorAssetRecord): Promise<void> {
  await idbPut("editorAssets", asset);
}

export async function readEditorAsset(assetId: string): Promise<EditorAssetRecord | undefined> {
  return idbGet<EditorAssetRecord>("editorAssets", assetId);
}

export async function listEditorAssets(projectId: string): Promise<EditorAssetRecord[]> {
  return idbGetAllByIndex<EditorAssetRecord>("editorAssets", "projectId", projectId);
}

export async function deleteEditorAsset(assetId: string): Promise<void> {
  await idbDelete("editorAssets", assetId);
}

function migrateEditorState(state: EditorDocumentState): EditorDocumentState {
  return {
    ...createEditorState(state.projectId),
    ...state,
    objects: (state.objects ?? []).map((object) => object.type === "highlight" ? { ...object, style: (object as { style?: "highlight" | "underline" | "strikeout" | "squiggly" }).style ?? "highlight" } : object),
    schemaVersion: EDITOR_SCHEMA_VERSION,
    updatedAt: Date.now()
  };
}
