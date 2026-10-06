import { quickTaskIds, type QuickTaskId } from "../quick/quickModel";
import type { BatchStep } from "../types/batch";

export type BatchCapabilityStatus = "recipe" | "terminal" | "boundary";

export interface BatchCapability {
  taskId: QuickTaskId;
  status: BatchCapabilityStatus;
  batchSteps: BatchStep["type"][];
  reason: string;
}

export const BATCH_CAPABILITY_MATRIX: readonly BatchCapability[] = [
  { taskId: "merge-pdfs", status: "boundary", batchSteps: [], reason: "Merge is a multi-input composition operation; a per-file linear recipe has no deterministic peer-input binding." },
  { taskId: "organize-pages", status: "boundary", batchSteps: [], reason: "Visual per-document page arrangement is document-specific rather than a reusable linear recipe." },
  { taskId: "split-pdf", status: "terminal", batchSteps: ["split-fixed"], reason: "Batch supports deterministic fixed-page chunks as the final step; arbitrary per-file range groups remain interactive." },
  { taskId: "extract-pages", status: "recipe", batchSteps: ["extract-pages"], reason: "The same page expression is evaluated against each step input and produces one PDF." },
  { taskId: "remove-pages", status: "recipe", batchSteps: ["remove-pages"], reason: "The same page expression is evaluated against each step input; removing every current page fails closed." },
  { taskId: "rotate-pdf", status: "recipe", batchSteps: ["rotate"], reason: "Rotation is deterministic and preserves the single-PDF pipeline." },
  { taskId: "pdf-to-jpg", status: "boundary", batchSteps: [], reason: "Batch does not add a second image-export terminal format while page-image ZIP is qualified as PNG." },
  { taskId: "pdf-to-png", status: "terminal", batchSteps: ["page-images"], reason: "Page-image ZIP is a terminal multi-output operation with deterministic source-page ordering." },
  { taskId: "pdf-to-text", status: "boundary", batchSteps: [], reason: "Text export changes the pipeline artifact type and is not yet a qualified Batch terminal format." },
  { taskId: "images-to-pdf", status: "boundary", batchSteps: [], reason: "Images-to-PDF starts from non-PDF multi-input material rather than queued PDF items." },
  { taskId: "compress-pdf", status: "recipe", batchSteps: ["optimize", "raster-compress", "target-size"], reason: "Lossless, raster-profile, and bounded target-size compression have deterministic per-file semantics." },
  { taskId: "pdf-to-docx", status: "boundary", batchSteps: [], reason: "DOCX changes the artifact type and layout warnings need a dedicated terminal Batch contract." },
  { taskId: "flatten-pdf", status: "recipe", batchSteps: ["flatten"], reason: "Qualified form/annotation flattening produces one PDF and composes linearly." },
  { taskId: "sanitize-pdf", status: "recipe", batchSteps: ["sanitize"], reason: "Active-content cleanup is deterministic and composes linearly; it is explicitly not redaction or malware certification." },
  { taskId: "remove-metadata", status: "recipe", batchSteps: ["remove-metadata"], reason: "Metadata removal is deterministic and produces one PDF." },
  { taskId: "repair-pdf", status: "boundary", batchSteps: [], reason: "Repair is a recovery workflow for damaged inputs and requires review; it is not treated as an ordinary reusable mutation." },
  { taskId: "unlock-pdf", status: "boundary", batchSteps: [], reason: "Opening encrypted queue items is handled as session-only input credential state, not a persisted recipe step." },
  { taskId: "password-protect", status: "boundary", batchSteps: [], reason: "Output passwords are secrets and must not be persisted inside reusable recipe JSON." },
  { taskId: "add-page-numbers", status: "recipe", batchSteps: ["decorate"], reason: "Batch decoration provides deterministic numbering/header/footer/watermark output." },
  { taskId: "add-watermark", status: "recipe", batchSteps: ["decorate"], reason: "Batch decoration provides deterministic numbering/header/footer/watermark output." },
  { taskId: "crop-pages", status: "recipe", batchSteps: ["crop"], reason: "Crop margins are deterministic and preserve the single-PDF pipeline." }
] as const;

export function batchCapabilityForTask(taskId: QuickTaskId): BatchCapability {
  const capability = BATCH_CAPABILITY_MATRIX.find((entry) => entry.taskId === taskId);
  if (!capability) throw new Error(`Batch capability matrix is missing ${taskId}.`);
  return capability;
}

export function assertCompleteBatchCapabilityMatrix(): void {
  const ids = new Set(BATCH_CAPABILITY_MATRIX.map((entry) => entry.taskId));
  if (ids.size !== BATCH_CAPABILITY_MATRIX.length) throw new Error("Batch capability matrix contains duplicate standalone tasks.");
  for (const taskId of quickTaskIds) if (!ids.has(taskId)) throw new Error(`Batch capability matrix is missing ${taskId}.`);
}
