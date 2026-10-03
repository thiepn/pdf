import { describe, expect, it } from "vitest";
import { canEncodeWinAnsiText, encodeWinAnsiHex, firstUnencodableWinAnsiCharacter } from "../../src/native/textEncoding";
import panelSource from "../../src/editor/native/LayoutAwareTextPropertiesPanel.tsx?raw";

describe("P1 Latin text encoding preflight", () => {
  it("accepts Windows-1252 text used by the native Latin writer", () => {
    expect(canEncodeWinAnsiText("Résumé — €100 “approved”")).toBe(true);
    expect(firstUnencodableWinAnsiCharacter("Résumé — €100")).toBeUndefined();
  });

  it("rejects Latin-script Unicode characters outside Windows-1252 before export", () => {
    expect(canEncodeWinAnsiText("Ā")).toBe(false);
    expect(firstUnencodableWinAnsiCharacter("ok Ā later")).toBe("Ā");
  });

  it("uses the exact same byte mapping as the export worker contract", () => {
    expect(encodeWinAnsiHex("A€—")).toBe("<418097>");
    expect(() => encodeWinAnsiHex("Ā")).toThrow(/cannot be encoded/i);
  });

  it("wires the shared preflight into the manual existing-text editor", () => {
    expect(panelSource).toContain("firstUnencodableWinAnsiCharacter");
    expect(panelSource).toContain("queueBlocked");
    expect(panelSource).toContain("blocks the edit now instead of failing during export");
  });
});
