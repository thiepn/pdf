import * as mupdf from "mupdf";
import type { OcrLayerPage, OcrLayerWord } from "../ocr/ocrLayer";

interface ApplyRequest {
  type: "APPLY_OCR_LAYER";
  requestId: string;
  bytes: ArrayBuffer;
  pages: OcrLayerPage[];
  password?: string;
}
interface CancelRequest { type: "CANCEL"; requestId: string }
type Request = ApplyRequest | CancelRequest;

type PdfDocument = InstanceType<typeof mupdf.PDFDocument>;
type PdfPage = ReturnType<PdfDocument["loadPage"]>;
type PdfObject = ReturnType<PdfDocument["newDictionary"]>;

const cancelled = new Set<string>();
let sequence = 0;

function active(requestId: string): void {
  if (cancelled.has(requestId)) throw new DOMException("OCR layer export cancelled.", "AbortError");
}

function auth(pdf: PdfDocument, password?: string): void {
  if (!pdf.needsPassword()) return;
  if (!password || !pdf.authenticatePassword(password)) throw new Error("The PDF password is required or incorrect.");
}

function shallow(pdf: PdfDocument, source: PdfObject): PdfObject {
  const copy = pdf.newDictionary();
  if (source.isDictionary()) source.forEach((value, key) => {
    try { copy.put(key, value); } finally { value.destroy(); }
  });
  return copy;
}

function append(pdf: PdfDocument, object: PdfObject, commands: string): void {
  const existing = object.get("Contents");
  const contents = pdf.newArray();
  const prefix = pdf.addStream("q\n", {});
  const suffix = pdf.addStream(`\nQ\n${commands}`, {});
  try {
    contents.push(prefix);
    if (existing.isArray()) {
      for (let index = 0; index < existing.length; index += 1) {
        const stream = existing.get(index);
        try { if (!stream.isNull()) contents.push(stream); } finally { stream.destroy(); }
      }
    } else if (!existing.isNull()) contents.push(existing);
    contents.push(suffix);
    object.put("Contents", contents);
  } finally {
    prefix.destroy();
    suffix.destroy();
    existing.destroy();
    contents.destroy();
  }
}

function inverseMatrix(matrix: number[]): number[] {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return [1, 0, 0, 1, 0, 0];
  return [d / determinant, -b / determinant, -c / determinant, a * 0 + (b * e - a * f) / determinant, 0, 0];
}

function invert(matrix: number[]): number[] {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return [1, 0, 0, 1, 0, 0];
  return [d / determinant, -b / determinant, -c / determinant, a / determinant, (c * f - d * e) / determinant, (b * e - a * f) / determinant];
}

const winAnsi = new Map([..."€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ"].map((character, index) => [character.codePointAt(0)!, index + 128]));

type FontLanguage = "ko" | "ja" | "zh-Hans" | "zh-Hant" | "latin";

function languageFor(text: string): FontLanguage | null {
  let cjk: FontLanguage | null = null;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code >= 0xac00 && code <= 0xd7af) cjk = "ko";
    else if ((code >= 0x3040 && code <= 0x30ff)) cjk = "ja";
    else if (code >= 0x3400 && code <= 0x9fff) cjk ??= "zh-Hans";
    else if (!(code >= 32 && code < 127 || code >= 160 && code <= 255 || winAnsi.has(code))) return null;
  }
  return cjk ?? "latin";
}

function encode(text: string, language: FontLanguage): string {
  let hex = "";
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (language !== "latin") {
      if (code > 0xffff) throw new Error("OCR word contains a character outside the supported embedded Unicode range.");
      hex += code.toString(16).padStart(4, "0");
    } else {
      const byte = code >= 32 && code < 127 || code >= 160 && code <= 255 ? code : winAnsi.get(code);
      if (byte === undefined) throw new Error("OCR word contains a character that cannot be embedded safely.");
      hex += byte.toString(16).padStart(2, "0");
    }
  }
  return `<${hex}>`;
}

interface AddedFont {
  name: string;
  language: FontLanguage;
  font: InstanceType<typeof mupdf.Font>;
  ref: ReturnType<PdfDocument["addSimpleFont"]>;
}

