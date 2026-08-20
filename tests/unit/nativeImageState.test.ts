import { describe, expect, it } from "vitest";
import { NATIVE_EDITOR_SCHEMA_VERSION, type NativeImageEdit } from "../../src/types/nativeEditor";

describe("P3 native image edit schema", () => {
  it("supports source transforms without replacement bytes", () => {
    const edit: NativeImageEdit = {
      id: "image-transform",
      kind: "image",
      objectId: "p1:image:0",
      pageNumber: 1,
      action: "transform",
      bounds: { x: 10, y: 20, w: 120, h: 80 },
      sourceBounds: { x: 5, y: 10, w: 100, h: 60 },
      removeUnderlying: true,
      fit: "cover",
      rotation: 90,
      opacity: 0.65
    };

    expect(NATIVE_EDITOR_SCHEMA_VERSION).toBe(4);
    expect(edit.bytes).toBeUndefined();
    expect(edit.action).toBe("transform");
    expect(edit.rotation).toBe(90);
  });

  it("supports deletion without image payload", () => {
    const edit: NativeImageEdit = {
      id: "image-delete",
      kind: "image",
      objectId: "p1:image:0",
      pageNumber: 1,
      action: "delete",
      bounds: { x: 5, y: 10, w: 100, h: 60 },
      sourceBounds: { x: 5, y: 10, w: 100, h: 60 },
      removeUnderlying: true,
      fit: "contain"
    };
    expect(edit.bytes).toBeUndefined();
    expect(edit.action).toBe("delete");
  });
});
