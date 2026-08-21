import { describe, expect, it } from "vitest";
import { discardNativeObjectEdits, findNativeReflowQueueConflict, mergeNativeEdits, nativeChangedPages } from "../../src/native/nativeEditQueue";
import type { NativeEdit } from "../../src/types/nativeEditor";

function cell(id: string, objectId: string, cellId: string, text: string): NativeEdit {
  return { id, kind: "table-cell", objectId, cellId, pageNumber: 2, bounds: { x: 0, y: 0, w: 10, h: 10 }, originalText: "old", text, fontSize: 10 };
}

function text(id: string, objectId: string, reflowFollower = false): NativeEdit {
  return {
    id,
    kind: "text",
    objectId,
    pageNumber: 1,
    originalText: "old",
    text: "new",
    bounds: { x: 0, y: 0, w: 100, h: 20 },
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111111",
    backgroundColor: "transparent",
    align: "left",
    mode: "replace",
    wrap: true,
    fontSource: "built-in",
    reflowFollower
  };
}

describe("native edit queue", () => {
  it("replaces a table object batch atomically", () => {
    const current = [cell("a", "table-1", "c1", "one"), cell("b", "table-1", "c2", "two")];
    const next = mergeNativeEdits(current, [cell("c", "table-1", "c1", "updated")]);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("c");
  });

  it("retains unrelated object edits", () => {
    const current = [cell("a", "table-1", "c1", "one"), cell("b", "table-2", "c1", "two")];
    const next = mergeNativeEdits(current, [cell("c", "table-1", "c2", "updated")]);
    expect(next.map((edit) => edit.id)).toEqual(["b", "c"]);
  });

  it("discards all edits belonging to one detected object", () => {
    const current = [cell("a", "table-1", "c1", "one"), cell("b", "table-1", "c2", "two"), cell("c", "table-2", "c1", "three")];
    expect(discardNativeObjectEdits(current, "table-1").map((edit) => edit.id)).toEqual(["c"]);
  });

  it("returns sorted unique changed pages", () => {
    const edits = [cell("a", "t1", "c1", "one"), { ...cell("b", "t2", "c1", "two"), pageNumber: 1 }, { ...cell("c", "t3", "c1", "three"), pageNumber: 2 }];
    expect(nativeChangedPages(edits)).toEqual([1, 2]);
  });

  it("blocks editing a paragraph already owned by another queued reflow", () => {
    const current = [text("p2-reflow:upstream:middle", "middle", true)];
    expect(findNativeReflowQueueConflict(current, "middle", ["tail"])?.id).toBe("p2-reflow:upstream:middle");
  });

  it("blocks a new reflow when a downstream follower has a foreign edit", () => {
    const current = [text("manual-tail", "tail")];
    expect(findNativeReflowQueueConflict(current, "source", ["middle", "tail"])?.id).toBe("manual-tail");
  });

  it("allows a source paragraph to replace its own prior follower moves", () => {
    const current = [text("source-primary", "source"), text("p2-reflow:source:tail", "tail", true)];
    expect(findNativeReflowQueueConflict(current, "source", ["tail"])).toBeUndefined();
  });
});
