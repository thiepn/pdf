import { describe, expect, it } from "vitest";
import type { Rect } from "../../src/core/coordinates";
import {
  alignBounds,
  canvasToEditorRect,
  canvasToNativeRect,
  distributeBounds,
  editorRectToCanvas,
  matchSizeBounds,
  nativeDeleteEdit,
  nativeGeometryEdit,
  nativeLayoutItem,
  nativeRectToCanvas,
  nativeRotationEdit,
  type UnifiedLayoutItem
} from "../../src/editor/unifiedLayout";
import type { NativeFormObject, NativeImageObject, NativePageTree, NativeVectorObject } from "../../src/types/nativeEditor";

const capability = { level: "native-safe" as const, label: "test", confidence: 1, reason: "test", preserves: [], risks: [] };
const page: NativePageTree = { pageNumber: 1, originX: 10, originY: 20, width: 600, height: 760, objects: [] };

const image: NativeImageObject = {
  id: "image-1",
  type: "image",
  pageNumber: 1,
  bounds: { x: 110, y: 220, w: 120, h: 80 },
  width: 800,
  height: 600,
  editability: "replace-region",
  capability
};

const vector: NativeVectorObject = {
  id: "vector-1",
  type: "vector",
  pageNumber: 1,
  bounds: { x: 250, y: 300, w: 100, h: 60 },
  commands: [{ op: "M", x: 250, y: 300 }, { op: "L", x: 350, y: 360 }, { op: "Z" }],
  paint: "fill-stroke",
  fillColor: "#ffffff",
  strokeColor: "#111111",
  lineWidth: 2,
  lineCap: "Butt",
  lineJoin: "Miter",
  miterLimit: 10,
  dashPattern: [],
  dashPhase: 0,
  fillAlpha: 1,
  strokeAlpha: 1,
  evenOdd: false,
  blendMode: "Normal",
  clipped: false,
  definesClip: false,
  sourceStreamIndex: 0,
  sourcePathIndex: 1,
  sourceSignature: "vector-source",
  editability: "source-path",
  capability
};

const form: NativeFormObject = {
  id: "form-1",
  type: "form",
  pageNumber: 1,
  bounds: { x: 100, y: 100, w: 120, h: 24 },
  widgetIndex: 0,
  fieldType: "text",
  name: "Name",
  label: "Name",
  value: "Alice",
  options: [],
  readOnly: false,
  multiline: false,
  password: false,
  signed: false,
  editability: "field-value",
  capability
};

function item(key: string, x: number, y: number, w: number, h: number): UnifiedLayoutItem {
  return { key, source: key.startsWith("native") ? "native" : "editor", id: key, pageNumber: 1, type: "shape", bounds: { x, y, w, h }, rotation: 0, movable: true, resizable: true, rotatable: true };
}

describe("P6 unified coordinate model", () => {
  it("round-trips overlay and native rectangles in one top-left page space", () => {
    const pdfPage: Rect = { x0: 10, y0: 20, x1: 610, y1: 780 };
    const overlay: Rect = { x0: 110, y0: 600, x1: 210, y1: 660 };
    const canvas = editorRectToCanvas(overlay, pdfPage);
    expect(canvas).toEqual({ x: 100, y: 120, w: 100, h: 60 });
    expect(canvasToEditorRect(canvas, pdfPage)).toEqual(overlay);

    const native = { x: 110, y: 140, w: 100, h: 60 };
    expect(nativeRectToCanvas(native, page)).toEqual({ x: 100, y: 120, w: 100, h: 60 });
    expect(canvasToNativeRect({ x: 100, y: 120, w: 100, h: 60 }, page)).toEqual(native);
  });
});

describe("P6 multi-object layout", () => {
  const items = [item("editor:a", 20, 40, 80, 40), item("native:b", 180, 100, 60, 60), item("editor:c", 360, 180, 120, 30)];

  it("aligns mixed items to the selection and to the page", () => {
    const left = alignBounds(items, "left");
    expect(left.get("editor:a")?.x).toBe(20);
    expect(left.get("native:b")?.x).toBe(20);
    expect(left.get("editor:c")?.x).toBe(20);

    const pageCenter = alignBounds(items, "center", { width: 600, height: 760 });
    expect(pageCenter.get("editor:a")?.x).toBe(260);
    expect(pageCenter.get("native:b")?.x).toBe(270);
    expect(pageCenter.get("editor:c")?.x).toBe(240);
  });

  it("distributes centers and matches size using one reference item", () => {
    const distributed = distributeBounds(items, "horizontal");
    expect(distributed.get("native:b")?.x).toBeCloseTo(220, 6);
    const sized = matchSizeBounds(items, "editor:a", "both");
    expect(sized.get("native:b")?.w).toBe(80);
    expect(sized.get("native:b")?.h).toBe(40);
  });
});

describe("P6 qualified native adapters", () => {
  it("turns image movement into a P3 transform without replacement bytes", () => {
    const result = nativeGeometryEdit(image, { x: 140, y: 240, w: 160, h: 90 }, []);
    expect(result.blocked).toBeUndefined();
    expect(result.edit?.kind).toBe("image");
    if (result.edit?.kind !== "image") throw new Error("Expected image edit");
    expect(result.edit.action).toBe("transform");
    expect(result.edit.bytes).toBeUndefined();
    expect(result.edit.sourceBounds).toEqual(image.bounds);
  });

  it("preserves P4 source identity for vector geometry and rotation", () => {
    const moved = nativeGeometryEdit(vector, { x: 270, y: 320, w: 130, h: 70 }, []);
    expect(moved.edit?.kind).toBe("vector");
    if (moved.edit?.kind !== "vector") throw new Error("Expected vector edit");
    expect(moved.edit.sourceSignature).toBe(vector.sourceSignature);
    const rotated = nativeRotationEdit(vector, 90, [moved.edit]);
    expect(rotated.edit?.kind).toBe("vector");
    if (rotated.edit?.kind !== "vector") throw new Error("Expected vector edit");
    expect(rotated.edit.rotation).toBe(90);
  });

  it("blocks interactive form geometry rather than flattening or rebuilding it", () => {
    const layout = nativeLayoutItem(form, page, []);
    expect(layout.movable).toBe(false);
    expect(layout.resizable).toBe(false);
    const result = nativeGeometryEdit(form, { x: 130, y: 130, w: 150, h: 30 }, []);
    expect(result.edit).toBeUndefined();
    expect(result.blocked).toMatch(/form geometry/i);
  });

  it("only exposes source-safe deletion for P3/P4/P5 object types", () => {
    expect(nativeDeleteEdit(image, []).edit?.kind).toBe("image");
    expect(nativeDeleteEdit(vector, []).edit?.kind).toBe("vector");
    expect(nativeDeleteEdit(form, []).edit).toBeUndefined();
  });
});
