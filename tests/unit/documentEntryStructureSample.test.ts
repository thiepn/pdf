import { describe, expect, it } from "vitest";
import { inspectDocumentEntryStructure } from "../../src/engines/pdfjsBase";

describe("P2 bounded document-entry structure sampling", () => {
  it("samples at most twelve pages spread across a large document", async () => {
    const requested: number[] = [];
    const document = {
      numPages: 120,
      async getPage(pageNumber: number) {
        requested.push(pageNumber);
        return {
          async getTextContent() { return { items: [{ str: `Page ${pageNumber}` }] }; },
          async getOperatorList() { return { fnArray: [] }; },
          cleanup() {}
        };
      }
    } as any;

    const sample = await inspectDocumentEntryStructure(document);
    expect(sample.sampledPageCount).toBeLessThanOrEqual(12);
    expect(requested).toEqual(sample.sampledPageNumbers);
    expect(requested[0]).toBe(1);
    expect(requested.at(-1)).toBe(120);
    expect(new Set(requested).size).toBe(requested.length);
  });

  it("inspects every page for a small document", async () => {
    const requested: number[] = [];
    const document = {
      numPages: 4,
      async getPage(pageNumber: number) {
        requested.push(pageNumber);
        return {
          async getTextContent() { return { items: [{ str: "Selectable document text".repeat(3) }] }; },
          async getOperatorList() { return { fnArray: [] }; },
          cleanup() {}
        };
      }
    } as any;

    const sample = await inspectDocumentEntryStructure(document);
    expect(requested).toEqual([1, 2, 3, 4]);
    expect(sample.sampledPageCount).toBe(4);
    expect(sample.pagesWithText).toBe(4);
  });
});
