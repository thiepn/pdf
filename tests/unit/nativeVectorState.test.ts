import { describe, expect, it } from "vitest";
import { NATIVE_EDITOR_SCHEMA_VERSION, type NativeVectorEdit, type NativeVectorObject } from "../../src/types/nativeEditor";

const vector: NativeVectorObject = {
  id: "p1:vector:s0:v0:test",
  type: "vector",
  pageNumber: 1,
  bounds: { x: 110, y: 222, w: 140, h: 80 },
  commands: [
    { op: "M", x: 110, y: 262 },
    { op: "C", x1: 150, y1: 222, x2: 210, y2: 222, x3: 250, y3: 262 },
    { op: "L", x: 250, y: 302 },
    { op: "L", x: 110, y: 302 },
    { op: "Z" }
  ],
  paint: "fill-stroke",
  fillColor: "#f0f5ff",
  strokeColor: "#1f52b8",
  fillColorSpace: "RGB",
  strokeColorSpace: "RGB",
  fillComponents: [0.94, 0.96, 1],
  strokeComponents: [0.12, 0.32, 0.72],
  lineWidth: 2.5,
  lineCap: "Round",
  lineJoin: "Round",
  miterLimit: 10,
  dashPattern: [6, 3],
  dashPhase: 1,
  fillAlpha: 1,
  strokeAlpha: 1,
  evenOdd: false,
  blendMode: "Normal",
  clipped: false,
  definesClip: false,
  sourceStreamIndex: 0,
  sourcePathIndex: 0,
  sourceSignature: "fill-stroke|test",
  editability: "source-path",
  capability: { level: "native-safe", label: "Direct path edit", confidence: 0.98, reason: "test", preserves: [], risks: [] }
};

describe("P4 native vector edit schema", () => {
  it("stores source identity and arbitrary geometry transforms without replacement payloads", () => {
    const edit: NativeVectorEdit = {
      id: "vector-edit",
      kind: "vector",
      objectId: vector.id,
      pageNumber: 1,
      action: "edit",
      bounds: { x: 130, y: 230, w: 180, h: 96 },
      sourceBounds: vector.bounds,
      sourceStreamIndex: vector.sourceStreamIndex,
      sourcePathIndex: vector.sourcePathIndex,
      sourceSignature: vector.sourceSignature,
      commands: vector.commands,
      paint: vector.paint,
      rotation: 17.5,
      appearanceOverride: false,
      fillEnabled: true,
      strokeEnabled: true,
      fillColor: vector.fillColor,
      strokeColor: vector.strokeColor,
      lineWidth: vector.lineWidth,
      lineCap: vector.lineCap,
      lineJoin: vector.lineJoin,
      miterLimit: vector.miterLimit,
      dashPattern: vector.dashPattern,
      dashPhase: vector.dashPhase,
      alpha: 1,
      evenOdd: vector.evenOdd
    };

    expect(NATIVE_EDITOR_SCHEMA_VERSION).toBe(4);
    expect(edit.sourceSignature).toBe(vector.sourceSignature);
    expect(edit.rotation).toBe(17.5);
    expect(edit.appearanceOverride).toBe(false);
    expect(edit.bounds).not.toEqual(edit.sourceBounds);
  });

  it("represents deletion as an exact source-path operation", () => {
    const edit: NativeVectorEdit = {
      id: "vector-delete",
      kind: "vector",
      objectId: vector.id,
      pageNumber: 1,
      action: "delete",
      bounds: vector.bounds,
      sourceBounds: vector.bounds,
      sourceStreamIndex: 0,
      sourcePathIndex: 0,
      sourceSignature: vector.sourceSignature,
      commands: vector.commands,
      paint: vector.paint,
      rotation: 0,
      appearanceOverride: false,
      fillEnabled: true,
      strokeEnabled: true,
      fillColor: vector.fillColor,
      strokeColor: vector.strokeColor,
      lineWidth: vector.lineWidth,
      lineCap: vector.lineCap,
      lineJoin: vector.lineJoin,
      miterLimit: vector.miterLimit,
      dashPattern: vector.dashPattern,
      dashPhase: vector.dashPhase,
      alpha: 1,
      evenOdd: false
    };

    expect(edit.action).toBe("delete");
    expect(edit.sourceStreamIndex).toBe(0);
    expect(edit.sourcePathIndex).toBe(0);
  });
});
