import type { FormFieldEditorObject } from "../types/editor";
import { validateFormFields } from "./formModel";

/** Pdf-native AcroForm writer. Only valid, unencrypted, unsigned documents.
 * Creates true Widget annotations rather than painted imitations.
 * A separate full save is mandatory; this does NOT use incremental output.
 * Callers must reopen and independently inspect the result before delivery.
 */
type PdfObjectLike = {
  get(key: string): PdfObjectLike;
  put(key: string, value: unknown): void;
  push(value: unknown): void;
  isNull(): boolean;
  isArray(): boolean;
  asString(): string;
  asName(): string;
  asIndirect(): number;
  isIndirect(): boolean;
  resolve(): PdfObjectLike;
  forEach(callback: (value: PdfObjectLike, key: number | string) => void): void;
};
type PdfLike = {
  countPages(): number;
  needsPassword(): boolean;
  getTrailer(): PdfObjectLike;
  findPage(index: number): PdfObjectLike;
  newName(value: string): PdfObjectLike;
  newString(value: string): PdfObjectLike;
  newDictionary(): PdfObjectLike;
  newArray(): PdfObjectLike;
  addObject(value: PdfObjectLike): PdfObjectLike;
  addStream(value: Uint8Array, dictionary: PdfObjectLike): PdfObjectLike;
  countObjects(): number;
};

function name(pdf: PdfLike, value: string): PdfObjectLike { return pdf.newName(value); }
function text(pdf: PdfLike, value: string): PdfObjectLike { return pdf.newString(value); }
function safePdfString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function numbers(value: number[]): number[] { return value.map((n) => Math.round(n * 1000) / 1000); }
function background(w: number, h: number, label: string, fontSize: number, checked = false): string {
  const path = `q 1 1 1 rg 0 0 ${w} ${h} re f 0.48 0.53 0.62 RG 1 w 0.5 0.5 ${Math.max(0, w-1)} ${Math.max(0,h-1)} re S Q\n`;
  if (checked) return path + `q 0.05 0.36 0.23 RG 2.8 w 2 ${h / 2} m ${w * .42} 3 l ${w-2} ${h-3} l S Q\n`;
  if (!label) return path;
  const size = Math.min(fontSize, Math.max(6, h - 5));
  return path + `BT /Helv ${size} Tf 0.09 0.15 0.23 rg 4 ${Math.max(3, (h - size) / 2)} Td (${safePdfString(label.replace(/[\r\n]+/g, " ").slice(0, 200))}) Tj ET\n`;
}

function appearance(pdf: PdfLike, font: PdfObjectLike, w: number, h: number, content: string): PdfObjectLike {
  const dict = pdf.newDictionary();
  dict.put("Type", name(pdf, "XObject"));
  dict.put("Subtype", name(pdf, "Form"));
  dict.put("FormType", 1);
  dict.put("BBox", numbers([0, 0, w, h]));
  const resources = pdf.newDictionary();
  const fonts = pdf.newDictionary();
  fonts.put("Helv", font);
  resources.put("Font", fonts);
  dict.put("Resources", resources);
  return pdf.addStream(new TextEncoder().encode(content), dict);
}

function existingNames(fields: PdfObjectLike): Set<string> {
  const out = new Set<string>();
  const visited = new Set<number>();
  function walk(array: PdfObjectLike, prefix: string, depth: number): void {
    if (depth > 24 || !array?.isArray()) throw new Error("Unsupported or malformed existing form hierarchy.");
    array.forEach((entry) => {
      if (entry.isIndirect()) {
        const n = entry.asIndirect();
        if (visited.has(n)) throw new Error("Existing form field tree contains a cycle.");
        visited.add(n);
      }
      const field = entry.resolve();
      const ft = field.get("FT");
      const value = field.get("V");
      if (!ft.isNull() && ft.asName() === "Sig" && !value.isNull()) throw new Error("Cannot change a digitally signed PDF using the form designer.");
      const t = field.get("T");
      const local = t && !t.isNull() ? t.asString() : "";
      const full = [prefix, local].filter(Boolean).join(".");
      if (full) out.add(full);
      const kids = field.get("Kids");
      if (kids && !kids.isNull()) walk(kids.resolve(), full, depth + 1);
    });
  }
  walk(fields, "", 0);
  return out;
}

function ensureForm(pdf: PdfLike): { form: PdfObjectLike; fields: PdfObjectLike; font: PdfObjectLike } {
  const root = pdf.getTrailer().get("Root");
  if (root.isNull()) throw new Error("PDF catalog is missing.");
  let form = root.get("AcroForm");
  if (form.isNull()) {
    form = pdf.addObject(pdf.newDictionary());
    root.put("AcroForm", form);
  }
  let fields = form.get("Fields");
  if (fields.isNull()) {
    fields = pdf.newArray();
    form.put("Fields", fields);
    fields = form.get("Fields");
  }
  if (!fields.resolve().isArray()) throw new Error("Existing AcroForm fields are malformed.");
  let dr = form.get("DR");
  if (dr.isNull()) { form.put("DR", pdf.newDictionary()); dr = form.get("DR"); }
  let fonts = dr.get("Font");
  if (fonts.isNull()) { dr.put("Font", pdf.newDictionary()); fonts = dr.get("Font"); }
  let font = fonts.get("Helv");
  if (font.isNull()) {
    const helv = pdf.newDictionary();
    helv.put("Type", name(pdf, "Font"));
    helv.put("Subtype", name(pdf, "Type1"));
    helv.put("BaseFont", name(pdf, "Helvetica"));
    helv.put("Encoding", name(pdf, "WinAnsiEncoding"));
    font = pdf.addObject(helv);
    fonts.put("Helv", font);
  }
  form.put("NeedAppearances", false);
  return { form, fields: fields.resolve(), font };
}

