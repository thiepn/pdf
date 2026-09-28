import { describe, expect, it, vi } from "vitest";
import { getDocumentTaskLauncher, registerDocumentTaskLauncher } from "../../src/product/documentTaskLauncher";
import { getTask } from "../../src/ia/taskCatalog";

describe("document task launch ownership", () => {
  it("routes commands through the live document and removes the launcher on exit", async () => {
    const launcher = vi.fn(async () => undefined);
    const remove = registerDocumentTaskLauncher("live-project", launcher);
    const task = getTask("compress-pdf")!;
    await getDocumentTaskLauncher("live-project")!(task);
    expect(launcher).toHaveBeenCalledWith(task);
    remove();
    expect(getDocumentTaskLauncher("live-project")).toBeUndefined();
  });
  it("old cleanup cannot unregister a new mounted document provider", () => {
    const removeOld = registerDocumentTaskLauncher("reopened", async () => undefined);
    const latest = vi.fn(async () => undefined);
    const removeNew = registerDocumentTaskLauncher("reopened", latest);
    removeOld();
    expect(getDocumentTaskLauncher("reopened")).toBe(latest);
    expect(getDocumentTaskLauncher("other-project")).toBeUndefined();
    removeNew();
  });
});
