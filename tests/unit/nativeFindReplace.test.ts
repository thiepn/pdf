import { describe, expect, it } from "vitest";
import { planNativeFindReplace, replaceNativeTextOccurrences } from "../../src/editor/native/nativeFindReplace";
import type { NativeEdit, NativeInspection, NativeTextObject } from "../../src/types/nativeEditor";

function textObject(overrides: Partial<NativeTextObject> = {}): NativeTextObject {
  return {
    id: "text-1",
    type: "text",
    pageNumber: 1,
    bounds: { x: 20, y: 20, w: 360, h: 48 },
    text: "Acme Ltd approved Acme Ltd",
    fontName: "Helvetica",
    family: "sans-serif",
    size: 10,
    weight: "normal",
    style: "normal",
    writingMode: 0,
    script: "latin",
    editability: "fixed-box",
    reason: "Editable",
    capability: { level: "safe-reconstruction", label: "Safe reconstruction", confidence: .95, reason: "Editable", preserves: [], risks: [] },
    ...overrides
  };
}

function inspection(objects: NativeTextObject[], canEdit = true): NativeInspection {
  return {
    pageCount: 1,
    canEdit,
    pages: [{ pageNumber: 1, originX: 0, originY: 0, width: 612, height: 792, objects }],
    fonts: [],
    totals: { text: objects.length, images: 0, vectors: 0, tables: 0, forms: 0 },
    warnings: []
  };
}

function queuedText(objectId = "text-1", overrides: Partial<Extract<NativeEdit, { kind: "text" }>> = {}): Extract<NativeEdit, { kind: "text" }> {
  return {
    id: "queued",
    kind: "text",
    objectId,
    pageNumber: 1,
    originalText: "Acme Ltd approved Acme Ltd",
    text: "Acme Ltd approved Acme Ltd",
    bounds: { x: 20, y: 20, w: 360, h: 48 },
    sourceBounds: { x: 20, y: 20, w: 360, h: 48 },
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111111",
    backgroundColor: "#ffffff",
    align: "left",
    mode: "replace",
    wrap: true,
    fontSource: "built-in",
    layoutMode: "fixed-box",
    ...overrides
  };
}

