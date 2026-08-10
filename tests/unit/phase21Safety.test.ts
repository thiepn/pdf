import { describe, expect, it } from "vitest";
import { assessStorageBudget } from "../../src/storage/budget";
import { cancelProjectOperation, getProjectOperation, runProjectOperation, subscribeProjectOperation } from "../../src/operations/projectOperationCoordinator";

describe("Phase 21 operation safety", () => {
  it("keeps a browser-storage reserve before local writes", () => {
    const healthy = assessStorageBudget({ usage: 100_000_000, quota: 1_000_000_000 }, 50_000_000);
    expect(healthy.status).toBe("ok");
    expect(healthy.reserveBytes).toBe(50_000_000);

    const pressure = assessStorageBudget({ usage: 930_000_000, quota: 1_000_000_000 }, 30_000_000);
    expect(pressure.status).toBe("warning");

    const exhausted = assessStorageBudget({ usage: 980_000_000, quota: 1_000_000_000 }, 30_000_000);
    expect(exhausted.status).toBe("blocked");
  });

  it("serializes operations for one project while allowing another project", async () => {
    let release!: () => void;
    const first = runProjectOperation("same-project", { label: "First" }, async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return "first";
    });
    await Promise.resolve();

    await expect(runProjectOperation("same-project", { label: "Second" }, async () => "second")).rejects.toThrow(/already running/i);
    await expect(runProjectOperation("other-project", { label: "Other" }, async () => "other")).resolves.toBe("other");
    release();
    await expect(first).resolves.toBe("first");
    expect(getProjectOperation("same-project")).toBeNull();
  });

  it("propagates cancellation and publishes operation states", async () => {
    const states: string[] = [];
    const unsubscribe = subscribeProjectOperation("cancel-project", operation => states.push(operation?.stage ?? "idle"));
    const running = runProjectOperation("cancel-project", { label: "Cancelable" }, async ({ signal, update }) => {
      update({ detail: "working", progress: 0.5 });
      await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    });
    await Promise.resolve();
    expect(cancelProjectOperation("cancel-project")).toBe(true);
    await expect(running).rejects.toMatchObject({ name: "AbortError" });
    unsubscribe();
    expect(states).toContain("queued");
    expect(states).toContain("running");
    expect(states.at(-1)).toBe("idle");
  });

  it("protects non-cancellable commit stages", async () => {
    let release!: () => void;
    const running = runProjectOperation("commit-project", { label: "Commit", cancellable: false }, async () => {
      await new Promise<void>((resolve) => { release = resolve; });
    });
    await Promise.resolve();
    expect(cancelProjectOperation("commit-project")).toBe(false);
    release();
    await running;
  });
});
