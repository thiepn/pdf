import { describe, expect, it } from "vitest";
import {
  classifyImageFidelity,
  classifyTableGeometry,
  vectorAppearanceOverrideRisks
} from "../../src/native/nativeFidelity";
import type { NativeVectorObject } from "../../src/types/nativeEditor";

function vector(overrides: Partial<NativeVectorObject> = {}): NativeVectorObject {
  return {
    id: "vector",
    type: "vector",
    pageNumber: 1,
    bounds: { x: 10, y: 10, w: 100, h: 50 },
    commands: [{ op: "M", x: 10, y: 10 }, { op: "L", x: 110, y: 10 }],
    paint: "fill-stroke",
    fillColorSpace: "RGB",
    strokeColorSpace: "RGB",
    fillComponents: [0, 0, 0],
    strokeComponents: [0, 0, 0],
    lineWidth: 1,
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
    sourcePathIndex: 0,
    sourceSignature: "fixture",
    editability: "source-path",
    capability: { level: "native-safe", label: "fixture", confidence: 1, reason: "fixture", preserves: [], risks: [] },
    ...overrides
  };
}

describe("P17 deep native-content fidelity policy", () => {
  it("keeps plain and shared image instances editable without mutating shared resource semantics", () => {
    const plain = classifyImageFidelity({ invocationCount: 1 });
    const shared = classifyImageFidelity({ invocationCount: 3 });
    expect(plain.editability).toBe("replace-region");
    expect(plain.fidelity?.class).toBe("plain");
    expect(shared.editability).toBe("replace-region");
    expect(shared.fidelity?.class).toBe("shared");
    expect(shared.capability.preserves.join(" ")).toMatch(/Other image instances/i);
  });

  it("qualifies attached soft masks only for source-preserving transform and delete actions", () => {
    const classified = classifyImageFidelity({ softMask: true });
    expect(classified.editability).toBe("replace-region");
    expect(classified.fidelity?.class).toBe("masked");
    expect(classified.fidelity?.allowedActions).toEqual(["transform", "delete"]);
    expect(classified.fidelity?.allowedActions).not.toContain("replace");
    expect(classified.capability.level).toBe("safe-reconstruction");
  });

  it("fails closed for explicit masks, clipping, non-Normal blending, and ambiguous images", () => {
    for (const evidence of [
      { explicitMask: true },
      { clipped: true },
      { blendMode: "Multiply" },
      { ambiguous: true }
    ]) {
      const classified = classifyImageFidelity(evidence);
      expect(classified.editability).toBe("fidelity-protected");
      expect(classified.fidelity?.allowedActions).toEqual([]);
      expect(classified.capability.level).toBe("unsupported");
    }
  });

  it("permits vector appearance override only for simple inherited graphics state", () => {
    expect(vectorAppearanceOverrideRisks(vector())).toEqual([]);
    expect(vectorAppearanceOverrideRisks(vector({ clipped: true }))).toContain("the path is inside an inherited clipping region");
    expect(vectorAppearanceOverrideRisks(vector({ blendMode: "Multiply" }))[0]).toMatch(/Multiply/);
    expect(vectorAppearanceOverrideRisks(vector({ fillColorSpace: "Pattern" })).join(" ")).toMatch(/Pattern/);
  });

  it("classifies nonuniform, merged and merged-irregular table grids explicitly", () => {
    expect(classifyTableGeometry([20, 20], [100, 100], 0)).toBe("regular");
    expect(classifyTableGeometry([20, 22], [100, 110], 0)).toBe("nonuniform");
    expect(classifyTableGeometry([20, 50], [100, 100], 0)).toBe("irregular");
    expect(classifyTableGeometry([20, 20], [100, 100], 1)).toBe("merged");
    expect(classifyTableGeometry([20, 50], [100, 100], 1)).toBe("merged-irregular");
  });
});
