import * as mupdf from "mupdf";
import type { OcrLayerPage, OcrLayerWord } from "./ocrLayer";

type Pdf = InstanceType<typeof mupdf.PDFDocument>;
type Page = ReturnType<Pdf["loadPage"]>;
type Obj = ReturnType<Pdf["newDictionary"]>;
type Lang = "latin" | "ko" | "ja" | "zh-Hans" | "zh-Hant";
let sequence = 0;

const winAnsi = new Map([..."€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ"].map((c, i) => [c.codePointAt(0)!, i + 128]));

function invert(m: number[]): number[] {
  const [a,b,c,d,e,f] = m;
  const det = a*d-b*c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return [1,0,0,1,0,0];
  return [d/det,-b/det,-c/det,a/det,(c*f-d*e)/det,(b*e-a*f)/det];
}
function shallow(pdf: Pdf, source: Obj): Obj {
  const copy = pdf.newDictionary();
  if (source.isDictionary()) source.forEach((value, key) => { try { copy.put(key, value); } finally { value.destroy(); } });
  return copy;
}
function append(pdf: Pdf, object: Obj, commands: string): void {
  const existing = object.get("Contents"), contents = pdf.newArray();
  const prefix = pdf.addStream("q\n", {}), suffix = pdf.addStream(`\nQ\n${commands}`, {});
  try {
    contents.push(prefix);
    if (existing.isArray()) for (let i=0;i<existing.length;i+=1) { const stream=existing.get(i); try { if(!stream.isNull()) contents.push(stream); } finally { stream.destroy(); } }
    else if (!existing.isNull()) contents.push(existing);
    contents.push(suffix); object.put("Contents", contents);
  } finally { prefix.destroy(); suffix.destroy(); existing.destroy(); contents.destroy(); }
}
function language(text: string): Lang | null {
  let cjk: Lang | null = null;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0xac00 && code <= 0xd7af) cjk = "ko";
    else if (code >= 0x3040 && code <= 0x30ff) cjk = "ja";
    else if (code >= 0x3400 && code <= 0x9fff) cjk ??= "zh-Hans";
    else if (!(code >= 32 && code < 127 || code >= 160 && code <= 255 || winAnsi.has(code))) return null;
  }
  return cjk ?? "latin";
}
function encode(text: string, lang: Lang): string {
  let hex = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (lang !== "latin") {
      if (code > 0xffff) throw new Error("OCR word contains an unsupported Unicode character.");
      hex += code.toString(16).padStart(4,"0");
    } else {
      const byte = code >= 32 && code < 127 || code >= 160 && code <= 255 ? code : winAnsi.get(code);
      if (byte === undefined) throw new Error("OCR word cannot be encoded safely.");
      hex += byte.toString(16).padStart(2,"0");
    }
  }
  return `<${hex}>`;
}
function addWords(pdf: Pdf, page: Page, words: OcrLayerWord[]): { applied: number; skipped: number } {
  const bounds = page.getBounds(), pageW = Math.max(1,bounds[2]-bounds[0]), pageH = Math.max(1,bounds[3]-bounds[1]);
  const object = page.getObject(), inherited = object.getInheritable("Resources"), resources = shallow(pdf,inherited);
  const originalFonts = resources.get("Font"), fonts = shallow(pdf,originalFonts);
  const cache = new Map<Lang,{name:string;font:InstanceType<typeof mupdf.Font>;ref:any}>();
  let commands = "", applied = 0, skipped = 0;
  const getFont = (lang: Lang) => {
    const found = cache.get(lang); if (found) return found;
    const name = `LPSOCR${++sequence}`, font = new mupdf.Font(lang === "latin" ? "Helvetica" : lang);
    const ref = lang === "latin" ? pdf.addSimpleFont(font,"Latin") : pdf.addCJKFont(font,lang,0,false);
    fonts.put(name,ref); const value={name,font,ref}; cache.set(lang,value); return value;
  };
  try {
    const inv = invert(page.getTransform?.() ?? [1,0,0,1,0,0]).map(v=>Number(v.toFixed(6))).join(" ");
    for (const word of words) {
      const text = word.text.trim(); if (!text) continue;
      const lang = language(text); if (!lang) { skipped += 1; continue; }
      const font = getFont(lang);
      const x = bounds[0] + Math.max(0,Math.min(1,word.rect.x0))*pageW;
      const y = bounds[1] + Math.max(0,Math.min(1,word.rect.y0))*pageH;
      const x1 = bounds[0] + Math.max(0,Math.min(1,word.rect.x1))*pageW;
      const y1 = bounds[1] + Math.max(0,Math.min(1,word.rect.y1))*pageH;
      const bw=Math.max(.5,x1-x), bh=Math.max(.5,y1-y), size=Math.max(1,Math.min(96,bh*.82));
      let advance=0;
      for(const ch of text){const glyph=font.font.encodeCharacter(ch.codePointAt(0)??0);const w=Number(font.font.advanceGlyph(glyph,0));advance+=Number.isFinite(w)&&w>0?w:.55;}
      const scale=Math.max(.15,Math.min(6,bw/Math.max(.01,advance*size))), baseline=y+(bh+size*.72)/2;
      commands += `q ${inv} cm BT 3 Tr /${font.name} ${size.toFixed(3)} Tf ${scale.toFixed(5)} 0 0 -1 ${x.toFixed(3)} ${baseline.toFixed(3)} Tm ${encode(text,lang)} Tj ET Q\n`;
      applied += 1;
    }
    resources.put("Font",fonts); object.put("Resources",resources); if(commands) append(pdf,object,commands);
  } finally {
    for(const item of cache.values()){item.ref.destroy();item.font.destroy();}
    fonts.destroy(); originalFonts.destroy(); resources.destroy(); inherited.destroy(); object.destroy();
  }
  return {applied,skipped};
}
function save(pdf: Pdf): Uint8Array {
  const buffer=pdf.saveToBuffer("garbage=4,clean=yes,compress=yes,compress-images=yes,compress-fonts=yes,appearance=all,encrypt=keep");
  try{return Uint8Array.from(buffer.asUint8Array());}finally{buffer.destroy();}
}

