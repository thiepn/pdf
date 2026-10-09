import type { BatchRecipe } from "../types/batch";
import { batchStepLabel } from "./batchModel";
import { actionFromBatchStep } from "../actions/actionCatalog";
import { runHeadlessSequence, type HeadlessSequenceResult } from "../actions/actionRunner";

export { batchStepLabel, defaultBatchStep } from "./batchModel";

/** Existing batch API, now backed by the same validated operations as headless callers. */
export interface BatchRunArtifact {
  bytes: Uint8Array;
  mimeType: "application/pdf" | "application/zip";
  extension: ".pdf" | ".zip";
  kind: "pdf" | "split-zip" | "images-zip";
}
export async function runBatchRecipe(
  bytes: Uint8Array,
  recipe: BatchRecipe,
  signal: AbortSignal,
  onProgress?: (progress:number,message:string)=>void
): Promise<BatchRunArtifact> {
  // The batch editor presents the selected steps and their lossy effects to the
  // user before they explicitly choose Run. No guessed steps or unlisted ops.
  const requests = recipe.steps.map(actionFromBatchStep);
  const result: HeadlessSequenceResult = await runHeadlessSequence(bytes,requests,{signal,onProgress});
  return {bytes:result.bytes,mimeType:result.mimeType,extension:result.extension,kind:result.kind};
}