describe("native find and replace", () => {
  it("replaces every safe case-insensitive match in one detected text block", () => {
    const plan = planNativeFindReplace(inspection([textObject()]), [], "acme ltd", "Northstar GmbH", { caseSensitive: false, wholeWord: false });
    expect(plan.totalOccurrences).toBe(2);
    expect(plan.replaceableOccurrences).toBe(2);
    expect(plan.blockedOccurrences).toBe(0);
    expect(plan.edits).toHaveLength(1);
    expect(plan.edits[0].text).toBe("Northstar GmbH approved Northstar GmbH");
  });

  it("supports whole-word matching without replacing text inside larger words", () => {
    const result = replaceNativeTextOccurrences("cat catalog Cat scatter", "cat", "dog", { caseSensitive: false, wholeWord: true });
    expect(result.count).toBe(2);
    expect(result.text).toBe("dog catalog dog scatter");
  });

  it("uses deletion semantics when replacement removes the entire detected text block", () => {
    const object = textObject({ text: "Remove me" });
    const plan = planNativeFindReplace(inspection([object]), [], "Remove me", "", { caseSensitive: true, wholeWord: false });
    expect(plan.edits).toHaveLength(1);
    expect(plan.edits[0].text).toBe("");
    expect(plan.edits[0].backgroundColor).toBe("transparent");
  });

  it("reports unsupported existing text without queueing a destructive fallback", () => {
    const object = textObject({ editability: "unsupported", capability: { level: "unsupported", label: "Unsupported", confidence: .2, reason: "Unsafe", preserves: [], risks: [] } });
    const plan = planNativeFindReplace(inspection([object]), [], "Acme", "Northstar", { caseSensitive: true, wholeWord: false });
    expect(plan.totalOccurrences).toBe(2);
    expect(plan.replaceableOccurrences).toBe(0);
    expect(plan.blockedOccurrences).toBe(2);
    expect(plan.matches[0].reason).toMatch(/not safely editable/i);
  });

  it("blocks replacements that would overflow the fixed reconstruction box", () => {
    const object = textObject({ text: "A", bounds: { x: 0, y: 0, w: 18, h: 11 }, size: 10 });
    const plan = planNativeFindReplace(inspection([object]), [], "A", "A replacement that cannot fit", { caseSensitive: true, wholeWord: false });
    expect(plan.replaceableOccurrences).toBe(0);
    expect(plan.blockedOccurrences).toBe(1);
    expect(plan.matches[0].reason).toMatch(/overflow/i);
  });

  it("allows a hyphenated fixed-box replacement that is no larger than its conservative source baseline", () => {
    const object = textObject({ text: "MAY - JUL\nBudget", bounds: { x: 0, y: 0, w: 80, h: 12 }, size: 10 });
    const plan = planNativeFindReplace(inspection([object]), [], "MAY - JUL", "JUN - AUG", { caseSensitive: true, wholeWord: false });
    expect(plan.replaceableOccurrences).toBe(1);
    expect(plan.blockedOccurrences).toBe(0);
    expect(plan.edits[0].text).toBe("JUN - AUG\nBudget");
  });

  it("does not invalidate an existing layout-aware reflow plan", () => {
    const object = textObject();
    const plan = planNativeFindReplace(inspection([object]), [queuedText("text-1", { layoutMode: "expand-flow" })], "Acme", "Northstar", { caseSensitive: true, wholeWord: false });
    expect(plan.edits).toHaveLength(0);
    expect(plan.matches[0].reason).toMatch(/layout-aware reflow/i);
  });

  it("preserves mixed formatting while replacing multiple matches in one text object", () => {
    const object = textObject({
      runs: [
        { text: "Acme Ltd ", start: 0, end: 9, bounds: { x: 0, y: 0, w: 80, h: 12 }, fontName: "Helvetica", family: "sans-serif", size: 10, weight: "normal", style: "normal", color: "#111111", writingMode: 0 },
        { text: "approved ", start: 9, end: 18, bounds: { x: 80, y: 0, w: 70, h: 12 }, fontName: "Helvetica-Bold", family: "sans-serif", size: 10, weight: "bold", style: "normal", color: "#cc0000", writingMode: 0 },
        { text: "Acme Ltd", start: 18, end: 26, bounds: { x: 150, y: 0, w: 70, h: 12 }, fontName: "Helvetica", family: "sans-serif", size: 10, weight: "normal", style: "normal", color: "#111111", writingMode: 0 }
      ]
    });
    const plan = planNativeFindReplace(inspection([object]), [], "Acme Ltd", "Northstar", { caseSensitive: true, wholeWord: false });
    expect(plan.edits).toHaveLength(1);
    expect(plan.replaceableOccurrences).toBe(2);
    expect(plan.edits[0].text).toBe("Northstar approved Northstar");
    expect(plan.edits[0].styleRuns?.find((run) => run.text.includes("approved"))).toMatchObject({ fontWeight: "bold", color: "#cc0000" });
  });

  it("updates an existing safe fixed-box queued edit instead of discarding its settings", () => {
    const object = textObject();
    const queued = queuedText("text-1", { text: "Acme Ltd approved Acme Ltd", backgroundColor: "#ffeecc", fontSize: 9 });
    const plan = planNativeFindReplace(inspection([object]), [queued], "approved", "accepted", { caseSensitive: true, wholeWord: true });
    expect(plan.edits).toHaveLength(1);
    expect(plan.edits[0].id).toBe("queued");
    expect(plan.edits[0].backgroundColor).toBe("#ffeecc");
    expect(plan.edits[0].fontSize).toBe(9);
    expect(plan.edits[0].text).toBe("Acme Ltd accepted Acme Ltd");
  });

  it("blocks script-changing bulk replacements so font/shaping is reviewed manually", () => {
    const plan = planNativeFindReplace(inspection([textObject({ text: "Hello world" })]), [], "world", "世界", { caseSensitive: true, wholeWord: true });
    expect(plan.edits).toHaveLength(0);
    expect(plan.matches[0].reason).toMatch(/writing script/i);
  });

  it("preflights Latin characters that the worker cannot encode", () => {
    const plan = planNativeFindReplace(inspection([textObject({ text: "Hello world" })]), [], "world", "Ā", { caseSensitive: true, wholeWord: true });
    expect(plan.edits).toHaveLength(0);
    expect(plan.matches[0].reason).toMatch(/cannot encode/i);
  });

  it("blocks all matched edits when PDF permissions disallow editing", () => {
    const plan = planNativeFindReplace(inspection([textObject()], false), [], "Acme", "Northstar", { caseSensitive: true, wholeWord: false });
    expect(plan.replaceableOccurrences).toBe(0);
    expect(plan.blockedOccurrences).toBe(2);
    expect(plan.matches[0].reason).toMatch(/permission/i);
  });
});
