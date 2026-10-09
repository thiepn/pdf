import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}
const imports = source("src/product/product.css");
const d3 = source("src/product/studio-editor-d3-live.css");
const d12 = source("src/product/studio-visual-qa-d12.css");
const original = source("src/product/workspace.css");
const d11 = source("tests/unit/studioDesignD11.test.ts");

describe("D12 CSS ownership and real-browser regression policy", () => {
  it("keeps the new viewport correction as a single, last, scoped stylesheet", () => {
    const all = Array.from(imports.matchAll(/@import\s+"\.\/([^"]+)";/g), ([, file]) => file);
    expect(all.at(-1)).toBe("studio-visual-qa-d12.css");
    expect(all.filter((file) => file === "studio-visual-qa-d12.css")).toHaveLength(1);
    expect(all.indexOf("studio-chrome-d11.css")).toBe(all.length - 2);
  });

  it("removes conflicting tablet toolbar scroll ownership from D3", () => {
    expect(d3).not.toMatch(/\.editing-toolbar\s*\{\s*justify-content:\s*flex-start;\s*overflow-x:\s*auto/);
    expect(d12).toContain(".editing-toolbar__primary");
    expect(d12).toContain("overflow-x: auto;");
    expect(d12).toContain("flex: 0 0 auto;");
    expect(d12).toContain("white-space: nowrap;");
  });

  it("preserves discoverable recommendation actions and compact document stage", () => {
    expect(original).toContain(".document-entry-recommendations__list");
    expect(d12).toContain("max-height: min(168px, 22dvh);");
    expect(d12).toContain("overflow-y: auto;");
    expect(d12).not.toMatch(/\.document-entry-overlay\s*\{[^}]*display:\s*none/);
  });

  it("disallows PDF render mutation and new high-priority overrides in QA CSS", () => {
    expect(d12).not.toMatch(/!important/i);
    expect(d12).not.toMatch(/\btransform\s*:/);
    expect(d12).not.toMatch(/\bzoom\s*:/);
    expect(d12).not.toMatch(/\bcanvas\s*\{/);
    expect(d12).not.toMatch(/\bdisplay\s*:\s*none\b/);
  });

  it("does not depend on the Vitest CSS raw-import transform for source audits", () => {
    expect(d11).toContain('readFileSync(');
    expect(d11).not.toContain('.css?raw');
  });
});
