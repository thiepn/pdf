import { describe, expect, it } from "vitest";
import { classifyTextEditability, reconstructPageTextParagraphs } from "../../src/native/nativeModel";
import type { NativePageTree, NativeTextObject } from "../../src/types/nativeEditor";

function span(id: string, text: string, x: number, y: number, weight: "normal" | "bold" = "normal", color?: string): NativeTextObject {
  return {
    id,
    type: "text",
    pageNumber: 1,
    bounds: { x, y, w: Math.max(18, text.length * 6), h: 12 },
    text,
    fontName: weight === "bold" ? "Helvetica-Bold" : "Helvetica",
    family: "sans-serif",
    size: 10,
    weight,
    style: "normal",
    color,
    writingMode: 0,
    ...classifyTextEditability(text, weight === "bold" ? "Helvetica-Bold" : "Helvetica")
  };
}

describe("P2 preserve-spans paragraph reconstruction", () => {
  it("coalesces same-baseline style spans into one visual line without losing runs", () => {
    const page: NativePageTree = {
      pageNumber: 1,
      originX: 0,
      originY: 0,
      width: 612,
      height: 792,
      objects: [
        span("p1:text:4:0", "Hello", 50, 80, "normal", "#111111"),
        span("p1:text:4:1", "bold", 88, 80, "bold", "#cc0000"),
        span("p1:text:4:2", "second line", 50, 96, "normal", "#111111")
      ]
    };
    const paragraph = reconstructPageTextParagraphs(page).objects[0] as NativeTextObject;
    expect(paragraph.lineCount).toBe(2);
    expect(paragraph.sourceSpanCount).toBe(3);
    expect(paragraph.runs?.map((run) => run.text).join("")).toBe(paragraph.text);
    expect(paragraph.runs?.some((run) => run.fontName === "Helvetica-Bold" && run.weight === "bold" && run.color === "#cc0000")).toBe(true);
    expect(paragraph.text).toContain("Hello bold");
  });

  it("annotates vertically stacked same-column paragraphs as one safe flow", () => {
    const page: NativePageTree = {
      pageNumber: 1,
      originX: 0,
      originY: 0,
      width: 612,
      height: 792,
      objects: [
        span("p1:text:1:0", "First paragraph", 50, 80),
        span("p1:text:2:0", "Second paragraph", 50, 120),
        span("p1:text:3:0", "Other column", 340, 90)
      ]
    };
    const reconstructed = reconstructPageTextParagraphs(page);
    const paragraphs = reconstructed.objects.filter((object): object is NativeTextObject => object.type === "text");
    expect(paragraphs[0].flow?.id).toBe(paragraphs[1].flow?.id);
    expect(paragraphs[2].flow).toBeUndefined();
  });
});
