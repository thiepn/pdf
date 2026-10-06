import type { BatchRecipe, BatchStep } from "../types/batch";

export const CURRENT_BATCH_SCHEMA_VERSION = 4;
function randomStepId(): string { return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
export function normalizeBatchBlankPageCount(value: number): number { return Number.isFinite(value) ? Math.max(1, Math.min(20, Math.round(value))) : 1; }
export function batchStepLabel(step: BatchStep): string {
  switch (step.type) {
    case "rotate": return `Rotate ${step.degrees}°`;
    case "optimize": return "Compress without page images";
    case "remove-metadata": return "Remove metadata";
    case "crop": return "Crop margins";
    case "decorate": return "Watermark / numbering";
    case "blank-pages": return "Insert blank pages";
    case "raster-compress": return `Stronger image compression · ${step.profile}`;
    case "grayscale": return `Grayscale · ${step.profile}`;
    case "extract-pages": return `Extract pages · ${step.selection}`;
    case "remove-pages": return `Remove pages · ${step.selection}`;
    case "flatten": return `Flatten · ${[step.flattenForms ? "forms" : "", step.flattenAnnotations ? "annotations" : ""].filter(Boolean).join(" + ")}`;
    case "sanitize": return `Clean risky content${step.removeAttachments || step.removeMetadata ? " + extras" : ""}`;
    case "target-size": return `Target size · ${Math.max(1, Math.round(step.targetBytes)).toLocaleString()} bytes · ${step.preservation === "preserve-structure" ? "keep structure" : "target priority"}`;
    case "split-fixed": return `Split · ${step.pagesPerFile} page(s) per PDF`;
    case "page-images": return `Page images · ${step.quality}`;
  }
}
export function defaultBatchStep(type: BatchStep["type"], id = randomStepId()): BatchStep {
  if (type === "rotate") return { id, type, degrees: 90 };
  if (type === "optimize") return { id, type };
  if (type === "remove-metadata") return { id, type };
  if (type === "crop") return { id, type, topMm: 0, rightMm: 0, bottomMm: 0, leftMm: 0 };
  if (type === "decorate") return { id, type, watermarkText: "", headerText: "", footerText: "", pageNumbers: true, startNumber: 1, fontLanguage: "auto" };
  if (type === "blank-pages") return { id, type, position: "end", count: 1, widthMm: 210, heightMm: 297 };
  if (type === "grayscale") return { id, type, profile: "balanced" };
  if (type === "extract-pages") return { id, type, selection: "1-last" };
  if (type === "remove-pages") return { id, type, selection: "1" };
  if (type === "flatten") return { id, type, flattenForms: true, flattenAnnotations: true };
  if (type === "sanitize") return { id, type, removeAttachments: true, removeMetadata: true };
  if (type === "target-size") return { id, type, targetBytes: 2_000_000, preservation: "preserve-structure" };
  if (type === "split-fixed") return { id, type, pagesPerFile: 10 };
  if (type === "page-images") return { id, type, quality: "balanced" };
  return { id, type: "raster-compress", profile: "balanced" };
}

export function migrateBatchRecipe(recipe: BatchRecipe, now = Date.now(), idFactory: () => string = randomStepId): BatchRecipe {
  const schemaVersion = Number(recipe?.schemaVersion);
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) throw new Error("This saved workflow has an invalid format version.");
  if (schemaVersion > CURRENT_BATCH_SCHEMA_VERSION) throw new Error("This saved workflow was created by a newer PDF Studio version. Update the app before opening or changing it.");
  if (schemaVersion === CURRENT_BATCH_SCHEMA_VERSION && Array.isArray(recipe.steps)) return recipe;
  if (schemaVersion >= 2 && schemaVersion < CURRENT_BATCH_SCHEMA_VERSION && Array.isArray(recipe.steps)) {
    return { ...recipe, schemaVersion: CURRENT_BATCH_SCHEMA_VERSION, updatedAt: now };
  }
  const steps: BatchStep[] = [];
  if (recipe.rotate) steps.push({ id: idFactory(), type: "rotate", degrees: recipe.rotate });
  if (recipe.compression === "lossless") steps.push({ id: idFactory(), type: "optimize" });
  else if (recipe.compression === "screen" || recipe.compression === "balanced" || recipe.compression === "small" || recipe.compression === "print") steps.push({ id: idFactory(), type: "raster-compress", profile: recipe.compression });
  if (recipe.removeMetadata) steps.push({ id: idFactory(), type: "remove-metadata" });
  return { schemaVersion: CURRENT_BATCH_SCHEMA_VERSION, id: recipe.id, name: recipe.name, steps, outputSuffix: recipe.outputSuffix || "processed", updatedAt: now };
}

/**
 * Identifies only the ordered processing semantics that determine output bytes.
 * Recipe names, ids, timestamps, step ids, and outputSuffix are intentionally
 * excluded so cosmetic edits do not invalidate otherwise-current output.
 */
export function batchRecipeExecutionFingerprint(recipe: BatchRecipe): string {
  const normalized = migrateBatchRecipe(recipe);
  return JSON.stringify(normalized.steps.map((step) => {
    const { id: _id, ...execution } = step;
    return execution;
  }));
}

const KNOWN_STEP_TYPES = new Set<BatchStep["type"]>(["rotate","optimize","remove-metadata","crop","decorate","blank-pages","raster-compress","grayscale","extract-pages","remove-pages","flatten","sanitize","target-size","split-fixed","page-images"]);

export function validateBatchRecipe(recipe: BatchRecipe): BatchRecipe {
  const migrated = migrateBatchRecipe(recipe);
  if (!Array.isArray(migrated.steps) || !migrated.steps.length) throw new Error("This workflow must contain at least one processing step.");
  for (const [index, step] of migrated.steps.entries()) {
    if (!step || typeof step !== "object" || !KNOWN_STEP_TYPES.has(step.type)) throw new Error("This workflow contains an unsupported processing step.");
    if ((step.type === "split-fixed" || step.type === "page-images") && index !== migrated.steps.length - 1) throw new Error("Split PDF and Export page images must be the final workflow step.");
    if ((step.type === "extract-pages" || step.type === "remove-pages") && !String(step.selection ?? "").trim()) throw new Error("Extract/Remove pages steps need a page expression.");
    if (step.type === "flatten" && !step.flattenForms && !step.flattenAnnotations) throw new Error("Flatten must include forms, annotations, or both.");
    if (step.type === "target-size" && (!Number.isFinite(step.targetBytes) || step.targetBytes < 1 || !["preserve-structure","allow-raster"].includes(step.preservation))) throw new Error("Target-size compression has invalid settings.");
  }
  return migrated;
}
export function parseBatchRecipeJson(source: string): BatchRecipe {
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error("This workflow file could not be read."); }
  if (!parsed || typeof parsed !== "object") throw new Error("This workflow file is not valid.");
  const input = parsed as Partial<BatchRecipe>;
  if (!String(input.name ?? "").trim()) throw new Error("This workflow file is missing a name.");
  const migrated = validateBatchRecipe(input as BatchRecipe);
  return { ...migrated, id: randomStepId(), name: String(migrated.name).trim().slice(0, 120), outputSuffix: String(migrated.outputSuffix || "processed").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "processed", updatedAt: Date.now() };
}
export function serializeBatchRecipe(recipe: BatchRecipe): string {
  const normalized = migrateBatchRecipe(recipe);
  return JSON.stringify({ schemaVersion: CURRENT_BATCH_SCHEMA_VERSION, name: normalized.name, steps: normalized.steps, outputSuffix: normalized.outputSuffix }, null, 2);
}
