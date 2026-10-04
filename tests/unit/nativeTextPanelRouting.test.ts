import { describe, expect, it } from "vitest";
import panelSource from "../../src/editor/native/NativeContentPropertiesPanel.tsx?raw";
import editorSource from "../../src/views/EditorPage.tsx?raw";

describe("P1 layout-aware text panel routing", () => {
  it("routes native text objects through the layout-aware properties panel", () => {
    expect(panelSource).toContain('if (object.type === "text" && page)');
    expect(panelSource).toContain("<LayoutAwareTextPropertiesPanel");
    expect(panelSource).toContain("page={page}");
  });

  it("provides the selected native object's actual page model from the unified editor", () => {
    expect(editorSource).toContain("const selectedNativePage = useMemo");
    expect(editorSource).toContain("page.pageNumber === selectedNativeObject.pageNumber");
    expect(editorSource).toContain("page={selectedNativePage}");
  });
});
