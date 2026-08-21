import { describe, expect, it } from "vitest";
import {
  analyzePdfContainerFeatures,
  chooseFidelitySamplePages,
  comparePdfFidelityProfiles,
  stableTextDigest,
  type PdfFidelityProfile
} from "../../src/fidelity/pdfFidelity";

function profile(overrides: Partial<PdfFidelityProfile> = {}): PdfFidelityProfile {
  return {
    pageCount: 3,
    sampledPages: [1, 2, 3],
    affectedPages: [2],
    container: { encrypted: false, incrementalUpdates: 1, objectStreams: false, xrefStreams: false, linearized: false, previousXref: false },
    outlineEntries: 2,
    attachmentCount: 1,
    formFieldCount: 1,
    hasJavaScript: false,
    pageLabelsDigest: stableTextDigest('["i","1","2"]'),
    coreMetadata: { Title: "Fixture", Author: "PDF Studio" },
    geometry: [
      { pageNumber: 1, view: [0, 0, 612, 792], rotation: 0, userUnit: 1 },
      { pageNumber: 2, view: [20, 30, 520, 730], rotation: 90, userUnit: 1 },
      { pageNumber: 3, view: [0, 0, 612, 792], rotation: 0, userUnit: 1 }
    ],
    semantics: [
      { pageNumber: 1, textCharacters: 5, textDigest: stableTextDigest("alpha"), imageOperations: 1, vectorOperations: 2, annotationCount: 0, linkCount: 1, widgetCount: 0 },
      { pageNumber: 2, textCharacters: 4, textDigest: stableTextDigest("beta"), imageOperations: 0, vectorOperations: 1, annotationCount: 0, linkCount: 0, widgetCount: 1 },
      { pageNumber: 3, textCharacters: 5, textDigest: stableTextDigest("gamma"), imageOperations: 2, vectorOperations: 0, annotationCount: 1, linkCount: 0, widgetCount: 0 }
    ],
    ...overrides
  };
}

describe("P8 PDF fidelity", () => {
  it("detects compatibility-significant container features without parsing binary streams as text", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Linearized 1 >> endobj\n/Type /ObjStm\n/Type /XRef\n/Encrypt 9 0 R\nstartxref\n10\n%%EOF\n/Prev 10\nstartxref\n20\n%%EOF");
    expect(analyzePdfContainerFeatures(bytes)).toEqual({
      encrypted: true,
      incrementalUpdates: 2,
      objectStreams: true,
      xrefStreams: true,
      linearized: true,
      previousXref: true
    });
  });

  it("covers normal affected pages completely and remains bounded for huge batch edits", () => {
    expect(chooseFidelitySamplePages(12, [4, 7])).toEqual(expect.arrayContaining([1, 4, 7, 12]));
    const huge = chooseFidelitySamplePages(1000, Array.from({ length: 1000 }, (_, index) => index + 1));
    expect(huge.length).toBeLessThanOrEqual(32);
    expect(huge[0]).toBe(1);
    expect(huge.at(-1)).toBe(1000);
  });

  it("allows semantic changes on an edited page while preserving its geometry and widgets", () => {
    const source = profile();
    const output = profile({
      semantics: source.semantics.map((page) => page.pageNumber === 2
        ? { ...page, textCharacters: 40, textDigest: stableTextDigest("edited content"), imageOperations: 3, vectorOperations: 9 }
        : page)
    });
    expect(comparePdfFidelityProfiles(source, output)).toMatchObject({ passed: true, failures: [] });
  });

  it("fails closed when an untouched page changes", () => {
    const source = profile();
    const output = profile({
      semantics: source.semantics.map((page) => page.pageNumber === 1 ? { ...page, textDigest: stableTextDigest("mutated") } : page)
    });
    const report = comparePdfFidelityProfiles(source, output);
    expect(report.passed).toBe(false);
    expect(report.failures).toContain("Untouched page 1 text extraction changed.");
  });

  it("fails closed on page-box, rotation, encryption, attachment, outline, form and label regressions", () => {
    const source = profile();
    const output = profile({
      container: { ...source.container, encrypted: true },
      outlineEntries: 0,
      attachmentCount: 0,
      formFieldCount: 0,
      pageLabelsDigest: stableTextDigest("changed"),
      geometry: source.geometry.map((page) => page.pageNumber === 2 ? { ...page, rotation: 180 } : page)
    });
    const report = comparePdfFidelityProfiles(source, output);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/encryption state|Outline entry count|Attachment count|Form field count|Page labels|rotation/);
  });

  it("reports normalization risk for incremental and linearized sources without rejecting a semantically valid export", () => {
    const source = profile({ container: { encrypted: false, incrementalUpdates: 3, objectStreams: true, xrefStreams: true, linearized: true, previousXref: true } });
    const output = profile({ container: { encrypted: false, incrementalUpdates: 1, objectStreams: false, xrefStreams: false, linearized: false, previousXref: false } });
    const report = comparePdfFidelityProfiles(source, output);
    expect(report.passed).toBe(true);
    expect(report.warnings.join(" ")).toMatch(/incremental revisions/);
    expect(report.warnings.join(" ")).toMatch(/linearized/);
  });
});
