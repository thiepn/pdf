import { describe, expect, it } from "vitest";
import { classifyTextEditability } from "../../src/native/nativeModel";
import { buildPreservedEditRuns } from "../../src/native/textStyle";
import type { NativeTextObject } from "../../src/types/nativeEditor";

function object(): NativeTextObject {
  const source = "Hello bold world";
  return {
    id: "paragraph",
    type: "text",
    pageNumber: 1,
    bounds: { x: 40, y: 40, w: 180, h: 20 },
    text: source,
    fontName: "Helvetica",
    family: "sans-serif",
    size: 10,
    weight: "normal",
    style: "normal",
    writingMode: 0,
    paragraph: true,
    lineCount: 1,
    lineHeight: 12,
    runs: [
      { text: "Hello ", start: 0, end: 6, bounds: { x: 40, y: 40, w: 35, h: 12 }, fontName: "Helvetica", family: "sans-serif", size: 10, weight: "normal", style: "normal", color: "#111111", writingMode: 0 },
      { text: "bold", start: 6, end: 10, bounds: { x: 75, y: 40, w: 24, h: 12 }, fontName: "Helvetica-Bold", family: "sans-serif", size: 10, weight: "bold", style: "normal", color: "#cc0000", writingMode: 0 },
      { text: " world", start: 10, end: source.length, bounds: { x: 99, y: 40, w: 42, h: 12 }, fontName: "Helvetica", family: "sans-serif", size: 10, weight: "normal", style: "normal", color: "#111111", writingMode: 0 }
    ],
    ...classifyTextEditability(source, "Helvetica")
  };
}

describe("P2 source formatting preservation", () => {
  it("retains exact style spans when text is only repositioned", () => {
    const runs = buildPreservedEditRuns(object(), "Hello bold world");
    expect(runs.map((run) => run.text).join("")).toBe("Hello bold world");
    expect(runs).toHaveLength(3);
    expect(runs[1]).toMatchObject({ text: "bold", fontWeight: "bold", color: "#cc0000" });
  });

  it("keeps unchanged prefix/suffix styling and gives replacement text the nearest source style", () => {
    const runs = buildPreservedEditRuns(object(), "Hello brave world");
    expect(runs.map((run) => run.text).join("")).toBe("Hello brave world");
    const brave = runs.find((run) => run.text.includes("brave") || run.text.includes("rave"));
    expect(brave?.fontWeight).toBe("bold");
    expect(brave?.color).toBe("#cc0000");
    expect(runs.at(-1)).toMatchObject({ fontWeight: "normal", color: "#111111" });
  });

  it("preserves unchanged interior formatting across two separate edits", () => {
    const runs = buildPreservedEditRuns(object(), "Hi bold earth");
    expect(runs.map((run) => run.text).join("")).toBe("Hi bold earth");
    const bold = runs.find((run) => run.text.includes("bold"));
    expect(bold).toMatchObject({ fontWeight: "bold", color: "#cc0000" });
    expect(runs[0]).toMatchObject({ fontWeight: "normal", color: "#111111" });
    expect(runs.at(-1)).toMatchObject({ fontWeight: "normal", color: "#111111" });
  });

  it("keeps repeated untouched styled anchors between multiple changed regions", () => {
    const source = object();
    source.text = "Alpha bold middle bold Omega";
    source.runs = [
      { text: "Alpha ", start: 0, end: 6, bounds: { x: 40, y: 40, w: 35, h: 12 }, fontName: "Helvetica", family: "sans-serif", size: 10, weight: "normal", style: "normal", color: "#111111", writingMode: 0 },
      { text: "bold", start: 6, end: 10, bounds: { x: 75, y: 40, w: 24, h: 12 }, fontName: "Helvetica-Bold", family: "sans-serif", size: 10, weight: "bold", style: "normal", color: "#cc0000", writingMode: 0 },
      { text: " middle ", start: 10, end: 18, bounds: { x: 99, y: 40, w: 45, h: 12 }, fontName: "Helvetica", family: "sans-serif", size: 10, weight: "normal", style: "normal", color: "#111111", writingMode: 0 },
      { text: "bold", start: 18, end: 22, bounds: { x: 144, y: 40, w: 24, h: 12 }, fontName: "Helvetica-Bold", family: "sans-serif", size: 10, weight: "bold", style: "normal", color: "#cc0000", writingMode: 0 },
      { text: " Omega", start: 22, end: 28, bounds: { x: 168, y: 40, w: 42, h: 12 }, fontName: "Helvetica", family: "sans-serif", size: 10, weight: "normal", style: "normal", color: "#111111", writingMode: 0 }
    ];
    const runs = buildPreservedEditRuns(source, "First bold middle bold Last");
    expect(runs.map((run) => run.text).join("")).toBe("First bold middle bold Last");
    expect(runs.filter((run) => run.text.includes("bold"))).toHaveLength(2);
    expect(runs.filter((run) => run.text.includes("bold")).every((run) => run.fontWeight === "bold" && run.color === "#cc0000")).toBe(true);
  });

  it("falls back to the paragraph style when no source runs exist", () => {
    const source = { ...object(), runs: undefined };
    const runs = buildPreservedEditRuns(source, "Replacement");
    expect(runs).toEqual([expect.objectContaining({ text: "Replacement", fontFamily: "Helvetica", fontSize: 10 })]);
  });
});
