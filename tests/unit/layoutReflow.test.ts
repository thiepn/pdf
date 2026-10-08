import { describe, expect, it } from "vitest";
import { classifyTextEditability } from "../../src/native/nativeModel";
import { annotatePageTextFlows, planTextReflow } from "../../src/native/layoutReflow";
import type { NativeImageObject, NativePageTree, NativeTableObject, NativeTextObject } from "../../src/types/nativeEditor";

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


  it("spills an overflowing paragraph into one deterministic adjacent column and pushes that column down", () => {
    const source = page([
      text("a", 50, 40),
      text("b", 50, 130),
      text("right-a", 340, 40, "Right A"),
      text("right-b", 340, 85, "Right B")
    ], 180);
    const plan = planTextReflow(source, "a", 52);
    expect(plan.ok).toBe(true);
    const spill = plan.shifts.find((shift) => shift.objectId === "b");
    expect(spill?.crossRegion).toBe(true);
    expect(spill?.bounds.x).toBe(340);
    expect(spill?.bounds.y).toBe(40);
    expect(plan.shifts.find((shift) => shift.objectId === "right-a")?.bounds.y).toBeGreaterThan(40);
  });

  it("fails closed when the target adjacent region contains unrelated artwork", () => {
    const image: NativeImageObject = {
      id: "right-image",
      type: "image",
      pageNumber: 1,
      bounds: { x: 340, y: 38, w: 150, h: 28 },
      editability: "replace-region",
      capability: { level: "safe-reconstruction", label: "Image", confidence: 1, reason: "fixture", preserves: [], risks: [] }
    };
    const source = page([
      text("a", 50, 40),
      text("b", 50, 130),
      text("right-a", 340, 40, "Right A"),
      text("right-b", 340, 85, "Right B"),
      image
    ], 180);
    const plan = planTextReflow(source, "a", 52);
    expect(plan.ok).toBe(false);
    expect(plan.blockers.join(" ")).toMatch(/image/i);
  });

  it("does not create a two-region thread when either region has another adjacent candidate", () => {
    const source = page([
      text("left-a", 30, 40, "Left A", 150),
      text("left-b", 30, 85, "Left B", 150),
      text("middle-a", 230, 40, "Middle A", 150),
      text("middle-b", 230, 85, "Middle B", 150),
      text("right-a", 430, 40, "Right A", 150),
      text("right-b", 430, 85, "Right B", 150)
    ]);
    const texts = source.objects.filter((object): object is NativeTextObject => object.type === "text");
    expect(texts.every((object) => object.flow && !object.flow.threadId)).toBe(true);
  });

  it("blocks a flow that would push content outside the page", () => {
    const source = page([text("a", 50, 20), text("b", 50, 85), text("c", 50, 130)], 160);
    const plan = planTextReflow(source, "a", 45);
    expect(plan.ok).toBe(false);
    expect(plan.blockers.join(" ")).toMatch(/page boundary/i);
  });

  it("clears stale flow metadata when later table evidence makes the text unsafe for propagation", () => {
    const initiallyAnnotated = page([text("a", 50, 40), text("b", 50, 85)]);
    expect((initiallyAnnotated.objects.find((object) => object.id === "a") as NativeTextObject).flow).toBeDefined();

    const table: NativeTableObject = {
      id: "qualified-table",
      type: "table",
      pageNumber: 1,
      bounds: { x: 40, y: 30, w: 210, h: 90 },
      rows: 2,
      columns: 2,
      cells: [],
      confidence: 0.95,
      editability: "structured-table",
      capability: { level: "safe-reconstruction", label: "Table", confidence: 0.95, reason: "fixture", preserves: [], risks: [] }
    };
    const reannotated = annotatePageTextFlows({ ...initiallyAnnotated, objects: [...initiallyAnnotated.objects, table] });
    const textObjects = reannotated.objects.filter((object): object is NativeTextObject => object.type === "text");
    expect(textObjects.every((object) => object.flow === undefined)).toBe(true);
  });

  it("does not create automatic flows for wide headings", () => {
    const source = page([text("heading", 30, 20, "Wide heading", 520), text("body", 50, 60), text("body2", 50, 90)]);
    const heading = source.objects.find((object) => object.id === "heading") as NativeTextObject;
    expect(heading.flow).toBeUndefined();
    expect(planTextReflow(source, "heading", 40).ok).toBe(false);
  });
});
