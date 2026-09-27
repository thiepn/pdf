import * as mupdf from "mupdf";
import { resolveDecorationLanguage, type DecorationLanguage } from "./toolboxModel";
type PDF = mupdf.PDFDocument;
type Obj = mupdf.PDFObject;
let sequence = 0;
const winAnsi = new Map([..."€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ"].map((character, index) => [character.codePointAt(0)!, index + 128]));
function encode(text: string, cjk: boolean): string {
  let hex = "";
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (cjk) {
      if (code > 0xffff) throw new Error("This watermark contains characters outside the supported CJK font. Use supported text without emoji.");
      hex += code.toString(16).padStart(4, "0");
    } else {
      const byte = code >= 32 && code < 127 || code >= 160 && code <= 255 ? code : winAnsi.get(code);
      if (byte === undefined) throw new Error("This watermark needs a font or script shaping that is not supported. Use Latin or supported CJK text.");
      hex += byte.toString(16).padStart(2, "0");
    }
  }
  return `<${hex}>`;
}
function shallow(pdf: PDF, source: Obj): Obj {
  const copy = pdf.newDictionary();
  if (source.isDictionary()) source.forEach((value, key) => { try { copy.put(key, value); } finally { value.destroy(); } });
  return copy;
}
/** Never mutate inherited/shared resources or shared Contents arrays in place. */
function append(pdf: PDF, object: Obj, commands: string): void {
  const existing = object.get("Contents"), contents = pdf.newArray();
  const prefix = pdf.addStream("q\n", {}), suffix = pdf.addStream(`\nQ\n${commands}`, {});
  try {
    contents.push(prefix);
    if (existing.isArray()) for (let index = 0; index < existing.length; index++) { const stream = existing.get(index); try { if (!stream.isNull()) contents.push(stream); } finally { stream.destroy(); } }
    else if (!existing.isNull()) contents.push(existing);
    contents.push(suffix); object.put("Contents", contents);
  } finally { prefix.destroy(); suffix.destroy(); existing.destroy(); contents.destroy(); }
}
/** Rect and alignment are expressed in displayed, cropped page coordinates.
 * Invert page.getTransform once; keep text upright at every page rotation.
 */
export function addPageText(pdf: PDF, page: mupdf.PDFPage, rect: mupdf.Rect, value: string, fontSize: number, gray = .22, align: "left" | "center" | "right" = "center", preferred: DecorationLanguage = "auto"): void {
  const text = value.replace(/[\r\n\t]/g, " "); if (!text) return;
  const language = resolveDecorationLanguage(text, preferred), encoded = encode(text, Boolean(language));
  const object = page.getObject(), inherited = object.getInheritable("Resources"), resources = shallow(pdf, inherited);
  const originalFonts = resources.get("Font"), fonts = shallow(pdf, originalFonts);
  const font = new mupdf.Font(language ?? "Helvetica");
  const fontRef = language ? pdf.addCJKFont(font, language, 0, false) : pdf.addSimpleFont(font, "Latin");
  try {
    let name: string;
    for (;;) { name = `LPST${++sequence}`; const existing = fonts.get(name); const unused = existing.isNull(); existing.destroy(); if (unused) break; }
    fonts.put(name, fontRef); resources.put("Font", fonts); object.put("Resources", resources);
    const width = Math.max(1, rect[2] - rect[0]), height = Math.max(1, rect[3] - rect[1]);
    const advance = [...text].reduce((total, character) => total + font.advanceGlyph(font.encodeCharacter(character.codePointAt(0)!)), 0);
    const size = Math.max(1, Math.min(96, Number.isFinite(fontSize) ? fontSize : 11, width / Math.max(advance, .001), height / 1.2));
    const measured = advance * size, x = align === "left" ? rect[0] : align === "right" ? rect[2] - measured : rect[0] + (width - measured) / 2;
    const y = rect[1] + (height + size * .72) / 2;
    const inverse = mupdf.Matrix.invert(page.getTransform()).map((n) => n.toFixed(6)).join(" ");
    const shade = Math.max(0, Math.min(1, Number.isFinite(gray) ? gray : .22));
    append(pdf, object, `q ${inverse} cm ${shade.toFixed(3)} g BT /${name} ${size.toFixed(3)} Tf 1 0 0 -1 ${x.toFixed(3)} ${y.toFixed(3)} Tm ${encoded} Tj ET Q\n`);
  } finally { fontRef.destroy(); font.destroy(); fonts.destroy(); originalFonts.destroy(); resources.destroy(); inherited.destroy(); object.destroy(); }
}
