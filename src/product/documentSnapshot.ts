import type { EditorObject, ImageEditorObject } from "../types/editor";
import type { NativeEdit } from "../types/nativeEditor";
import { safeOutputName } from "../quick/quickModel";

export interface SnapshotSource { bytes: Uint8Array; objects: EditorObject[]; nativeEdits: NativeEdit[]; password?: string; filename: string }
export interface DocumentSnapshot { file: File; bytes: Uint8Array; password?: string; warnings: string[]; changed: boolean }
type Provider = () => SnapshotSource;
const liveProviders = new Map<string, Provider>();
const preparedProviders = new Map<string, (signal?: AbortSignal) => Promise<DocumentSnapshot>>();
export function registerPreparedDocumentSnapshot(projectId: string, provider: (signal?: AbortSignal) => Promise<DocumentSnapshot>): () => void {
  preparedProviders.set(projectId, provider);
  return () => { if (preparedProviders.get(projectId) === provider) preparedProviders.delete(projectId); };
}
/** Live state wins over autosave, including the last keystroke before switching tools. */
export function registerDocumentSnapshot(projectId: string, provider: Provider): () => void {
  liveProviders.set(projectId, provider);
  return () => { if (liveProviders.get(projectId) === provider) liveProviders.delete(projectId); };
}
export async function prepareDocumentSnapshot(projectId: string, signal?: AbortSignal): Promise<DocumentSnapshot> {
  signal?.throwIfAborted();
  const prepared = preparedProviders.get(projectId);
  if (prepared) return prepared(signal);
  const provider = liveProviders.get(projectId);
  let source: SnapshotSource;
  if (provider) source = provider();
  else {
    const [{ getProject, loadProjectBytes }, { readEditorState }, { readNativeState }, { readProjectSessionPassword }] = await Promise.all([
      import("../projects/projectRepository"), import("../editor/editorRepository"), import("../native/nativeRepository"), import("../security/sessionPasswords")
    ]);
    const project = await getProject(projectId); if (!project) throw new Error("This document is no longer available. Choose its PDF file instead.");
    const [bytes, editor, native] = await Promise.all([loadProjectBytes(project), readEditorState(projectId), readNativeState(projectId)]);
    source = { bytes, objects: editor.objects, nativeEdits: native.queuedEdits, filename: project.sourceFilename || project.name, password: readProjectSessionPassword(projectId) };
  }
  // Copy the exact state at the command boundary; asynchronous autosave cannot change it.
  const snapshot = { ...source, bytes: Uint8Array.from(source.bytes), objects: structuredClone(source.objects), nativeEdits: structuredClone(source.nativeEdits) };
  signal?.throwIfAborted();
  const visible = snapshot.objects.filter((object) => !object.hidden);
  const changed = visible.length > 0 || snapshot.nativeEdits.length > 0;
  let bytes = snapshot.bytes;
  const warnings: string[] = [];
  if (changed) {
    const [{ listEditorAssets }, { applyNativeEdits }, { exportEditorPdf }, { inspectPdfBytes, inspectPdfAnnotationInventory }] = await Promise.all([
      import("../editor/editorRepository"), import("../native/nativeClient"), import("../editor/editorExportClient"), import("../engines/pdfjs")
    ]);
    const affected = new Set([...visible.map((object) => object.pageNumber), ...snapshot.nativeEdits.map((edit) => edit.pageNumber)]);
    const assetIds = new Set(visible.filter((object): object is ImageEditorObject => object.type === "image").map((object) => object.assetId));
    const assets = (await listEditorAssets(projectId)).filter((asset) => assetIds.has(asset.id)).map((asset) => ({ id: asset.id, mimeType: asset.mimeType, bytes: asset.bytes.slice(0) }));
    if (assets.length !== assetIds.size) throw new Error("An image used in your edits is missing. Restore it before continuing; the original PDF has not been substituted.");
    const [before, inventory] = await Promise.all([inspectPdfBytes(bytes, snapshot.password), inspectPdfAnnotationInventory(bytes, snapshot.password, affected)]);
    if (snapshot.nativeEdits.length) {
      const native = await applyNativeEdits(bytes, snapshot.nativeEdits, snapshot.password, signal);
      bytes = Uint8Array.from(native.bytes); warnings.push(...native.report.warnings);
    }
    if (visible.length) {
      const output = await exportEditorPdf(bytes, snapshot.objects, assets, signal, snapshot.password);
      bytes = Uint8Array.from(output.bytes); warnings.push(...output.report.warnings);
      const afterInventory = await inspectPdfAnnotationInventory(bytes, snapshot.password, affected);
      if (afterInventory.annotationCount - inventory.annotationCount < output.report.annotationCount || afterInventory.linkCount - inventory.linkCount < output.report.linkCount) throw new Error("Some edits did not survive export. Your document stays open; no older copy was sent to the next tool.");
    }
    const after = await inspectPdfBytes(bytes, snapshot.password);
    if (after.pageCount !== before.pageCount) throw new Error("The edited PDF failed page-count verification. No older copy was substituted.");
    if (visible.some((object) => object.type === "redaction")) warnings.push("Marked redactions are not permanent removal. Use Apply redactions to remove sensitive content before sharing.");
  }
  signal?.throwIfAborted();
  return { bytes, file: new File([Uint8Array.from(bytes).buffer], safeOutputName(snapshot.filename, "pdf"), { type: "application/pdf" }), password: snapshot.password, warnings: [...new Set(warnings)], changed };
}
