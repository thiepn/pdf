import { describe, expect, it } from "vitest";
import { alignPageTexts, pageTextSimilarity } from "../../src/comparison/alignment";
import { htmlToCreatorBlocks } from "../../src/creator/htmlImport";
import { layoutCreatorDocument, wrapCreatorText } from "../../src/creator/layout";
import { parseMarkdownBlocks, parsePlainTextBlocks } from "../../src/creator/markdown";
import { DEFAULT_CREATOR_STYLE } from "../../src/creator/presets";
import { parseBatchRecipeJson, serializeBatchRecipe } from "../../src/processing/batchModel";
import type { BatchRecipe } from "../../src/types/batch";

describe("Phase 25 advanced web capabilities", () => {
  it("parses Markdown structures without interpreting raw formatting as PDF text", () => {
    const blocks = parseMarkdownBlocks("# Title\n\nParagraph with **bold** text.\n\n- One\n- Two\n\n> Quote\n\n```\ncode\n```");
    expect(blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "bullet", "bullet", "quote", "code"]);
    expect(blocks[1]).toMatchObject({ type: "paragraph", text: "Paragraph with bold text." });
  });

  it("imports semantic HTML without scripts, styles, or embedded active content", () => {
    const blocks = htmlToCreatorBlocks(`<article><h1>Heading</h1><p>Paragraph <strong>text</strong>.</p><ul><li>One</li><li>Two</li></ul><script>alert(1)</script><style>body{display:none}</style></article>`);
    expect(blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "bullet", "bullet"]);
    expect(blocks.map((block) => "text" in block ? block.text : "").join(" ")).not.toContain("alert");
  });

  it("paginates creator content using metric page geometry", () => {
    const blocks = parsePlainTextBlocks(Array.from({ length: 80 }, (_, index) => `Paragraph ${index + 1} contains enough text to exercise the page layout engine and wrapping behavior.`).join("\n\n"));
    const layout = layoutCreatorDocument(blocks, { ...DEFAULT_CREATOR_STYLE, pagePreset: "a4", pageNumbers: true });
    expect(layout.pageWidthPt).toBeCloseTo(595.28, 1);
    expect(layout.pageHeightPt).toBeCloseTo(841.89, 1);
    expect(layout.pages.length).toBeGreaterThan(1);
    expect(layout.pages.every((page) => page.commands.some((command) => command.type === "text"))).toBe(true);
  });

  it("wraps CJK text without requiring spaces", () => {
    expect(wrapCreatorText("한국어문장을공백없이길게작성합니다한국어문장을공백없이길게작성합니다", 70, 11).length).toBeGreaterThan(1);
  });

  it("aligns inserted pages instead of shifting every later pair", () => {
    const rows = alignPageTexts(["alpha page", "beta page", "gamma page"], ["alpha page", "inserted material", "beta page", "gamma page"]);
    expect(rows.map((row) => row.status)).toEqual(["same", "inserted", "same", "same"]);
    expect(rows[2]).toMatchObject({ leftPage: 2, rightPage: 3 });
    expect(pageTextSimilarity("A stable sentence", "A stable sentence")).toBe(1);
  });

  it("round-trips portable Batch 2.0 recipe JSON", () => {
    const recipe: BatchRecipe = { schemaVersion: 2, id: "local", name: "Portable", steps: [{ id: "s1", type: "optimize" }, { id: "s2", type: "remove-metadata" }], outputSuffix: "clean", updatedAt: 1 };
    const imported = parseBatchRecipeJson(serializeBatchRecipe(recipe));
    expect(imported.name).toBe("Portable");
    expect(imported.steps.map((step) => step.type)).toEqual(["optimize", "remove-metadata"]);
    expect(imported.id).not.toBe("local");
  });
});
