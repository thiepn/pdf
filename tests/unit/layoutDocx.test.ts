import { describe, expect, it } from "vitest";
import type { NativeInspection } from "../../src/types/nativeEditor";
import { buildLayoutAwareDocxPackage, createLayoutDocxModel, storeBinaryZip } from "../../src/professional/layoutDocx";

const capability = {
  level: "safe-reconstruction",
  label: "test",
  confidence: 0.9,
  reason: "test",
  preserves: [],
  risks: []
} as const;

function text(id: string, value: string, x: number, y: number, w = 220, h = 22, extra: Record<string, unknown> = {}) {
  return {
    id, type: "text", pageNumber: 1, bounds: { x, y, w, h }, text: value,
    fontName: "ABCDEF+Inter-Bold", family: "sans-serif", size: 12,
    weight: "bold", style: "normal", color: "#223344", writingMode: 0,
    script: "latin", editability: "fixed-box", reason: "test", capability,
    paragraph: true, direction: "ltr", align: "left",
    runs: [{ text: value, start: 0, end: value.length, bounds: { x, y, w, h }, fontName: "ABCDEF+Inter-Bold", family: "sans-serif", size: 12, weight: "bold", style: "normal", color: "#223344", writingMode: 0 }],
    ...extra
  };
}

function inspection(): NativeInspection {
  return {
    pageCount: 1,
    canEdit: true,
    fonts: [],
    totals: { text: 4, images: 1, vectors: 1, tables: 1, forms: 0, complex: 0 },
    warnings: [],
    pages: [{
      pageNumber: 1, originX: 0, originY: 0, width: 612, height: 792,
      objects: [
        text("heading", "Quarterly report", 54, 48, 504, 24),
        text("cell-a", "Revenue", 72, 150, 120, 18),
        text("cell-b", "€42m", 220, 150, 90, 18),
        {
          id: "table-1", type: "table", pageNumber: 1, bounds: { x: 60, y: 130, w: 320, h: 80 },
          rows: 2, columns: 2, rowHeights: [40, 40], columnWidths: [160, 160],
          cells: [
            { id: "a", row: 0, column: 0, text: "Revenue", bounds: { x: 60, y: 130, w: 160, h: 40 }, fontSize: 10, align: "left", verticalAlign: "middle" },
            { id: "b", row: 0, column: 1, text: "€42m", bounds: { x: 220, y: 130, w: 160, h: 40 }, fontSize: 10, align: "right", verticalAlign: "middle" },
            { id: "c", row: 1, column: 0, columnSpan: 2, text: "Editable merged note", bounds: { x: 60, y: 170, w: 320, h: 40 }, fontSize: 10, align: "center", verticalAlign: "middle" }
          ],
          headerRows: 1, mergedCells: 1, confidence: 0.93, editability: "structured-table", capability
        },
        text("body", "This paragraph stays editable.", 54, 250, 360, 42),
        { id: "image-1", type: "image", pageNumber: 1, bounds: { x: 400, y: 130, w: 120, h: 90 }, width: 400, height: 300, editability: "replace-region", capability },
        {
          id: "vector-1", type: "vector", pageNumber: 1, bounds: { x: 400, y: 260, w: 80, h: 50 },
          commands: [], paint: "stroke", lineWidth: 1, lineCap: "butt", lineJoin: "miter", miterLimit: 10, dashPattern: [], dashPhase: 0,
          fillAlpha: 1, strokeAlpha: 1, evenOdd: false, blendMode: "Normal", clipped: false, definesClip: false,
          sourceStreamIndex: 0, sourcePathIndex: 0, sourceSignature: "x", editability: "source-path", capability
        }
      ]
    }]
  } as unknown as NativeInspection;
}

describe("P13 layout-aware DOCX", () => {
  it("reconstructs editable paragraphs, tables and images without duplicating table text", () => {
    const images = new Map([["image-1", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]]);
    const model = createLayoutDocxModel(inspection(), [1], images);
    expect(model.pages).toHaveLength(1);
    expect(model.report).toMatchObject({ paragraphCount: 2, tableCount: 1, imageCount: 1, skippedComplexTables: 0 });
    const paragraphs = model.pages[0].blocks.filter((block) => block.kind === "paragraph");
    expect(paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join(""))).toEqual([
      "Quarterly report",
      "This paragraph stays editable."
    ]);
    expect(model.pages[0].blocks.some((block) => block.kind === "table")).toBe(true);
    expect(model.pages[0].blocks.some((block) => block.kind === "image")).toBe(true);
    expect(model.warnings.some((warning) => /Vector artwork/.test(warning))).toBe(true);
  });

  it("writes Word tables, direct text styling, image relationships and page geometry", () => {
    const images = new Map([["image-1", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]]);
    const model = createLayoutDocxModel(inspection(), [1], images);
    const bytes = buildLayoutAwareDocxPackage("Quarterly report", model);
    const raw = new TextDecoder().decode(bytes);
    expect(raw).toContain("<w:tbl>");
    expect(raw).toContain('<w:gridSpan w:val="2"/>');
    expect(raw).toContain("<w:b/>");
    expect(raw).toContain('<w:color w:val="223344"/>');
    expect(raw).toContain("word/media/image1.png");
    expect(raw).toContain('r:embed="rIdImage1"');
    expect(raw).toContain('<w:pgSz w:w="12240" w:h="15840"');
    expect(raw).toContain("Layout-aware editable export reconstructed locally from PDF structure.");
  });

  it("keeps the ZIP builder binary-safe for embedded media", () => {
    const marker = new Uint8Array([0, 1, 2, 255, 0, 9, 8, 7]);
    const bytes = storeBinaryZip([
      { name: "a.txt", bytes: new TextEncoder().encode("hello") },
      { name: "word/media/image1.png", bytes: marker }
    ]);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const raw = new TextDecoder().decode(bytes);
    expect(raw).toContain("a.txt");
    expect(raw).toContain("word/media/image1.png");
    expect(raw).toContain("hello");
  });

  it("reports heuristic multi-column order instead of claiming exact fidelity", () => {
    const source = inspection();
    source.pages[0].objects = [
      text("left-1", "Left one", 54, 100, 200, 20, { flow: { id: "left", index: 0, bounds: { x: 54, y: 100, w: 200, h: 200 } } }),
      text("left-2", "Left two", 54, 180, 200, 20, { flow: { id: "left", index: 1, bounds: { x: 54, y: 100, w: 200, h: 200 } } }),
      text("right-1", "Right one", 330, 105, 200, 20, { flow: { id: "right", index: 0, bounds: { x: 330, y: 105, w: 200, h: 200 } } }),
      text("right-2", "Right two", 330, 185, 200, 20, { flow: { id: "right", index: 1, bounds: { x: 330, y: 105, w: 200, h: 200 } } })
    ] as any;
    const model = createLayoutDocxModel(source, [1]);
    expect(model.report.multiColumnPages).toEqual([1]);
    expect(model.warnings.some((warning) => /Multi-column reading order/.test(warning))).toBe(true);
    const values = model.pages[0].blocks.map((block) => block.kind === "paragraph" ? block.runs.map((run) => run.text).join("") : "");
    expect(values).toEqual(["Left one", "Left two", "Right one", "Right two"]);
  });
});
