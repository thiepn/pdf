import { describe, expect, it } from "vitest";
import { classifyResponsiveWidth, deriveViewportMetrics } from "../../src/mobile/layoutPolicy";

describe("Phase 23 responsive layout policy", () => {
  it("separates phone, tablet, and desktop widths", () => {
    expect(classifyResponsiveWidth(390)).toBe("phone");
    expect(classifyResponsiveWidth(834)).toBe("tablet");
    expect(classifyResponsiveWidth(1280)).toBe("desktop");
  });

  it("derives software-keyboard inset from VisualViewport", () => {
    expect(deriveViewportMetrics(844, 510, 0)).toMatchObject({ keyboardOpen: true, keyboardInset: 334, visualHeight: 510 });
  });

  it("does not treat small viewport changes as a keyboard", () => {
    expect(deriveViewportMetrics(844, 790, 0).keyboardOpen).toBe(false);
  });
});
