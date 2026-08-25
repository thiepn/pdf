import { describe, expect, it } from "vitest";
import { MAX_NATIVE_OVERLAY_HITBOXES, nativeOverlayObjectsWithinBudget } from "../../src/editor/native/nativeOverlayBudget";
import type { NativePageObject } from "../../src/types/nativeEditor";

function object(id: string, type: NativePageObject["type"]): NativePageObject {
  return { id, type } as NativePageObject;
}

describe("R10 native overlay responsiveness budget", () => {
  it("caps a dense page at the direct-hitbox budget", () => {
    const objects = Array.from({ length: MAX_NATIVE_OVERLAY_HITBOXES + 250 }, (_, index) => object(`v${index}`, "vector"));
    const result = nativeOverlayObjectsWithinBudget(objects, new Set());

    expect(result.objects).toHaveLength(MAX_NATIVE_OVERLAY_HITBOXES);
    expect(result.omitted).toBe(250);
    expect(objects).toHaveLength(MAX_NATIVE_OVERLAY_HITBOXES + 250);
  });

  it("prioritizes semantic objects over low-level vectors on dense pages", () => {
    const vectors = Array.from({ length: 900 }, (_, index) => object(`v${index}`, "vector"));
    const semantic = [object("text", "text"), object("image", "image"), object("form", "form"), object("table", "table")];
    const result = nativeOverlayObjectsWithinBudget([...vectors, ...semantic], new Set(), 10);

    expect(result.objects.map((item) => item.id)).toEqual(["text", "image", "form", "table", "v0", "v1", "v2", "v3", "v4", "v5"]);
    expect(result.omitted).toBe(894);
  });

  it("keeps selected objects directly selectable even when they fall beyond the normal cap", () => {
    const objects = Array.from({ length: 20 }, (_, index) => object(`v${index}`, "vector"));
    const selected = new Set(["v19"]);
    const result = nativeOverlayObjectsWithinBudget(objects, selected, 5);

    expect(result.objects).toHaveLength(5);
    expect(result.objects[0].id).toBe("v19");
    expect(result.objects.some((item) => item.id === "v19")).toBe(true);
  });

  it("returns the original array unchanged when the page is already within budget", () => {
    const objects = [object("a", "text"), object("b", "vector")];
    const result = nativeOverlayObjectsWithinBudget(objects, new Set(), 5);

    expect(result.objects).toBe(objects);
    expect(result.omitted).toBe(0);
  });
});
