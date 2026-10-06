import { describe, expect, it } from "vitest";
import layoutPanelSource from "../../src/editor/native/LayoutAwareTextPropertiesPanel.tsx?raw";
import legacyPanelSource from "../../src/editor/native/LegacyNativeContentPropertiesPanel.tsx?raw";

describe("P1 native text properties history synchronization", () => {
  it("rehydrates layout-aware controls when the queued primary edit changes", () => {
    expect(layoutPanelSource).toContain("setText(queued?.text ?? object.text)");
    expect(layoutPanelSource).toContain("setFontBytes(queued?.fontBytes)");
    expect(layoutPanelSource).toContain("}, [object.id, queued, shaped]);");
  });

  it("keeps the legacy fallback synchronized with the same history source", () => {
    expect(legacyPanelSource).toContain("}, [object.id, queued]);");
  });
});
