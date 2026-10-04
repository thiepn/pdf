import type { InstalledOcrLanguage, OcrPageResult, OcrWord } from "../types/ocr";

export type OcrConfidenceBand = "high" | "review" | "low";

export interface NormalizedOcrRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrLayerWord {
  text: string;
  confidence: number;
  rect: NormalizedOcrRect;
}

export interface OcrLayerPage {
  pageNumber: number;
  words: OcrLayerWord[];
}

export function ocrWordText(word: OcrWord): string {
  return (word.correctedText ?? word.text).trim();
}

export function ocrConfidenceBand(confidence: number): OcrConfidenceBand {
  if (confidence < 60) return "low";
  if (confidence < 82) return "review";
  return "high";
}

export function normalizeOcrRect(word: OcrWord, page: Pick<OcrPageResult, "width" | "height">): NormalizedOcrRect {
  const width = Math.max(1, page.width);
  const height = Math.max(1, page.height);
  return {
    x0: Math.max(0, Math.min(1, word.bbox.x0 / width)),
    y0: Math.max(0, Math.min(1, word.bbox.y0 / height)),
    x1: Math.max(0, Math.min(1, word.bbox.x1 / width)),
    y1: Math.max(0, Math.min(1, word.bbox.y1 / height))
  };
}

export function buildOcrLayerPages(results: OcrPageResult[]): OcrLayerPage[] {
  return results
    .filter((page) => page.status === "complete")
    .map((page) => ({
      pageNumber: page.pageNumber,
      words: page.words
        .filter((word) => !word.ignored && Boolean(ocrWordText(word)))
        .map((word) => ({ text: ocrWordText(word), confidence: word.confidence, rect: normalizeOcrRect(word, page) }))
    }))
    .filter((page) => page.words.length > 0)
    .sort((left, right) => left.pageNumber - right.pageNumber);
}

export function correctedPageText(page: OcrPageResult): string {
  if (!page.words.length) return page.text;
  const visible = page.words.filter((word) => !word.ignored).map(ocrWordText).filter(Boolean);
  return visible.join(" ");
}

export function updateOcrWord(page: OcrPageResult, index: number, value: string): OcrPageResult {
  const words = page.words.map((word, wordIndex) => wordIndex === index
    ? { ...word, correctedText: value, corrected: true, ignored: !value.trim() }
    : word);
  return { ...page, words, text: words.filter((word) => !word.ignored).map(ocrWordText).filter(Boolean).join(" "), updatedAt: Date.now() };
}

export function mergeRegionRecognition(
  page: OcrPageResult,
  region: NormalizedOcrRect,
  recognized: OcrWord[],
  renderedRegion: { x: number; y: number; width: number; height: number }
): OcrPageResult {
  const regionPixels = {
    x0: region.x0 * page.width,
    y0: region.y0 * page.height,
    x1: region.x1 * page.width,
    y1: region.y1 * page.height
  };
  const outside = page.words.filter((word) => {
    const cx = (word.bbox.x0 + word.bbox.x1) / 2;
    const cy = (word.bbox.y0 + word.bbox.y1) / 2;
    return cx < regionPixels.x0 || cx > regionPixels.x1 || cy < regionPixels.y0 || cy > regionPixels.y1;
  });
  const mapped = recognized.map((word) => ({
    ...word,
    bbox: {
      x0: word.bbox.x0 + renderedRegion.x,
      y0: word.bbox.y0 + renderedRegion.y,
      x1: word.bbox.x1 + renderedRegion.x,
      y1: word.bbox.y1 + renderedRegion.y
    }
  }));
  const words = [...outside, ...mapped].sort((left, right) => left.bbox.y0 - right.bbox.y0 || left.bbox.x0 - right.bbox.x0);
  return { ...page, words, text: words.map(ocrWordText).filter(Boolean).join(" "), updatedAt: Date.now() };
}

const localeToTesseract: Array<[RegExp, string]> = [
  [/^ko\b/i, "kor"],
  [/^ja\b/i, "jpn"],
  [/^zh(?:-Hans|-CN|-SG)?\b/i, "chi_sim"],
  [/^zh(?:-Hant|-TW|-HK|-MO)\b/i, "chi_tra"],
  [/^de\b/i, "deu"],
  [/^fr\b/i, "fra"],
  [/^es\b/i, "spa"],
  [/^it\b/i, "ita"],
  [/^pt\b/i, "por"],
  [/^tr\b/i, "tur"],
  [/^en\b/i, "eng"]
];

export function suggestInstalledOcrLanguages(installed: InstalledOcrLanguage[], locales: readonly string[]): string[] {
  const available = new Set(installed.map((item) => item.code));
  const suggested: string[] = [];
  for (const locale of locales) {
    const match = localeToTesseract.find(([pattern]) => pattern.test(locale));
    if (match && available.has(match[1]) && !suggested.includes(match[1])) suggested.push(match[1]);
  }
  if (!suggested.length && available.has("eng")) suggested.push("eng");
  return suggested.slice(0, 3);
}
