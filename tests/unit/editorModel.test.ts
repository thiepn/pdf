import { describe, expect, it } from "vitest";
import { createObjectForTool, duplicateObjects, normalizeRect, snapRect } from "../../src/editor/editorModel";

const page = { x0: 0, y0: 0, x1: 600, y1: 800 };

describe("editor model", () => {
  it("normalizes reverse drag rectangles", () => {
    expect(normalizeRect({ x0: 100, y0: 120, x1: 20, y1: 40 })).toEqual({ x0: 20, y0: 40, x1: 100, y1: 120 });
  });

  it("creates all text-markup variants", () => {
    for (const tool of ["highlight", "underline", "strikeout", "squiggly"] as const) {
      const object = createObjectForTool({ tool, pageNumber: 1, bounds: { x0: 10, y0: 20, x1: 120, y1: 40 }, author: "Test", zIndex: 1 });
      expect(object?.type).toBe("highlight");
      if (object?.type === "highlight") expect(object.style).toBe(tool);
    }
  });

  it("duplicates objects with stable source and fresh identity", () => {
    const source = createObjectForTool({ tool: "text", pageNumber: 1, bounds: { x0: 10, y0: 10, x1: 100, y1: 50 }, author: "Test", zIndex: 1 });
    if (!source) throw new Error("Fixture creation failed");
    const result = duplicateObjects([source], new Set([source.id]));
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(source.id);
    expect(result[1].id).not.toBe(source.id);
    expect(result[1].bounds.x0).toBe(source.bounds.x0 + 12);
  });

  it("snaps objects to page center without leaving page bounds", () => {
    const result = snapRect({ x0: 248, y0: 300, x1: 348, y1: 360 }, page, 8, true);
    expect((result.rect.x0 + result.rect.x1) / 2).toBe(300);
    expect(result.guides.some((guide) => guide.axis === "x" && guide.value === 300)).toBe(true);
  });
});
