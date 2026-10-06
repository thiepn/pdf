import { describe, expect, it } from "vitest";
import batchPageSource from "../../src/views/BatchPage.tsx?raw";

describe("batch output validity", () => {
  it("stores the exact execution fingerprint that produced each completed output", () => {
    expect(batchPageSource).toContain("outputRecipeFingerprint:runFingerprint");
    expect(batchPageSource).toContain("batchRecipeExecutionFingerprint(recipeSnapshot)");
  });

  it("does not expose stale outputs after workflow, input, or session-credential changes", () => {
    expect(batchPageSource).toContain("item.outputRecipeFingerprint === recipeFingerprint");
    expect(batchPageSource).toContain("item.outputInputIdentity === item.inputIdentity");
    expect(batchPageSource).toContain("item.outputCredentialRevision === item.credentialRevision");
    expect(batchPageSource).toContain('?"Workflow, input, or session credential changed · Run again":item.message');
    expect(batchPageSource).toContain("items.some(hasCurrentOutput)");
    expect(batchPageSource).toContain("hasCurrentOutput(item)?<button");
  });

  it("allows stale completed items to be processed again", () => {
    expect(batchPageSource).toContain("item.outputInputIdentity!==item.inputIdentity");
    expect(batchPageSource).toContain("item.outputCredentialRevision!==item.credentialRevision");
    expect(batchPageSource).toContain("item.outputInputIdentity===item.inputIdentity");
    expect(batchPageSource).toContain("item.outputCredentialRevision===item.credentialRevision");
    expect(batchPageSource).toContain('item.status==="complete"');
  });

  it("uses the current output suffix without reprocessing unchanged bytes", () => {
    expect(batchPageSource).toContain('recipe.outputSuffix||"processed"');
    expect(batchPageSource).toContain("currentOutputFilename(item)");
  });

  it("does not allow queue removal while a run is using its captured item snapshot", () => {
    expect(batchPageSource).toContain('<button className="button button--tiny button--ghost" disabled={running}');
    expect(batchPageSource).not.toContain('disabled={running&&item.status==="running"}');
  });

});
