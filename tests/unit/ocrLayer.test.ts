import { describe, expect, it } from "vitest";
import {
  buildOcrLayerPages,
  mergeRegionRecognition,
  ocrConfidenceBand,
  ocrWordText,
  restoreOcrWord,
  suggestInstalledOcrLanguages,
  updateOcrWord
} from "../../src/ocr/ocrLayer";
import type { OcrPageResult } from "../../src/types/ocr";

function page(): OcrPageResult {
  return {
    id: "job:1",
    jobId: "job",
    projectId: "project",
    pageNumber: 1,
    status: "complete",
    text: "Alpha Beta",
    confidence: 78,
    words: [
      { text: "Alpha", confidence: 95, bbox: { x0: 100, y0: 50, x1: 200, y1: 90 } },
      { text: "Beta", confidence: 52, bbox: { x0: 220, y0: 50, x1: 300, y1: 90 } }
    ],
    width: 1000,
    height: 500,
    updatedAt: 1
  };
}

describe("P3 OCR 2.0 layer model", () => {
  it("normalizes OCR words into reusable page-relative coordinates", () => {
    const layers = buildOcrLayerPages([page()]);
    expect(layers).toHaveLength(1);
    expect(layers[0].words[0]).toMatchObject({
      text: "Alpha",
      rect: { x0: .1, y0: .1, x1: .2, y1: .18 }
    });
  });

  it("keeps original recognition provenance through correction, exclusion and restore", () => {
    const corrected = updateOcrWord(page(), 1, "Gamma");
    expect(corrected.words[1]).toMatchObject({ text: "Beta", correctedText: "Gamma", corrected: true, ignored: false });
    expect(ocrWordText(corrected.words[1])).toBe("Gamma");
    const excluded = updateOcrWord(corrected, 1, "");
    expect(excluded.words[1].ignored).toBe(true);
    expect(buildOcrLayerPages([excluded])[0].words.map((word) => word.text)).toEqual(["Alpha"]);
    const restored = restoreOcrWord(excluded, 1);
    expect(restored.words[1]).toEqual(page().words[1]);
    expect(ocrWordText(restored.words[1])).toBe("Beta");
  });

  it("classifies low-confidence evidence without changing OCR text", () => {
    expect(ocrConfidenceBand(59)).toBe("low");
    expect(ocrConfidenceBand(60)).toBe("review");
    expect(ocrConfidenceBand(81)).toBe("review");
    expect(ocrConfidenceBand(82)).toBe("high");
  });

  it("replaces only OCR evidence whose center falls inside a re-recognized region", () => {
    const source = page();
    const next = mergeRegionRecognition(
      source,
      { x0: .2, y0: .05, x1: .4, y1: .25 },
      [{ text: "Better", confidence: 91, bbox: { x0: 5, y0: 4, x1: 55, y1: 24 } }],
      { x: 200, y: 25, width: 200, height: 100, pageWidth: 1000, pageHeight: 500 }
    );
    expect(next.words.map((word) => word.text)).toEqual(["Alpha", "Better"]);
    expect(next.words[1].bbox).toEqual({ x0: 205, y0: 29, x1: 255, y1: 49 });
  });

  it("suggests multiple installed languages from browser locales without forcing unavailable packs", () => {
    const installed = [
      { code: "eng", label: "English", byteLength: 1, source: "download" as const, installedAt: 1 },
      { code: "deu", label: "German", byteLength: 1, source: "download" as const, installedAt: 1 },
      { code: "kor", label: "Korean", byteLength: 1, source: "download" as const, installedAt: 1 }
    ];
    expect(suggestInstalledOcrLanguages(installed, ["de-DE", "ko-KR", "fr-FR"])).toEqual(["deu", "kor"]);
  });
});
