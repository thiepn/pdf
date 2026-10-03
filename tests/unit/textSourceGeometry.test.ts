import { describe, expect, it } from "vitest";
import { nativeTextSourceRects } from "../../src/native/textSourceGeometry";
import type { NativeTextObject } from "../../src/types/nativeEditor";

function object(lines?: NativeTextObject["lines"]): NativeTextObject {
  return {
    id: "p1:text:1:paragraph",
    type: "text",
    pageNumber: 1,
    bounds: { x: 40, y: 60, w: 240, h: 54 },
    text: "First styled line Second line",
    fontName: "Helvetica",
    family: "sans-serif",
    size: 10,
    weight: "normal",
    style: "normal",
    writingMode: 0,
    script: "latin",
    editability: "fixed-box",
    reason: "Editable",
    capability: { level: "safe-reconstruction", label: "Safe reconstruction", confidence: .9, reason: "Editable", preserves: [], risks: [] },
    lines
  };
}

describe("P1 precise native text source geometry", () => {
  it("uses retained source span rectangles instead of the broad paragraph union", () => {
    const source = object([
      { objectId: "a", text: "First", bounds: { x: 40, y: 60, w: 32, h: 12 }, fontName: "Helvetica", family: "sans-serif", size: 10, weight: "normal", style: "normal", writingMode: 0 },
      { objectId: "b", text: "styled", bounds: { x: 80, y: 60, w: 38, h: 12 }, fontName: "Helvetica-Bold", family: "sans-serif", size: 10, weight: "bold", style: "normal", writingMode: 0 },
      { objectId: "c", text: "Second line", bounds: { x: 40, y: 82, w: 70, h: 12 }, fontName: "Helvetica", family: "sans-serif", size: 10, weight: "normal", style: "normal", writingMode: 0 }
    ]);
    expect(nativeTextSourceRects(source)).toEqual([
      { x: 40, y: 60, w: 32, h: 12 },
      { x: 80, y: 60, w: 38, h: 12 },
      { x: 40, y: 82, w: 70, h: 12 }
    ]);
  });

  it("falls back to object bounds for raw or legacy text without retained source lines", () => {
    expect(nativeTextSourceRects(object())).toEqual([{ x: 40, y: 60, w: 240, h: 54 }]);
  });
});
