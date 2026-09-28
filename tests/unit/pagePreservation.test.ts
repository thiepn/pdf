// @vitest-environment node
import { describe, it, expect } from "vitest";
import * as mupdf from "mupdf";
import { assemblePdfPages } from "../../src/tools/assemblyEngine";

function fixture(label = "Original", fontName = "Helvetica") {
  const pdf = new mupdf.PDFDocument(); const font = new mupdf.Font(fontName); const fontRef = pdf.addSimpleFont(font);
  for (let i = 0; i < 2; i++) pdf.insertPage(-1, pdf.addPage([0, 0, 300, 400], 0, { Font: { F1: fontRef } }, `BT /F1 16 Tf 20 350 Td (${label} ${i + 1}) Tj ET`));
  const page = pdf.loadPage(0); const note = page.createAnnotation("FreeText");
  note.setRect([20, 65, 270, 110]); note.setContents(`${label} annotation`); note.update();
  page.createLink([20, 115, 270, 135], "https://example.org/");
  page.createLink([20, 140, 270, 160], "#page=2");
  const object = page.getObject();
  const widget = pdf.addObject({ Type: "Annot", Subtype: "Widget", FT: "Tx", T: pdf.newString("name"), V: pdf.newString(`${label} value`), Rect: [20, 180, 270, 215], P: object, F: 4, DA: pdf.newString("/Helv 14 Tf 0 g") });
  object.get("Annots").push(widget);
  pdf.getTrailer().get("Root").put("AcroForm", { Fields: [widget], DR: { Font: { Helv: fontRef } }, DA: pdf.newString("/Helv 14 Tf 0 g") });
  page.update();
  const buffer = pdf.saveToBuffer(); const bytes = Uint8Array.from(buffer.asUint8Array()).buffer;
  buffer.destroy(); widget.destroy(); object.destroy(); note.destroy(); page.destroy(); fontRef.destroy(); font.destroy(); pdf.destroy();
  return { name: `${label}.pdf`, bytes };
}
function open(bytes: Uint8Array) { return mupdf.Document.openDocument(bytes, "application/pdf").asPDF()!; }
function copy(source: ReturnType<typeof fixture>, indices = [0, 1]) { return assemblePdfPages([source], indices.map((sourcePageIndex) => ({ sourceIndex: 0, sourcePageIndex, rotation: 0 }))); }
function snapshot(pdf: mupdf.PDFDocument, index: number) {
  const page = pdf.loadPage(index); const annotations = page.getAnnotations(); const links = page.getLinks(); const widgets = page.getWidgets();
  try { return { annotations: annotations.map((a) => a.getContents()), links: links.map((l) => l.getURI()), widgets: widgets.map((w) => ({ name: w.getName(), value: w.getValue() })), bounds: page.getBounds() }; }
  finally { annotations.forEach((a) => a.destroy()); links.forEach((l) => l.destroy()); widgets.forEach((w) => w.destroy()); page.destroy(); }
}
describe("Native page interaction preservation", () => {
  it("preserves text annotations, web links and editable filled fields", () => {
    const pdf = open(copy(fixture()));
    try {
      const result = snapshot(pdf, 0); expect(result.annotations).toContain("Original annotation");
      expect(result.links).toContain("https://example.org/"); expect(result.widgets).toEqual([{ name: "name", value: "Original value" }]);
      const page = pdf.loadPage(0) as mupdf.PDFPage; const widget = page.getWidgets()[0];
      try { widget.setTextValue("Still editable"); page.update(); expect(widget.getValue()).toBe("Still editable"); }
      finally { widget.destroy(); page.destroy(); }
    } finally { pdf.destroy(); }
  });
  it("rebases internal links when pages are reordered", () => {
    const pdf = open(copy(fixture(), [1, 0]));
    try { const internal = snapshot(pdf, 1).links.find((link) => link.startsWith("#")); expect(internal).toBeTruthy(); expect(pdf.resolveLink(internal!)).toBe(0); }
    finally { pdf.destroy(); }
  });
  it("does not import omitted pages through annotations or internal links", () => {
    const pdf = open(copy(fixture("OMITTED_SECRET"), [0]));
    try {
      expect(pdf.countPages()).toBe(1); expect(snapshot(pdf, 0).links).toEqual(["https://example.org/"]);
      // Count all live page dictionaries, not just the visible page tree.
      let pageDictionaries = 0;
      for (let i = 1; i < pdf.countObjects(); i++) {
        const object = pdf.newIndirect(i); const type = object.get("Type");
        try { if (type.isName() && type.asName() === "Page") pageDictionaries++; }
        finally { type.destroy(); object.destroy(); }
      }
      expect(pageDictionaries).toBe(1);
    } finally { pdf.destroy(); }
  });
  it("merges same-named fields with separate values and distinct default fonts", () => {
    const pdf = open(assemblePdfPages([fixture("First"), fixture("Second", "Courier")], [
      { sourceIndex: 0, sourcePageIndex: 0, rotation: 0 }, { sourceIndex: 1, sourcePageIndex: 0, rotation: 0 }
    ]));
    try {
      expect(snapshot(pdf, 0).widgets).toEqual([{ name: "name", value: "First value" }]);
      expect(snapshot(pdf, 1).widgets).toEqual([{ name: "name (2)", value: "Second value" }]);
      const fields = pdf.getTrailer().get("Root").get("AcroForm").get("Fields");
      expect(fields.get(0).get("DA").asString()).toContain("/s0_Helv");
      expect(fields.get(1).get("DA").asString()).toContain("/s1_Helv");
      fields.destroy();
    } finally { pdf.destroy(); }
  });
  it("duplicates annotations and fields independently without coupling rotation", () => {
    const pdf = open(assemblePdfPages([fixture()], [
      { sourceIndex: 0, sourcePageIndex: 0, rotation: 0 }, { sourceIndex: 0, sourcePageIndex: 0, rotation: 90 }
    ]));
    try {
      expect(snapshot(pdf, 0).bounds).toEqual([0, 0, 300, 400]); expect(snapshot(pdf, 1).bounds).toEqual([0, 0, 400, 300]);
      expect(snapshot(pdf, 1).annotations).toContain("Original annotation");
      expect(snapshot(pdf, 1).widgets[0].name).not.toBe(snapshot(pdf, 0).widgets[0].name);
    } finally { pdf.destroy(); }
  });
  it("retains visible annotation pixels rather than only dictionary text", () => {
    const source = fixture(); const original = mupdf.Document.openDocument(source.bytes, "application/pdf").asPDF()!; const output = open(copy(source));
    const before = original.loadPage(0); const after = output.loadPage(0);
    const a = before.toPixmap([1, 0, 0, 1, 0, 0], mupdf.ColorSpace.DeviceRGB, false, true);
    const b = after.toPixmap([1, 0, 0, 1, 0, 0], mupdf.ColorSpace.DeviceRGB, false, true);
    try { const before = a.getPixels(), after = b.getPixels(); expect(after.length).toBe(before.length); expect(after.every((value, index) => value === before[index])).toBe(true); }
    finally { a.destroy(); b.destroy(); before.destroy(); after.destroy(); original.destroy(); output.destroy(); }
  });
});
