import { describe, expect, it } from "vitest";
import panelSource from "../../src/editor/native/LayoutAwareTextPropertiesPanel.tsx?raw";

describe("P1 layout-aware expansion policy", () => {
  it("requires reflow only when edited text needs more vertical space", () => {
    expect(panelSource).toContain("const expansionBaselineHeight = Math.max(object.bounds.h, sourceFit.requiredHeight)");
    expect(panelSource).toContain("fit.requiredHeight > expansionBaselineHeight + 0.5");
    expect(panelSource).toContain("object.bounds.h + (fit.requiredHeight - expansionBaselineHeight)");
    expect(panelSource).toContain("expansionRequired ? plan.shifts.map");
    expect(panelSource).toContain("const useFlow = layoutAware && expansionRequired && plan.ok && !complex");
  });

  it("keeps surrounding content fixed when replacement text already fits", () => {
    expect(panelSource).toContain("The replacement fits inside the existing text region, so surrounding content stays in place.");
    expect(panelSource).not.toContain("may grow or shrink");
  });
});
