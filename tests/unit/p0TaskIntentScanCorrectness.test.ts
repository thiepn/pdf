import { describe, expect, it } from "vitest";
import bridgeSource from "../../src/ia/TaskIntentRouteBridge.tsx?raw";
import { taskIntentActivation, taskIntentActivationIds } from "../../src/ia/taskIntent";
import { buildScanOutputFingerprint } from "../../src/scan/scanOutputFingerprint";
import type { OcrPreprocessSettings } from "../../src/types/ocr";

const preprocess: OcrPreprocessSettings = {
  grayscale: false,
  contrast: 1,
  brightness: 0,
  threshold: null,
  invert: false,
  scale: 1
};

const first = { id: "page-a", file: { name: "a.png", size: 100, lastModified: 1, type: "image/png" }, rotation: 0 };
const second = { id: "page-b", file: { name: "b.jpg", size: 200, lastModified: 2, type: "image/jpeg" }, rotation: 0 };

describe("P0 exact task-intent routing", () => {
  const expected = {
    "edit-pdf": [".editor-toolrail button", "Select"],
    "annotate-pdf": [".editor-toolrail button", "Highlight"],
    "visual-signature": [".editor-toolrail button", "Signature"],
    "mark-redaction": [".editor-toolrail button", "Mark redaction"],
    "fill-forms": [".security-tabs button", "Forms"],
    "apply-redactions": [".security-tabs button", "Redaction"],
    "sanitize-pdf": [".security-tabs button", "Sanitize"],
    "password-protect": [".security-tabs button", "Protect"],
    "flatten-pdf": [".security-tabs button", "Sanitize"],
    "print-layout": [".professional-tabs button", "Print layout"],
    "bates-numbering": [".professional-tabs button", "Document numbering"],
    "archive-readiness": [".professional-tabs button", "Archive check"],
    "accessibility-check": [".professional-tabs button", "Accessibility"]
  } as const;

  it("maps every focused catalog task to its exact existing control", () => {
    expect(taskIntentActivationIds().sort()).toEqual(Object.keys(expected).sort());
    for (const [taskId, [selector, label]] of Object.entries(expected)) {
      expect(taskIntentActivation(taskId)).toEqual({ selector, label });
    }
  });

  it("uses the real workspace control and waits for lazy workspaces", () => {
    expect(bridgeSource).toContain("MutationObserver");
    expect(bridgeSource).toContain("button.click()");
    expect(bridgeSource).toContain("dataset.pdfTaskIntent");
    expect(bridgeSource).toContain("Task intent could not activate");
  });
});

describe("P0 Scan output invalidation", () => {
  it("keeps an identical recipe stable", () => {
    const left = buildScanOutputFingerprint([first, second], false, [], preprocess);
    const right = buildScanOutputFingerprint([first, second], false, [], { ...preprocess });
    expect(left).toBe(right);
  });

  it("changes for every output-affecting Scan input", () => {
    const base = buildScanOutputFingerprint([first, second], false, [], preprocess);
    expect(buildScanOutputFingerprint([second, first], false, [], preprocess)).not.toBe(base);
    expect(buildScanOutputFingerprint([{ ...first, rotation: 90 }, second], false, [], preprocess)).not.toBe(base);
    expect(buildScanOutputFingerprint([first, second], true, ["eng"], preprocess)).not.toBe(base);
    expect(buildScanOutputFingerprint([first, second], false, ["eng"], preprocess)).not.toBe(base);
    expect(buildScanOutputFingerprint([first, second], false, [], { ...preprocess, contrast: 1.25 })).not.toBe(base);
    expect(buildScanOutputFingerprint([{ ...first, file: { ...first.file, size: 101 } }, second], false, [], preprocess)).not.toBe(base);
  });
});
