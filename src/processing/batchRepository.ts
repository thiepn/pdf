import { idbDelete, idbGetAll, idbPut } from "../storage/database";
import type { BatchRecipe } from "../types/batch";
import { migrateBatchRecipe, validateBatchRecipe } from "./batchModel";

export { migrateBatchRecipe } from "./batchModel";
export async function listBatchRecipes(): Promise<BatchRecipe[]> {
  const stored = await idbGetAll<BatchRecipe>("batchRecipes");
  const normalized = stored.map((item) => validateBatchRecipe(item));
  await Promise.all(normalized
    .filter((item,index) => JSON.stringify(item) !== JSON.stringify(stored[index]))
    .map((item) => idbPut("batchRecipes", item)));
  return normalized.sort((a,b) => b.updatedAt-a.updatedAt);
}
export async function saveBatchRecipe(recipe: BatchRecipe): Promise<void> { await idbPut("batchRecipes", { ...validateBatchRecipe(recipe), updatedAt: Date.now() }); }
export async function deleteBatchRecipe(id: string): Promise<void> { await idbDelete("batchRecipes", id); }