function addOcrWords(pdf: PdfDocument, page: PdfPage, words: OcrLayerWord[]): { applied: number; skipped: number } {
  const bounds = page.getBounds();
  const pageWidth = Math.max(1, bounds[2] - bounds[0]);
  const pageHeight = Math.max(1, bounds[3] - bounds[1]);
  const object = page.getObject();
  const inherited = object.getInheritable("Resources");
  const resources = shallow(pdf, inherited);
  const originalFonts = resources.get("Font");
  const fonts = shallow(pdf, originalFonts);
  const cache = new Map<FontLanguage, AddedFont>();
  let commands = "";
  let applied = 0;
  let skipped = 0;

  const getFont = (language: FontLanguage): AddedFont => {
    const current = cache.get(language);
    if (current) return current;
    const name = `LPSOCR${++sequence}`;
    const font = new mupdf.Font(language === "latin" ? "Helvetica" : language);
    const ref = language === "latin" ? pdf.addSimpleFont(font, "Latin") : pdf.addCJKFont(font, language, 0, false);
    fonts.put(name, ref);
    const added = { name, language, font, ref };
    cache.set(language, added);
    return added;
  };

  try {
    const inverse = invert(page.getTransform?.() ?? [1, 0, 0, 1, 0, 0]).map((value) => Number(value.toFixed(6))).join(" ");
    for (const word of words) {
      const text = word.text.trim();
      if (!text) continue;
      const language = languageFor(text);
      if (!language) { skipped += 1; continue; }
      const font = getFont(language);
      const x = bounds[0] + Math.max(0, Math.min(1, word.rect.x0)) * pageWidth;
      const y = bounds[1] + Math.max(0, Math.min(1, word.rect.y0)) * pageHeight;
      const x1 = bounds[0] + Math.max(0, Math.min(1, word.rect.x1)) * pageWidth;
      const y1 = bounds[1] + Math.max(0, Math.min(1, word.rect.y1)) * pageHeight;
      const boxWidth = Math.max(.5, x1 - x);
      const boxHeight = Math.max(.5, y1 - y);
      const size = Math.max(1, Math.min(96, boxHeight * .82));
      let advance = 0;
      for (const character of text) {
        const glyph = font.font.encodeCharacter(character.codePointAt(0) ?? 0);
        const width = Number(font.font.advanceGlyph(glyph, 0));
        advance += Number.isFinite(width) && width > 0 ? width : .55;
      }
      const measured = Math.max(.01, advance * size);
      const horizontalScale = Math.max(.15, Math.min(6, boxWidth / measured));
      const baseline = y + (boxHeight + size * .72) / 2;
      commands += `q ${inverse} cm BT 3 Tr /${font.name} ${size.toFixed(3)} Tf ${horizontalScale.toFixed(5)} 0 0 -1 ${x.toFixed(3)} ${baseline.toFixed(3)} Tm ${encode(text, language)} Tj ET Q\n`;
      applied += 1;
    }
    resources.put("Font", fonts);
    object.put("Resources", resources);
    if (commands) append(pdf, object, commands);
  } finally {
    for (const item of cache.values()) { item.ref.destroy(); item.font.destroy(); }
    fonts.destroy();
    originalFonts.destroy();
    resources.destroy();
    inherited.destroy();
    object.destroy();
  }
  return { applied, skipped };
}

function save(pdf: PdfDocument): Uint8Array {
  const buffer = pdf.saveToBuffer("garbage=4,clean=yes,compress=yes,compress-images=yes,compress-fonts=yes,appearance=all,encrypt=keep");
  try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "CANCEL") { cancelled.add(request.requestId); return; }
  void (async () => {
    let pdf: PdfDocument | undefined;
    const startedAt = performance.now();
    try {
      active(request.requestId);
      pdf = new mupdf.PDFDocument(new Uint8Array(request.bytes));
      auth(pdf, request.password);
      const sourcePageCount = pdf.countPages();
      let appliedWords = 0;
      let skippedWords = 0;
      const changedPages: number[] = [];
      for (const layer of request.pages) {
        active(request.requestId);
        if (layer.pageNumber < 1 || layer.pageNumber > sourcePageCount || !layer.words.length) continue;
        const page = pdf.loadPage(layer.pageNumber - 1);
        try {
          const result = addOcrWords(pdf, page, layer.words);
          if (result.applied) changedPages.push(layer.pageNumber);
          appliedWords += result.applied;
          skippedWords += result.skipped;
        } finally { page.destroy(); }
      }
      const output = save(pdf);
      const reopened = new mupdf.PDFDocument(output);
      try {
        auth(reopened, request.password);
        if (reopened.countPages() !== sourcePageCount) throw new Error("OCR layer validation failed because the page count changed.");
        const sample = request.pages.find((page) => page.words.some((word) => word.text.trim().length >= 3));
        if (sample) {
          const page = reopened.loadPage(sample.pageNumber - 1);
          try {
            const extracted = page.toStructuredText().asText().replace(/\s+/g, " ");
            const target = sample.words.find((word) => word.text.trim().length >= 3)?.text.trim();
            if (target && !extracted.includes(target)) throw new Error("OCR layer validation failed because recognized text was not extractable after reopening.");
          } finally { page.destroy(); }
        }
        const outputBuffer = Uint8Array.from(output).buffer;
        const warnings = skippedWords
          ? [`${skippedWords} OCR word${skippedWords === 1 ? " was" : "s were"} omitted because their script cannot be embedded safely by the current local PDF writer.`]
          : [];
        self.postMessage({
          type: "OCR_LAYER_RESULT",
          requestId: request.requestId,
          output: outputBuffer,
          result: {
            pageCount: sourcePageCount,
            outputBytes: output.byteLength,
            changedPages,
            appliedWords,
            skippedWords,
            warnings,
            durationMs: performance.now() - startedAt
          }
        }, [outputBuffer]);
      } finally { reopened.destroy(); }
    } catch (error) {
      self.postMessage({
        type: "OCR_LAYER_ERROR",
        requestId: request.requestId,
        error: error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError", message: String(error) }
      });
    } finally {
      pdf?.destroy();
      cancelled.delete(request.requestId);
    }
  })();
};
export {};
