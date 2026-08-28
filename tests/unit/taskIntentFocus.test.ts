import { describe, expect, it } from "vitest";
import { pdfTasks } from "../../src/ia/taskCatalog";
import { TASK_INTENT_FOCUS_PLANS } from "../../src/capabilities/taskIntentFocus";

describe("canonical task intent focus", () => {
  it("covers every task that shares a broad editor/security/professional/compliance workspace", () => {
    const sharedModes = new Set(["editor", "secure", "professional", "compliance"]);
    const sharedTaskIds = pdfTasks
      .filter((task) => task.target.kind === "workspace" && sharedModes.has(task.target.mode))
      .map((task) => task.id)
      .sort();

    expect(Object.keys(TASK_INTENT_FOCUS_PLANS).sort()).toEqual(sharedTaskIds);
  });

  it("routes high-risk task intents to the exact control instead of a default tab", () => {
    expect(TASK_INTENT_FOCUS_PLANS["visual-signature"].primary.selector).toContain('aria-label="Signature"');
    expect(TASK_INTENT_FOCUS_PLANS["apply-redactions"].primary.label).toBe("Redaction");
    expect(TASK_INTENT_FOCUS_PLANS["password-protect"].primary.label).toBe("Protect");
    expect(TASK_INTENT_FOCUS_PLANS["print-layout"].primary.label).toBe("Print layout");
    expect(TASK_INTENT_FOCUS_PLANS["accessibility-check"].primary.label).toBe("Accessibility");
  });

  it("focuses flattening controls without enabling destructive options automatically", () => {
    const plan = TASK_INTENT_FOCUS_PLANS["flatten-pdf"];
    expect(plan.primary.label).toBe("Sanitize");
    expect(plan.followUp).toEqual(expect.objectContaining({ label: "Flatten form fields", action: "focus" }));
  });
});
