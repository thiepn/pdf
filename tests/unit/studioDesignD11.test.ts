import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Vitest can resolve CSS ?raw imports to empty strings in its Node test runner.
// Read literal repository files instead, so these assertions fail on missing
// or wrong CSS rather than depending on the Vite CSS transformation pipeline.
const productSource = (filename: string): string =>
  readFileSync(new URL(`../../src/product/${filename}`, import.meta.url), "utf8");

const imports = productSource("product.css");
const tokens = productSource("studio-tokens-d11.css");
const chrome = productSource("studio-chrome-d11.css");
const foundation = productSource("foundation.css");
const home = productSource("studio-workspace-d1.css");
const directory = productSource("studio-discovery-d2.css");
const editor = productSource("studio-editor-d3-live.css");
const quick = productSource("studio-quicktools-d5-live.css");

const importedFiles = Array.from(imports.matchAll(/@import\s+"\.\/([^"]+)";/g), (match) => match[1]);
const tokenNames = Array.from(tokens.matchAll(/(--studio-[a-z0-9-]+)\s*:/g), (match) => match[1]);
const tokenDefinitions = new Set(tokenNames);

describe("D11 visual design-system contract", () => {
  it("loads tokens immediately after the foundation and chrome at the end", () => {
    expect(importedFiles.slice(0, 2)).toEqual(["foundation.css", "studio-tokens-d11.css"]);
    expect(importedFiles.at(-1)).toBe("studio-chrome-d11.css");
    expect(new Set(importedFiles).size).toBe(importedFiles.length);
    expect(importedFiles).toContain("studio-editor-d10-status.css");
  });

  it("defines every referenced studio token and retains semantic color fallback", () => {
    for (const [path, source] of Object.entries({
      foundation, home, directory, editor, quick, chrome
    })) {
      for (const [, name] of source.matchAll(/var\((--studio-[a-z0-9-]+)/g)) {
        expect(tokenDefinitions.has(name), `${path}: undefined ${name}`).toBe(true);
      }
    }
    expect(tokens).toContain("--studio-panel-border: var(--line)");
    expect(tokens).toContain("--studio-focus-ring: var(--focus, var(--accent))");
  });

  it("keeps one real set of color mappings and supplies dark-system colors", () => {
    for (const tone of ["green", "rose", "amber", "blue", "indigo", "violet"]) {
      expect(foundation).toContain(`.task-glyph[data-tone="${tone}"]`);
      expect(foundation).toContain(`var(--studio-glyph-${tone}-fg)`);
      expect(foundation).toContain(`var(--studio-glyph-${tone}-bg)`);
      expect(tokens).toContain(`--studio-glyph-${tone}-fg:`);
      expect(tokens).toContain(`--studio-glyph-${tone}-bg:`);
    }
    expect(tokens).toContain(':root[data-theme="dark"] .product-app');
    expect(tokens).toContain(':root[data-theme="system"] .product-app');
    expect(chrome).toContain("@media (forced-colors: active)");
  });

  it("uses the same title and card typography across Home and Tool Library", () => {
    for (const sheet of [home, directory]) {
      expect(sheet).toContain("font-size: var(--studio-type-title)");
      expect(sheet).toContain("font-size: var(--studio-type-body)");
      expect(sheet).toContain("font-size: var(--studio-type-caption)");
      expect(sheet).toContain("width: min(var(--studio-page-max)");
    }
    expect(chrome).toContain(".product-tool-card__body > strong");
    expect(chrome).toContain("font-size: var(--studio-type-body)");
  });
});
