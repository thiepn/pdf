import { describe, expect, it } from "vitest";
import batchPageSource from "../../src/views/BatchPage.tsx?raw";
import batchPipelineSource from "../../src/processing/batchPipeline.ts?raw";

describe("P16 encrypted Batch queue boundary", () => {
  it("keeps plaintext credentials in an in-memory page-owned map rather than recipe/storage state", () => {
    expect(batchPageSource).toContain("sessionPasswordsRef=useRef<Map<string,string>>(new Map())");
    expect(batchPageSource).toContain("sessionPasswordsRef.current.clear()");
    expect(batchPageSource).toContain("sessionPasswordsRef.current.delete(item.id)");
    expect(batchPageSource).not.toContain("localStorage");
    expect(batchPageSource).not.toContain("sessionStorage");
    expect(batchPageSource).not.toContain("rememberProjectSessionPassword");
  });

  it("turns protected-file failures into a recoverable per-file password request", () => {
    expect(batchPageSource).toContain('"needs-password"');
    expect(batchPageSource).toContain("Password required");
    expect(batchPageSource).toContain("useSessionPassword(item)");
    expect(batchPageSource).toContain("await inspectPdfBytes(bytes,password)");
    expect(batchPageSource).toContain("That password did not open this PDF.");
    expect(batchPageSource).toContain('setPasswordDrafts(current=>({...current,[itemId]:""}))');
  });

  it("passes credentials separately from recipe semantics and never adds a password recipe step", () => {
    expect(batchPageSource).toContain("sessionPasswordsRef.current.get(item.id)");
    expect(batchPageSource).toContain("runBatchRecipe(");
    expect(batchPipelineSource).toContain("password?: string");
    expect(batchPipelineSource).toContain("inspectPdfBytes(bytes, password)");
    expect(batchPageSource).not.toContain('type:"password');
  });

  it("invalidates output when input identity or credential revision changes", () => {
    expect(batchPageSource).toContain("item.outputInputIdentity === item.inputIdentity");
    expect(batchPageSource).toContain("item.outputCredentialRevision === item.credentialRevision");
    expect(batchPageSource).toContain("credentialRevision:entry.credentialRevision+1");
    expect(batchPageSource).toContain("outputInputIdentity:item.inputIdentity");
    expect(batchPageSource).toContain("outputCredentialRevision:item.credentialRevision");
  });

  it("documents deterministic terminal naming and queue-order ZIP naming", () => {
    expect(batchPipelineSource).toContain("pages-0001-0010.pdf style");
    expect(batchPipelineSource).toContain("page-0001.png style");
    expect(batchPageSource).toContain('String(index+1).padStart(3,"0")');
    expect(batchPageSource).toContain('"batch-outputs.zip"');
  });
});
