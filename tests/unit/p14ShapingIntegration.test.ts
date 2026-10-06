import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shapeComplexText } from "../../src/workers/complexTextShaping";

const fontPath = process.env.P14_ARABIC_FONT_PATH;
const qualified = Boolean(fontPath);

describe("P14 HarfBuzz Arabic shaping integration", () => {
  it.runIf(qualified)("shapes Arabic joining and mixed-direction text with real font metrics", () => {
    const bytes = new Uint8Array(readFileSync(fontPath!));
    const arabic = shapeComplexText(bytes, "سلام عليكم", 16, 300, true, 20, "rtl");
    expect(arabic.lines).toHaveLength(1);
    expect(arabic.lines[0].runs.length).toBeGreaterThan(0);
    expect(arabic.lines[0].runs.flatMap((run) => run.glyphs).every((glyph) => glyph.gid > 0)).toBe(true);
    expect(arabic.maxLineWidth).toBeGreaterThan(0);

    const mixed = shapeComplexText(bytes, "الإصدار PDF 123 (اختبار)", 16, 340, true, 20, "rtl");
    expect(mixed.lines[0].runs.some((run) => run.direction === "rtl")).toBe(true);
    expect(mixed.lines[0].runs.some((run) => run.direction === "ltr")).toBe(true);
    expect(mixed.requiredHeight).toBeLessThanOrEqual(40);
  });
});
