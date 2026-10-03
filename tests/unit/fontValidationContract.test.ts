import { describe, expect, it } from "vitest";
import clientSource from "../../src/native/fontValidation.ts?raw";
import workerSource from "../../src/workers/font-validation.worker.ts?raw";
import panelSource from "../../src/editor/native/LayoutAwareTextPropertiesPanel.tsx?raw";

describe("P1 imported font preflight", () => {
  it("uses a lazy MuPDF worker to validate the exact font bytes before queueing", () => {
    expect(clientSource).toContain('new URL("../workers/font-validation.worker.ts", import.meta.url)');
    expect(workerSource).toContain('new (mupdf as any).Font');
    expect(workerSource).toContain("font.encodeCharacter(code)");
    expect(panelSource).toContain("await validateImportedFont(bytes, name, text)");
  });

  it("fails closed on corrupt fonts, unreadable worker messages, and startup failure", () => {
    expect(workerSource).toContain("FONT_VALIDATION_ERROR");
    expect(clientSource).toContain("worker.onmessageerror");
    expect(clientSource).toContain("worker.onerror");
    expect(clientSource).toContain("WORKER_STARTUP_TIMEOUT_MS");
  });

  it("bounds font imports and reports missing current-text glyphs before Apply", () => {
    expect(clientSource).toContain("MAX_IMPORTED_FONT_BYTES");
    expect(panelSource).toContain("Missing:");
    expect(panelSource).toContain('fontValidation.phase === "checking"');
    expect(panelSource).toContain("Could not use this font");
  });
});
