import { describe, expect, it } from "vitest";
import { classifyDocumentBudget, deriveViewerPerformancePolicy, performanceBudgetFor } from "../../src/viewer/performancePolicy";
import { defaultSettings } from "../../src/types/settings";

describe("Phase 29 final polish", () => {
  it("uses an extreme budget for thousand-page documents", () => {
    expect(classifyDocumentBudget(1000, 30_000_000)).toBe("extreme");
    expect(performanceBudgetFor("extreme")).toMatchObject({ maxConcurrentRenders: 1, maxPixelRatio: 1.25 });
  });

  it("tightens adaptive viewer rendering beyond the ordinary large-document policy", () => {
    const policy = deriveViewerPerformancePolicy(defaultSettings, 1200, 600_000_000, {
      deviceMemoryGb: 16,
      logicalProcessors: 12,
      viewportPixels: 2_000_000
    });
    expect(policy.extremeDocument).toBe(true);
    expect(policy.budgetClass).toBe("extreme");
    expect(policy.renderConcurrency).toBe(1);
    expect(policy.pixelRatioCap).toBeLessThanOrEqual(1.25);
    expect(policy.activationMarginPx).toBeLessThanOrEqual(450);
  });
});
