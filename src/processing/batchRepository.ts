import { idbDelete, idbGetAll, idbPut } from "../storage/database";
import type { BatchRecipe } from "../types/batch";
import { migrateBatchRecipe } from "./batchModel";

export { migrateBatchRecipe } from "./batchModel";
export async function listBatchRecipes(): Promise<BatchRecipe[]> {
  const stored = await idbGetAll<BatchRecipe>("batchRecipes"); const migrated = stored.map((item) => migrateBatchRecipe(item));
  await Promise.all(migrated.filter((item,index)=>item !== stored[index]).map(item=>idbPut("batchRecipes",item)));
  return migrated.sort((a,b) => b.updatedAt-a.updatedAt);
}
export async function saveBatchRecipe(recipe: BatchRecipe): Promise<void> { await idbPut("batchRecipes", { ...migrateBatchRecipe(recipe), updatedAt: Date.now() }); }
export async function deleteBatchRecipe(id: string): Promise<void> { await idbDelete("batchRecipes", id); }
