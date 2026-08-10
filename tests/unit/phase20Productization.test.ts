import { afterEach, describe, expect, it } from "vitest";
import { beginWorkspaceHeartbeat, readInterruptedWorkspaceSession } from "../../src/recovery/sessionHeartbeat";
import { deriveViewerPerformancePolicy } from "../../src/viewer/performancePolicy";
import { defaultSettings } from "../../src/types/settings";
import { RenderScheduler } from "../../src/viewer/renderScheduler";

describe("Phase 20 productization", () => {
  afterEach(() => localStorage.clear());

  it("automatically enables large-document safeguards", () => {
    const policy = deriveViewerPerformancePolicy(defaultSettings, 500, 150_000_000, {
      deviceMemoryGb: 16,
      logicalProcessors: 12,
      viewportPixels: 2_000_000
    });
    expect(policy.largeDocument).toBe(true);
    expect(policy.effectiveProfile).toBe("low-memory");
    expect(policy.renderConcurrency).toBeLessThanOrEqual(2);
    expect(policy.pixelRatioCap).toBeLessThanOrEqual(1.5);
  });

  it("records and cleanly closes a workspace heartbeat", () => {
    const cleanup = beginWorkspaceHeartbeat("project-1", "editor");
    expect(readInterruptedWorkspaceSession("project-1")?.mode).toBe("editor");
    cleanup();
    expect(readInterruptedWorkspaceSession("project-1")).toBeNull();
  });

  it("bounds concurrent render work", async () => {
    const scheduler = new RenderScheduler(2);
    let active = 0;
    let peak = 0;
    const run = () => scheduler.run(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
    });
    await Promise.all([run(), run(), run(), run(), run()]);
    expect(peak).toBe(2);
    expect(scheduler.snapshot().completed).toBe(5);
  });
});
