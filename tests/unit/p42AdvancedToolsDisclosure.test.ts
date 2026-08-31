import { describe, expect, it } from "vitest";
import { pdfTasks } from "../../src/ia/taskCatalog";

describe("P42 task audience boundary", () => {
  it("keeps everyday, advanced, and recovery tasks explicitly classified", () => {
    const everyday = pdfTasks.filter((task) => task.audience === "everyday");
    const advanced = pdfTasks.filter((task) => task.audience === "advanced");
    const recovery = pdfTasks.filter((task) => task.audience === "recovery");

    expect(everyday.length).toBeGreaterThan(0);
    expect(advanced.length).toBeGreaterThan(0);
    expect(recovery.length).toBeGreaterThan(0);
    expect(everyday.length + advanced.length + recovery.length).toBe(pdfTasks.length);
  });

  it("keeps Batch advanced and repair workflows recovery-scoped", () => {
    expect(pdfTasks.find((task) => task.id === "batch-automation")?.audience).toBe("advanced");
    expect(pdfTasks.find((task) => task.id === "repair-pdf")?.audience).toBe("recovery");
    expect(pdfTasks.find((task) => task.id === "document-details")?.audience).toBe("recovery");
  });
});
