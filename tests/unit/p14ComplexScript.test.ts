import { describe, expect, it } from "vitest";
import { classifyTextEditability, detectScript } from "../../src/native/nativeModel";
import {
  QUALIFIED_COMPLEX_SCRIPT_MATRIX,
  complexScriptReplacementIssue,
  detectQualifiedComplexScript
} from "../../src/native/complexScript";
import { mirroredRunText, planBidiLine } from "../../src/native/complexBidi";
import { planNativeFindReplace } from "../../src/editor/native/nativeFindReplace";
import type { NativeCapability, NativeInspection, NativeTextObject } from "../../src/types/nativeEditor";

const capability: NativeCapability = {
  level: "safe-reconstruction",
  label: "Arabic shaping",
  confidence: 0.84,
  reason: "test",
  preserves: [],
  risks: []
};

function arabicObject(): NativeTextObject {
  return {
    id: "arabic-1",
    type: "text",
    pageNumber: 1,
    bounds: { x: 50, y: 50, w: 240, h: 40 },
    text: "مرحبا بالعالم",
    fontName: "Identity-H",
    family: "sans-serif",
    size: 14,
    weight: "normal",
    style: "normal",
    writingMode: 0,
    script: "arabic",
    editability: "shaped-fixed-box",
    reason: "test",
    capability,
    paragraph: true,
    direction: "rtl",
    align: "right"
  };
}

describe("P14 complex-script qualification", () => {
  it("qualifies Arabic/RTL explicitly without claiming every complex script", () => {
    expect(QUALIFIED_COMPLEX_SCRIPT_MATRIX).toEqual([
      expect.objectContaining({
        script: "arabic",
        direction: "rtl",
        shapingEngine: "harfbuzz",
        requiresImportedFont: true,
        layoutAwareReflow: false,
        bulkFindReplace: false
      })
    ]);
    expect(detectScript("مرحبا بالعالم")).toBe("arabic");
    expect(detectScript("الإصدار PDF 123")).toBe("arabic");
    expect(detectQualifiedComplexScript("שלום")).toBe("complex");
    expect(detectScript("नमस्ते")).toBe("complex");
  });

  it("rejects explicit bidi controls and unrelated mixed scripts", () => {
    expect(complexScriptReplacementIssue("مرحبا\u202E PDF")).toMatch(/bidirectional control/i);
    expect(complexScriptReplacementIssue("مرحبا שלום")).toMatch(/outside the qualified/i);
    expect(complexScriptReplacementIssue("مرحبا PDF 123")).toBeUndefined();
  });

  it("classifies Arabic source text for shaped fixed-box reconstruction even with Identity-H source fonts", () => {
    const result = classifyTextEditability("مرحبا بالعالم", "ABCDEF+Identity-H");
    expect(result.script).toBe("arabic");
    expect(result.editability).toBe("shaped-fixed-box");
    expect(result.capability.level).toBe("safe-reconstruction");
    expect(result.reason).toMatch(/font is imported and validated/i);
  });

  it("resolves mixed Arabic/Latin lines into explicit visual bidi runs and mirroring", () => {
    const plan = planBidiLine("مرحبا PDF 123 (اختبار)", "rtl");
    expect(plan.baseDirection).toBe("rtl");
    expect(plan.visualRuns.some((run) => run.direction === "rtl")).toBe(true);
    expect(plan.visualRuns.some((run) => run.direction === "ltr")).toBe(true);
    const mirrored = plan.visualRuns.map((run) => mirroredRunText(plan, run)).join("");
    expect(mirrored).toContain("PDF");
    expect(plan.mirroredTextByIndex.size).toBeGreaterThan(0);
  });

  it("keeps automatic Arabic find/replace fail-closed because each edit needs a validated font", () => {
    const object = arabicObject();
    const inspection: NativeInspection = {
      pageCount: 1,
      canEdit: true,
      fonts: [],
      totals: { text: 1, images: 0, vectors: 0, tables: 0, forms: 0, complex: 0 },
      warnings: [],
      pages: [{ pageNumber: 1, originX: 0, originY: 0, width: 612, height: 792, objects: [object] }]
    };
    const plan = planNativeFindReplace(inspection, [], "العالم", "الدنيا", { caseSensitive: true, wholeWord: false });
    expect(plan.totalOccurrences).toBe(1);
    expect(plan.replaceableOccurrences).toBe(0);
    expect(plan.blockedOccurrences).toBe(1);
    expect(plan.matches[0].reason).toMatch(/manually selected and validated local font/i);
  });
});
