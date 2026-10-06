import { describe, expect, it } from "vitest";
import { quickTaskIds } from "../../src/quick/quickModel";
import {
  BATCH_CAPABILITY_MATRIX,
  assertCompleteBatchCapabilityMatrix,
  batchCapabilityForTask
} from "../../src/processing/batchCapabilities";
import {
  batchRecipeExecutionFingerprint,
  migrateBatchRecipe,
  parseBatchRecipeJson,
  serializeBatchRecipe,
  validateBatchRecipe
} from "../../src/processing/batchModel";
import { BATCH_RECIPE_SCHEMA_VERSION, type BatchRecipe } from "../../src/types/batch";

function recipe(steps: BatchRecipe["steps"]): BatchRecipe {
  return {
    schemaVersion: BATCH_RECIPE_SCHEMA_VERSION,
    id: "p16",
    name: "P16",
    steps,
    outputSuffix: "done",
    updatedAt: 1
  };
}

describe("P16 Batch parity model", () => {
  it("covers every standalone quick task exactly once with explicit recipe/terminal/boundary status", () => {
    expect(() => assertCompleteBatchCapabilityMatrix()).not.toThrow();
    expect(BATCH_CAPABILITY_MATRIX).toHaveLength(quickTaskIds.length);
    expect(new Set(BATCH_CAPABILITY_MATRIX.map((entry) => entry.taskId)).size).toBe(quickTaskIds.length);
    expect(batchCapabilityForTask("extract-pages")).toMatchObject({ status: "recipe", batchSteps: ["extract-pages"] });
    expect(batchCapabilityForTask("sanitize-pdf")).toMatchObject({ status: "recipe", batchSteps: ["sanitize"] });
    expect(batchCapabilityForTask("password-protect")).toMatchObject({ status: "boundary", batchSteps: [] });
    expect(batchCapabilityForTask("unlock-pdf").reason).toMatch(/session-only input credential/i);
  });

  it("migrates v3 recipes explicitly to schema v4 without changing existing step semantics", () => {
    const migrated = migrateBatchRecipe({
      schemaVersion: 3,
      id: "old",
      name: "Existing workflow",
      steps: [{ id: "a", type: "optimize" }, { id: "b", type: "split-fixed", pagesPerFile: 5 }],
      outputSuffix: "done",
      updatedAt: 1
    }, 99);

    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.updatedAt).toBe(99);
    expect(migrated.steps).toEqual([
      { id: "a", type: "optimize" },
      { id: "b", type: "split-fixed", pagesPerFile: 5 }
    ]);
  });

  it("round-trips the new deterministic parity steps", () => {
    const original = recipe([
      { id: "extract", type: "extract-pages", selection: "1-3, last" },
      { id: "flatten", type: "flatten", flattenForms: true, flattenAnnotations: false },
      { id: "sanitize", type: "sanitize", removeAttachments: true, removeMetadata: true },
      { id: "target", type: "target-size", targetBytes: 900_000, preservation: "preserve-structure" }
    ]);
    const imported = parseBatchRecipeJson(serializeBatchRecipe(original));
    expect(imported.schemaVersion).toBe(4);
    expect(imported.steps.map((step) => step.type)).toEqual(["extract-pages", "flatten", "sanitize", "target-size"]);
    expect(imported.steps[3]).toMatchObject({ targetBytes: 900_000, preservation: "preserve-structure" });
  });

  it("rejects invalid live v4 settings instead of allowing accidental no-ops", () => {
    expect(() => validateBatchRecipe(recipe([{ id: "x", type: "flatten", flattenForms: false, flattenAnnotations: false }]))).toThrow(/at least|include forms/i);
    expect(() => validateBatchRecipe(recipe([{ id: "x", type: "extract-pages", selection: " " }]))).toThrow(/page expression/i);
    expect(() => validateBatchRecipe(recipe([{ id: "x", type: "target-size", targetBytes: 0, preservation: "preserve-structure" }]))).toThrow(/invalid settings/i);
  });

  it("refuses to serialize an invalid current recipe", () => {
    const invalid = recipe([{ id: "x", type: "flatten", flattenForms: false, flattenAnnotations: false }]);
    expect(() => serializeBatchRecipe(invalid)).toThrow(/at least|include forms/i);
  });

  it("keeps terminal multi-output steps last under schema v4", () => {
    expect(() => validateBatchRecipe(recipe([
      { id: "split", type: "split-fixed", pagesPerFile: 2 },
      { id: "opt", type: "optimize" }
    ]))).toThrow(/final workflow step/i);
  });

  it("invalidates outputs when new parity settings change while still ignoring cosmetic recipe metadata", () => {
    const first = recipe([{ id: "target-a", type: "target-size", targetBytes: 1_000_000, preservation: "preserve-structure" }]);
    const cosmetic: BatchRecipe = { ...first, id: "other", name: "Renamed", outputSuffix: "renamed", updatedAt: 999 };
    const changed = recipe([{ id: "target-b", type: "target-size", targetBytes: 800_000, preservation: "preserve-structure" }]);
    expect(batchRecipeExecutionFingerprint(cosmetic)).toBe(batchRecipeExecutionFingerprint(first));
    expect(batchRecipeExecutionFingerprint(changed)).not.toBe(batchRecipeExecutionFingerprint(first));
  });

  it("never serializes an input credential field into portable recipe JSON", () => {
    const serialized = serializeBatchRecipe(recipe([{ id: "sanitize", type: "sanitize", removeAttachments: true, removeMetadata: false }]));
    expect(serialized).not.toMatch(/password|credential/i);
  });

  it("strips unknown credential-like properties from imported recipes before persistence or export", () => {
    const imported = parseBatchRecipeJson(JSON.stringify({
      schemaVersion: 4,
      id: "hostile",
      name: "Imported",
      outputSuffix: "done",
      updatedAt: 1,
      password: "top-secret",
      credential: "should-not-survive",
      steps: [
        { id: "opt", type: "optimize", password: "step-secret", credential: "step-credential" }
      ]
    }));
    const normalized = JSON.stringify(imported);
    const serialized = serializeBatchRecipe(imported);
    expect(normalized).not.toContain("top-secret");
    expect(normalized).not.toContain("step-secret");
    expect(normalized).not.toMatch(/password|credential/i);
    expect(serialized).not.toMatch(/password|credential/i);
  });
});
