import { describe, expect, it } from "vitest";
import { bookletOrder } from "../../src/professional/imposition";
import { buildSimpleDocx } from "../../src/professional/docx";
import { readAppRoute, routeHref } from "../../src/core/appRouter";
import { parsePageSelection } from "../../src/organizer/pageSelection";

describe("Phase 7 professional helpers", () => {
  it("creates correct booklet side order with blank padding", () => {
    expect(bookletOrder(6)).toEqual([[null,1],[2,null],[6,3],[4,5]]);
  });

  it("creates a ZIP-based DOCX package containing document XML", () => {
    const bytes = buildSimpleDocx("Test & title", ["First paragraph", "Second paragraph"]);
    expect(Array.from(bytes.slice(0,4))).toEqual([0x50,0x4b,0x03,0x04]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("word/document.xml");
    expect(text).toContain("Test &amp; title");
  });


  it("uses the shared page-selection language for Bates ranges", () => {
    const result = parsePageSelection("1-6,!2,!last", 6);
    expect(result.errors).toEqual([]);
    expect([...result.pages]).toEqual([1,3,4,5]);
  });

  it("exports only document text with page breaks and valid XML characters", () => {
    const bytes = buildSimpleDocx("Not body text", ["Café & 안녕하세요", "\f", "Second \u0000paragraph", "emoji 😀"], false);
    const archive = new TextDecoder().decode(bytes);
    const document = archive.match(/<w:document[\s\S]*?<\/w:document>/)?.[0] ?? "";
    expect(document).not.toContain("Not body text");
    expect(document).toContain("Café &amp; 안녕하세요");
    expect(document).toContain('<w:br w:type="page"/>');
    expect(document).not.toContain("\u0000");
    expect(document).toContain("emoji 😀");
  });

  it("routes professional project workspaces", () => {
    expect(readAppRoute("#/professional/project-7")).toEqual({ name: "professional", projectId: "project-7" });
    expect(routeHref({ name: "professional", projectId: "a b" })).toBe("#/workspace/a%20b/professional");
  });
});
