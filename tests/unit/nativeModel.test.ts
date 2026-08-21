import { describe, expect, it } from "vitest";
import {
  classifyTextEditability,
  detectScript,
  detectTables,
  estimatedTextWidth,
  joinTextLines,
  reconstructInspectionTextParagraphs,
  reconstructPageTextParagraphs,
  rectFromArray,
  wrapTextToBox
} from "../../src/native/nativeModel";
import type { NativeInspection, NativePageTree, NativeTextObject } from "../../src/types/nativeEditor";

function line(id: string, text: string, x: number, y: number, w = 120, h = 12, size = 10): NativeTextObject {
  return {
    id,
    type: "text",
    pageNumber: 1,
    bounds: { x, y, w, h },
    text,
    fontName: "Helvetica",
    family: "sans-serif",
    size,
    weight: "normal",
    style: "normal",
    writingMode: 0,
    ...classifyTextEditability(text, "Helvetica")
  };
}

describe("native editor model", () => {
  it("normalizes MuPDF structured-text bbox objects and ordinary rect arrays", () => {
    expect(rectFromArray({ x: 12, y: 34, w: 56, h: 78 })).toEqual({ x: 12, y: 34, w: 56, h: 78 });
    expect(rectFromArray({ x: 20, y: 30, w: -5, h: -10 })).toEqual({ x: 15, y: 20, w: 5, h: 10 });
    expect(rectFromArray([12, 34, 68, 112])).toEqual({ x: 12, y: 34, w: 56, h: 78 });
  });

  it("classifies Latin and CJK scripts", () => {
    expect(detectScript("Bonjour")).toBe("latin");
    expect(detectScript("한국어")).toBe("cjk-ko");
    expect(detectScript("日本語")).toBe("cjk-ja");
  });

  it("falls back for complex scripts instead of claiming unsafe native shaping", () => {
    expect(classifyTextEditability("مرحبا", "Identity-H").editability).toBe("overlay-only");
  });

  it("detects aligned table rows", () => {
    const table = detectTables(1, [
      { id: "a", text: "A", fontSize: 10, bounds: { x: 0, y: 0, w: 30, h: 10 } },
      { id: "b", text: "B", fontSize: 10, bounds: { x: 50, y: 0, w: 30, h: 10 } },
      { id: "c", text: "C", fontSize: 10, bounds: { x: 0, y: 20, w: 30, h: 10 } },
      { id: "d", text: "D", fontSize: 10, bounds: { x: 50, y: 20, w: 30, h: 10 } }
    ]);
    expect(table[0]?.rows).toBe(2);
    expect(table[0]?.columns).toBe(2);
  });

  it("uses weighted glyph widths instead of a single character-count ratio", () => {
    expect(estimatedTextWidth("WWWW", 10)).toBeGreaterThan(estimatedTextWidth("iiii", 10));
    expect(estimatedTextWidth("한국", 10)).toBeGreaterThan(estimatedTextWidth("ab", 10));
  });

  it("wraps measured text and preserves hard paragraph breaks", () => {
    const wrapped = wrapTextToBox("one two three four", 42, 10);
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapTextToBox("alpha\nbeta", 500, 10)).toEqual(["alpha", "beta"]);
  });

  it("breaks long unspaced CJK text without dropping characters", () => {
    const source = "한국어문장을줄바꿈합니다";
    const wrapped = wrapTextToBox(source, 31, 10);
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped.join("")).toBe(source);
  });

  it("joins source lines into prose and dehyphenates soft line endings", () => {
    expect(joinTextLines([
      { text: "A profes-", script: "latin" },
      { text: "sional editor", script: "latin" }
    ])).toBe("A professional editor");
  });

  it("reconstructs one MuPDF structured-text block as one editable paragraph", () => {
    const page: NativePageTree = {
      pageNumber: 1,
      originX: 0,
      originY: 0,
      width: 612,
      height: 792,
      objects: [
        line("p1:text:2:0", "First line of a", 50, 80),
        line("p1:text:2:1", "paragraph.", 50, 94),
        line("p1:text:3:0", "Other column", 330, 80)
      ]
    };
    const reconstructed = reconstructPageTextParagraphs(page);
    const paragraphs = reconstructed.objects.filter((object): object is NativeTextObject => object.type === "text");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].text).toBe("First line of a paragraph.");
    expect(paragraphs[0].lineCount).toBe(2);
    expect(paragraphs[0].sourceObjectIds).toEqual(["p1:text:2:0", "p1:text:2:1"]);
    expect(paragraphs[0].id).toBe("1:2:paragraph");
    expect(paragraphs[1].text).toBe("Other column");
  });

  it("infers right alignment from stable right edges", () => {
    const page: NativePageTree = {
      pageNumber: 1,
      originX: 0,
      originY: 0,
      width: 612,
      height: 792,
      objects: [
        line("p1:text:5:0", "short", 160, 100, 40),
        line("p1:text:5:1", "a longer line", 120, 114, 80),
        line("p1:text:5:2", "middle", 145, 128, 55)
      ]
    };
    const paragraph = reconstructPageTextParagraphs(page).objects[0] as NativeTextObject;
    expect(paragraph.align).toBe("right");
    expect(paragraph.lineHeight).toBeGreaterThan(0);
  });

  it("updates inspection text totals without changing non-text totals", () => {
    const inspection: NativeInspection = {
      pageCount: 1,
      canEdit: true,
      pages: [{
        pageNumber: 1,
        originX: 0,
        originY: 0,
        width: 612,
        height: 792,
        objects: [line("p1:text:0:0", "one", 20, 20), line("p1:text:0:1", "two", 20, 34)]
      }],
      fonts: [],
      totals: { text: 2, images: 3, vectors: 4, tables: 5, forms: 6 },
      warnings: []
    };
    const reconstructed = reconstructInspectionTextParagraphs(inspection);
    expect(reconstructed.totals).toEqual({ text: 1, images: 3, vectors: 4, tables: 5, forms: 6 });
    expect(reconstructed.warnings[0]).toMatch(/editable paragraph blocks/i);
  });
});
