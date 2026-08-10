import type { BatchRecipe, BatchStep } from "../types/batch";

export const CURRENT_BATCH_SCHEMA_VERSION = 3;
function randomStepId(): string { return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
export function normalizeBatchBlankPageCount(value: number): number { return Number.isFinite(value) ? Math.max(1, Math.min(20, Math.round(value))) : 1; }
export function batchStepLabel(step: BatchStep): string {
  switch (step.type) {
    case "rotate": return `Rotate ${step.degrees}°`;
    case "optimize": return "Lossless optimize";
    case "remove-metadata": return "Remove metadata";
    case "crop": return "Crop margins";
    case "decorate": return "Watermark / numbering";
    case "blank-pages": return "Insert blank pages";
    case "raster-compress": return `Raster compress · ${step.profile}`;
    case "grayscale": return `Grayscale · ${step.profile}`;
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
  if (type === "split-fixed") return { id, type, pagesPerFile: 10 };
  if (type === "page-images") return { id, type, quality: "balanced" };
  return { id, type: "raster-compress", profile: "balanced" };
}

export function migrateBatchRecipe(recipe: BatchRecipe, now = Date.now(), idFactory: () => string = randomStepId): BatchRecipe {
  const schemaVersion = Number(recipe?.schemaVersion);
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) throw new Error("Batch recipe has an invalid schema version.");
  if (schemaVersion > CURRENT_BATCH_SCHEMA_VERSION) throw new Error("This Batch recipe was created by a newer PDF Studio version. Update the app before opening or changing it.");
  if (schemaVersion === CURRENT_BATCH_SCHEMA_VERSION && Array.isArray(recipe.steps)) return recipe;
  if (schemaVersion === 2 && Array.isArray(recipe.steps)) return { ...recipe, schemaVersion: CURRENT_BATCH_SCHEMA_VERSION, updatedAt: now };
  const steps: BatchStep[] = [];
  if (recipe.rotate) steps.push({ id: idFactory(), type: "rotate", degrees: recipe.rotate });
  if (recipe.compression === "lossless") steps.push({ id: idFactory(), type: "optimize" });
  else if (recipe.compression === "screen" || recipe.compression === "balanced" || recipe.compression === "small" || recipe.compression === "print") steps.push({ id: idFactory(), type: "raster-compress", profile: recipe.compression });
  if (recipe.removeMetadata) steps.push({ id: idFactory(), type: "remove-metadata" });
  return { schemaVersion: CURRENT_BATCH_SCHEMA_VERSION, id: recipe.id, name: recipe.name, steps, outputSuffix: recipe.outputSuffix || "processed", updatedAt: now };
}

const KNOWN_STEP_TYPES = new Set<BatchStep["type"]>(["rotate","optimize","remove-metadata","crop","decorate","blank-pages","raster-compress","grayscale","split-fixed","page-images"]);
export function parseBatchRecipeJson(source: string): BatchRecipe {
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error("Recipe file is not valid JSON."); }
  if (!parsed || typeof parsed !== "object") throw new Error("Recipe JSON must contain an object.");
  const input = parsed as Partial<BatchRecipe>;
  if (!String(input.name ?? "").trim()) throw new Error("Recipe JSON is missing a name.");
  const migrated = migrateBatchRecipe(input as BatchRecipe);
  if (!Array.isArray(migrated.steps) || !migrated.steps.length) throw new Error("Recipe JSON must contain at least one processing step.");
  for (const [index, step] of migrated.steps.entries()) {
    if (!step || typeof step !== "object" || !KNOWN_STEP_TYPES.has(step.type)) throw new Error("Recipe JSON contains an unsupported processing step.");
    if ((step.type === "split-fixed" || step.type === "page-images") && index !== migrated.steps.length - 1) throw new Error("Multi-output Batch steps must be the final recipe step.");
  }
  return { ...migrated, id: randomStepId(), name: String(migrated.name).trim().slice(0, 120), outputSuffix: String(migrated.outputSuffix || "processed").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "processed", updatedAt: Date.now() };
}
export function serializeBatchRecipe(recipe: BatchRecipe): string {
  const normalized = migrateBatchRecipe(recipe);
  return JSON.stringify({ schemaVersion: CURRENT_BATCH_SCHEMA_VERSION, name: normalized.name, steps: normalized.steps, outputSuffix: normalized.outputSuffix }, null, 2);
}
