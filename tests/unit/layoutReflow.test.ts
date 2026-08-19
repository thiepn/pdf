import { describe, expect, it } from "vitest";
import { classifyTextEditability } from "../../src/native/nativeModel";
import { annotatePageTextFlows, planTextReflow } from "../../src/native/layoutReflow";
import type { NativeImageObject, NativePageTree, NativeTextObject } from "../../src/types/nativeEditor";

function text(id: string, x: number, y: number, value = id, w = 180, h = 12): NativeTextObject {
  return {
    id,
    type: "text",
    pageNumber: 1,
    bounds: { x, y, w, h },
    text: value,
    fontName: "Helvetica",
    family: "sans-serif",
    size: 10,
    weight: "normal",
    style: "normal",
    writingMode: 0,
    direction: "ltr",
    paragraph: true,
    lineCount: 1,
    lineHeight: 12,
    ...classifyTextEditability(value, "Helvetica")
  };
}

function page(objects: NativePageTree["objects"], height = 300): NativePageTree {
  return annotatePageTextFlows({ pageNumber: 1, originX: 0, originY: 0, width: 612, height, objects });
}

describe("P2 layout-aware text reflow", () => {
  it("pushes only later text in the same detected column", () => {
    const source = page([
      text("a", 50, 40),
      text("b", 50, 80),
      text("c", 50, 120),
      text("other-column", 340, 70, "Other column", 160)
    ]);
    const plan = planTextReflow(source, "a", 30);
    expect(plan.ok).toBe(true);
    expect(plan.deltaY).toBe(18);
    expect(plan.shifts.map((shift) => shift.objectId)).toEqual(["b", "c"]);
    expect(plan.shifts.map((shift) => shift.bounds.y)).toEqual([98, 138]);
    expect(plan.shifts.some((shift) => shift.objectId === "other-column")).toBe(false);
  });

  it("pulls following paragraphs upward when the edited paragraph contracts", () => {
    const source = page([text("a", 50, 40, "Long source", 180, 28), text("b", 50, 90), text("c", 50, 130)]);
    const plan = planTextReflow(source, "a", 16);
    expect(plan.ok).toBe(true);
    expect(plan.deltaY).toBe(-12);
    expect(plan.shifts[0]?.bounds.y).toBe(78);
    expect(plan.shifts[1]?.bounds.y).toBe(118);
  });

  it("blocks reflow instead of moving through an image", () => {
    const image: NativeImageObject = {
      id: "image",
      type: "image",
      pageNumber: 1,
      bounds: { x: 60, y: 91, w: 120, h: 24 },
      editability: "replace-region",
      capability: { level: "safe-reconstruction", label: "Image", confidence: 1, reason: "fixture", preserves: [], risks: [] }
    };
    const source = page([text("a", 50, 40), text("b", 50, 80), text("c", 50, 130), image]);
    const plan = planTextReflow(source, "a", 32);
    expect(plan.ok).toBe(false);
    expect(plan.blockers.join(" ")).toMatch(/image/i);
  });

  it("blocks a flow that would push content outside the page", () => {
    const source = page([text("a", 50, 20), text("b", 50, 85), text("c", 50, 130)], 160);
    const plan = planTextReflow(source, "a", 45);
    expect(plan.ok).toBe(false);
    expect(plan.blockers.join(" ")).toMatch(/page boundary/i);
  });

  it("does not create automatic flows for wide headings", () => {
    const source = page([text("heading", 30, 20, "Wide heading", 520), text("body", 50, 60), text("body2", 50, 90)]);
    const heading = source.objects.find((object) => object.id === "heading") as NativeTextObject;
    expect(heading.flow).toBeUndefined();
    expect(planTextReflow(source, "heading", 40).ok).toBe(false);
  });
});
