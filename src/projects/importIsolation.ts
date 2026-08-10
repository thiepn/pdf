import type { EditorAssetRecord, EditorDocumentState } from "../types/editor";

export interface IsolatedEditorImport {
  state?: EditorDocumentState;
  assets: EditorAssetRecord[];
}

/**
 * Editor assets use globally keyed IndexedDB records. Every imported project
 * therefore receives fresh asset IDs and its image objects are rewritten to
 * those new IDs so independently restored checkpoints cannot alias each other.
 */
export function isolateImportedEditorData(
  projectId: string,
  state: EditorDocumentState | undefined,
  assets: EditorAssetRecord[],
  createId: () => string
): IsolatedEditorImport {
  const assetIds = new Map<string, string>();
  const remapAssetId = (sourceId: string): string => {
    const existing = assetIds.get(sourceId);
    if (existing) return existing;
    const id = createId();
    assetIds.set(sourceId, id);
    return id;
  };
  const isolatedAssets = assets.map((asset) => ({ ...asset, id: remapAssetId(asset.id), projectId }));
  const isolatedState = state ? {
    ...state,
    projectId,
    objects: state.objects.map((object) => object.type === "image"
      ? { ...object, assetId: remapAssetId(object.assetId) }
      : object),
    updatedAt: Date.now()
  } : undefined;
  return { state: isolatedState, assets: isolatedAssets };
}
