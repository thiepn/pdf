import { describe, expect, it } from "vitest";
import { evaluateStyledTextFit, evaluateTextFit, findFittingFontSize, fitsWithinSourceBaseline } from "../../src/native/textFit";

const box = { x: 20, y: 20, w: 120, h: 36 };

describe("P1 text fit planning", () => {
  it("matches the export worker line-capacity model", () => {
    const result = evaluateTextFit("short text", box, 10, true);
    expect(result.maxLines).toBe(3);
    expect(result.fits).toBe(true);
  });

  it("blocks a replacement that would require silent line truncation", () => {
    const result = evaluateTextFit(Array.from({ length: 30 }, () => "word").join(" "), box, 10, true);
    expect(result.lineCount).toBeGreaterThan(result.maxLines);
    expect(result.heightOverflow).toBe(true);
    expect(result.fits).toBe(false);
  });

  it("finds the largest smaller font that preserves the complete text", () => {
    const text = "one two three four five six seven eight nine ten";
    const requested = evaluateTextFit(text, box, 14, true);
    expect(requested.fits).toBe(false);
    const fitted = findFittingFontSize(text, box, 14, true, 6);
    expect(fitted).not.toBeNull();
    expect(fitted as number).toBeLessThan(14);
    expect(evaluateTextFit(text, box, fitted as number, true).fits).toBe(true);
    expect(evaluateTextFit(text, box, (fitted as number) + 0.25, true).fits).toBe(false);
  });

  it("detects horizontal overflow when wrapping is disabled", () => {
    const result = evaluateTextFit("This deliberately long single line does not fit", box, 10, false);
    expect(result.widthOverflow).toBe(true);
    expect(result.fits).toBe(false);
  });

  it("accepts a replacement whose conservative footprint is no worse than the source baseline", () => {
    const tiny = { x: 0, y: 0, w: 80, h: 12 };
    const source = evaluateTextFit("MAY - JUL\nBudget", tiny, 10, true);
    const replacement = evaluateTextFit("JUN - AUG\nBudget", tiny, 10, true);
    expect(source.fits).toBe(false);
    expect(replacement.fits).toBe(false);
    expect(fitsWithinSourceBaseline(replacement, source)).toBe(true);
  });

  it("still blocks a replacement that increases the source baseline footprint", () => {
    const tiny = { x: 0, y: 0, w: 80, h: 12 };
    const source = evaluateTextFit("MAY - JUL\nBudget", tiny, 10, true);
    const replacement = evaluateTextFit("A much longer replacement that wraps onto extra lines\nBudget", tiny, 10, true);
    expect(fitsWithinSourceBaseline(replacement, source)).toBe(false);
  });

  it("does not measure an entire mixed-style paragraph at its largest run size", () => {
    const mixedBox = { x: 20, y: 20, w: 120, h: 24 };
    const text = "BIG small small small";
    const uniform = evaluateTextFit(text, mixedBox, 16, true);
    const styled = evaluateStyledTextFit([
      { text: "BIG ", fontFamily: "Helvetica", fontSize: 16, color: "#111111" },
      { text: "small small small", fontFamily: "Helvetica", fontSize: 8, color: "#111111" }
    ], mixedBox, true);
    expect(uniform.fits).toBe(false);
    expect(styled.fits).toBe(true);
    expect(styled.lineCount).toBe(1);
  });

  it("uses the largest run for line height without inflating every glyph width", () => {
    const styled = evaluateStyledTextFit([
      { text: "A", fontFamily: "Helvetica", fontSize: 18, color: "#111111" },
      { text: " compact text", fontFamily: "Helvetica", fontSize: 8, color: "#111111" }
    ], { x: 0, y: 0, w: 100, h: 22 }, true);
    expect(styled.fontSize).toBe(18);
    expect(styled.lineHeight).toBeCloseTo(21.6);
    expect(styled.fits).toBe(true);
  });
});
