import { describe, expect, it } from "vitest";
import imports from "../../src/product/product.css?raw";
import tokens from "../../src/product/studio-tokens-d11.css?raw";
import chrome from "../../src/product/studio-chrome-d11.css?raw";
import foundation from "../../src/product/foundation.css?raw";
import home from "../../src/product/studio-workspace-d1.css?raw";
import directory from "../../src/product/studio-discovery-d2.css?raw";
import editor from "../../src/product/studio-editor-d3-live.css?raw";
import quick from "../../src/product/studio-quicktools-d5-live.css?raw";

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
