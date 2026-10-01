import { describe, expect, it } from "vitest";
import { batchRecipeExecutionFingerprint } from "../../src/processing/batchModel";
import { BATCH_RECIPE_SCHEMA_VERSION, type BatchRecipe } from "../../src/types/batch";

function recipe(): BatchRecipe {
  return {
    schemaVersion: BATCH_RECIPE_SCHEMA_VERSION,
    id: "recipe-a",
    name: "Cleanup",
    steps: [
      { id: "rotate-a", type: "rotate", degrees: 90 },
      { id: "metadata-a", type: "remove-metadata" }
    ],
    outputSuffix: "processed",
    updatedAt: 1
  };
}

describe("batch output recipe fingerprint", () => {
  it("ignores cosmetic recipe metadata and step ids", () => {
    const first = recipe();
    const second: BatchRecipe = {
      ...first,
      id: "recipe-b",
      name: "Renamed workflow",
      updatedAt: 999,
      outputSuffix: "renamed",
      steps: [
        { id: "rotate-b", type: "rotate", degrees: 90 },
        { id: "metadata-b", type: "remove-metadata" }
      ]
    };

    expect(batchRecipeExecutionFingerprint(second)).toBe(
      batchRecipeExecutionFingerprint(first)
    );
  });

  it("changes when an output-affecting setting changes", () => {
    const first = recipe();
    const second: BatchRecipe = {
      ...first,
      steps: [
        { id: "rotate-a", type: "rotate", degrees: 180 },
        { id: "metadata-a", type: "remove-metadata" }
      ]
    };

    expect(batchRecipeExecutionFingerprint(second)).not.toBe(
      batchRecipeExecutionFingerprint(first)
    );
  });

  it("changes when processing order changes", () => {
    const first = recipe();
    const second: BatchRecipe = {
      ...first,
      steps: [...first.steps].reverse()
    };

    expect(batchRecipeExecutionFingerprint(second)).not.toBe(
      batchRecipeExecutionFingerprint(first)
    );
  });
});
