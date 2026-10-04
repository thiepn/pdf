import { describe, expect, it } from "vitest";
import { deleteItems, duplicateItems, moveItems, moveItemsBy, moveItemsToPosition, normalizeRotation, rotateItems } from "../../src/organizer/pagePlan";
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
  it("moves a touch-selected group one step while preserving its order", () => {
    const source = [0, 1, 2, 3, 4].map((sourcePageIndex) => ({ id: `p${sourcePageIndex}`, sourcePageIndex, rotation: 0 as const, selected: false }));
    expect(moveItemsBy(source, new Set(["p1", "p3"]), -1).map((item) => item.id)).toEqual(["p1", "p0", "p3", "p2", "p4"]);
    expect(moveItemsBy(source, new Set(["p1", "p3"]), 1).map((item) => item.id)).toEqual(["p0", "p2", "p1", "p4", "p3"]);
  });
  it("moves a selected block directly to a requested output position", () => {
    const source = [0, 1, 2, 3, 4].map((sourcePageIndex) => ({ id: `p${sourcePageIndex}`, sourcePageIndex, rotation: 0 as const, selected: false }));
    expect(moveItemsToPosition(source, new Set(["p1", "p2"]), 4).map((item) => item.id)).toEqual(["p0", "p3", "p4", "p1", "p2"]);
  });
  it("rotates only selected ids", () => expect(rotateItems(items(), new Set(["p1"]), 90)[1].rotation).toBe(90));
});