function widgetType(kind: FormFieldEditorObject["kind"]): string {
  if (kind === "checkbox") return "Btn";
  if (kind === "dropdown" || kind === "listbox") return "Ch";
  return "Tx";
}

function flags(f: FormFieldEditorObject): number {
  let bits = (f.readOnly ? 1 : 0) | (f.required ? 2 : 0);
  if (f.kind === "multiline") bits |= 4096;
  if (f.kind === "dropdown") bits |= 131072;
  return bits;
}

function writeOne(pdf: PdfLike, field: FormFieldEditorObject, fonts: PdfObjectLike, rootFields: PdfObjectLike): void {
  const page = pdf.findPage(field.pageNumber - 1);
  const { x0, y0, x1, y1 } = field.bounds;
  const w = Math.max(12, x1 - x0), h = Math.max(12, y1 - y0);
  const dict = pdf.newDictionary();
  dict.put("Type", name(pdf, "Annot"));
  dict.put("Subtype", name(pdf, "Widget"));
  dict.put("FT", name(pdf, widgetType(field.kind)));
  dict.put("Ff", flags(field));
  dict.put("T", text(pdf, field.name));
  dict.put("TU", text(pdf, field.tooltip || field.name));
  dict.put("Rect", numbers([x0, y0, x1, y1]));
  dict.put("F", 4);
  dict.put("P", page);
  dict.put("Border", [0, 0, 1]);
  const mk = pdf.newDictionary();
  mk.put("BG", [1, 1, 1]);
  mk.put("BC", [0.48, 0.53, 0.62]);
  dict.put("MK", mk);
  if (field.kind === "checkbox") {
    const on = appearance(pdf, fonts, w, h, background(w, h, "", field.fontSize, true));
    const off = appearance(pdf, fonts, w, h, background(w, h, "", field.fontSize));
    const normal = pdf.newDictionary();
    normal.put("Off", off);
    normal.put("Yes", on);
    const ap = pdf.newDictionary();
    ap.put("N", normal);
    dict.put("AP", ap);
    const state = field.defaultValue === "Yes" ? "Yes" : "Off";
    dict.put("AS", name(pdf, state));
    dict.put("V", name(pdf, state));
  } else {
    dict.put("DA", text(pdf, `/Helv ${field.fontSize} Tf 0.09 0.15 0.23 rg`));
    if (field.kind === "text" || field.kind === "multiline") {
      if (field.maxLength) dict.put("MaxLen", field.maxLength);
    } else {
      const options = pdf.newArray();
      for (const option of field.options) options.push(text(pdf, option));
      dict.put("Opt", options);
    }
    if (field.defaultValue) dict.put("V", text(pdf, field.defaultValue));
    const normal = appearance(pdf, fonts, w, h, background(w, h,
      field.defaultValue || (field.kind === "dropdown" ? field.options[0] || "" : ""), field.fontSize));
    const ap = pdf.newDictionary();
    ap.put("N", normal);
    dict.put("AP", ap);
  }
  const ref = pdf.addObject(dict);
  rootFields.push(ref);
  let annots = page.get("Annots");
  if (annots.isNull()) { page.put("Annots", pdf.newArray()); annots = page.get("Annots"); }
  if (!annots.resolve().isArray()) throw new Error(`Page ${field.pageNumber} annotations are malformed.`);
  annots.resolve().push(ref);
}

export function addDesignedFormFields(pdf: PdfLike, fields: FormFieldEditorObject[]): number {
  if (!fields.length) return 0;
  if (pdf.needsPassword()) throw new Error("F2 form authoring currently requires an unencrypted PDF.");
  if (fields.some((f) => f.pageNumber > pdf.countPages())) throw new Error("Form field is outside the source PDF page range.");
  const root = pdf.getTrailer().get("Root");
  if (!root.get("Perms").isNull()) throw new Error("Certified or permission-restricted PDFs cannot be modified by the form designer.");
  const existing = root.get("AcroForm");
  const existingFieldTree = existing.isNull() ? null : existing.get("Fields");
  // Validate before creating or mutating any PDF objects.
  validateFormFields(fields, existingFieldTree && !existingFieldTree.isNull() ? existingNames(existingFieldTree.resolve()) : []);
  const { fields: rootFields, font } = ensureForm(pdf);
  for (const field of fields) writeOne(pdf, field, font, rootFields);
  return fields.length;
}