export function applyOcrLayerPdf(bytes: Uint8Array, pages: OcrLayerPage[], password?: string, check?:()=>void) {
  const pdf=new mupdf.PDFDocument(bytes);
  try {
    if(pdf.needsPassword() && (!password || !pdf.authenticatePassword(password))) throw new Error("The PDF password is required or incorrect.");
    const pageCount=pdf.countPages(), changedPages:number[]=[]; let appliedWords=0, skippedWords=0;
    for(const layer of pages){check?.();if(layer.pageNumber<1||layer.pageNumber>pageCount||!layer.words.length)continue;const page=pdf.loadPage(layer.pageNumber-1);try{const r=addWords(pdf,page,layer.words);if(r.applied)changedPages.push(layer.pageNumber);appliedWords+=r.applied;skippedWords+=r.skipped;}finally{page.destroy();}}
    const output=save(pdf);
    const reopened=new mupdf.PDFDocument(output);
    try {
      if(reopened.countPages()!==pageCount) throw new Error("OCR layer validation failed because the page count changed.");
      const sample=pages.find(p=>p.words.some(w=>w.text.trim().length>=3));
      if(sample){const page=reopened.loadPage(sample.pageNumber-1);try{const extracted=page.toStructuredText().asText().replace(/\s+/g," ");const target=sample.words.find(w=>w.text.trim().length>=3)?.text.trim();if(target&&!extracted.includes(target))throw new Error("OCR layer validation failed because recognized text was not extractable after reopening.");}finally{page.destroy();}}
    } finally { reopened.destroy(); }
    return {output,pageCount,changedPages,appliedWords,skippedWords};
  } finally { pdf.destroy(); }
}
