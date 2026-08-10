import { describe, expect, it } from "vitest";
import { deleteItems, duplicateItems, moveItems, normalizeRotation, rotateItems } from "../../src/organizer/pagePlan";
import type { PagePlanItem } from "../../src/types/organizer";

function items(): PagePlanItem[] {
  return [0, 1, 2].map((sourcePageIndex) => ({ id: `p${sourcePageIndex}`, sourcePageIndex, rotation: 0, selected: sourcePageIndex === 1 }));
}

describe("page plan", () => {
  it("normalizes rotations", () => expect(normalizeRotation(-90)).toBe(270));
  it("duplicates selected pages after the source", () => expect(duplicateItems(items(), new Set(["p1"])).map((item) => item.sourcePageIndex)).toEqual([0, 1, 1, 2]));
  it("does not delete the final remaining page", () => {
    const one = [items()[0]];
    expect(deleteItems(one, new Set(["p0"]))).toEqual(one);
  });
  it("moves a selected page", () => expect(moveItems(items(), new Set(["p0"]), 3).map((item) => item.id)).toEqual(["p1", "p2", "p0"]));
  it("rotates only selected ids", () => expect(rotateItems(items(), new Set(["p1"]), 90)[1].rotation).toBe(90));
});
