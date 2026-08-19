import { describe, expect, it } from "vitest";
import { evaluateTextFit, findFittingFontSize } from "../../src/native/textFit";

const box = { x: 20, y: 20, w: 120, h: 36 };

describe("P1 text fit planning", () => {
  it("matches the export worker line-capacity model", () => {
    const result = evaluateTextFit("short text", box, 10, true);
    expect(result.maxLines).toBe(2);
    expect(result.fits).toBe(true);
  });

  it("blocks a replacement that would require silent line truncation", () => {
    const result = evaluateTextFit("one two three four five six seven eight nine ten eleven twelve thirteen", box, 10, true);
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
});
