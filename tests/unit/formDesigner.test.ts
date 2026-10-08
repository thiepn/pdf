import { describe, expect, it } from "vitest";
import * as mupdf from "mupdf";
import { createMinimalPdf } from "../../src/fixtures/minimalPdf";
import { createObjectForTool, duplicateObjects } from "../../src/editor/editorModel";
import { validateFormField, validateFormFields } from "../../src/forms/formModel";
import { addDesignedFormFields } from "../../src/forms/formWriter";
import type { FormFieldEditorObject } from "../../src/types/editor";

function field(kind: FormFieldEditorObject["kind"] = "text", name = "Contact_Name"): FormFieldEditorObject {
  const value = createObjectForTool({
    tool: "form-field", pageNumber: 1, bounds: { x0: 75, y0: 620, x1: 250, y1: 644 },
    author: "Test", zIndex: 1
  });
  if (!value || value.type !== "form-field") throw new Error("F2 field creation failed.");
  return {
    ...value, kind, name,
    options: kind === "dropdown" || kind === "listbox" ? ["Yes", "No"] : [],
    defaultValue: kind === "dropdown" || kind === "listbox" ? "Yes" : ""
  };
}
describe("F2 interactive form designer", () => {
  it("creates an editable field through the normal editor tool system", () => {
    const created = field();
    expect(created.type).toBe("form-field");
    expect(validateFormField(created)).toEqual([]);
    const copy = duplicateObjects([created], new Set([created.id]))[1] as FormFieldEditorObject;
    expect(copy.type).toBe("form-field");
    expect(copy.id).not.toBe(created.id);
    expect(copy.name).not.toBe(created.name);
  });

  it("refuses invalid names, duplicated fields, invalid choices, and broken defaults", () => {
    expect(validateFormField({ ...field(), name: "Bad.Name" }).join(" ")).toMatch(/name/);
    expect(validateFormField({ ...field("dropdown"), options: ["Yes", "Yes"] }).join(" ")).toMatch(/unique/);
    expect(validateFormField({ ...field("dropdown"), defaultValue: "Maybe" }).join(" ")).toMatch(/Default choice/);
    expect(() => validateFormFields([field("text", "A"), field("text", "A")])).toThrow(/Duplicate/);
    expect(() => validateFormFields([field("text", "A")], ["A"])).toThrow(/Duplicate/);
    expect(() => validateFormFields([field("checkbox", "X"), field("listbox", "Y")])).not.toThrow();
  });

  it("exports genuine, reopenable AcroForm widgets with expected field types and values", () => {
    const source = createMinimalPdf();
    const inputBuffer = new mupdf.Buffer(source);
    const pdf = new mupdf.PDFDocument(inputBuffer);
    const input = [
      { ...field("text", "Name"), defaultValue: "Ada", required: true },
      { ...field("checkbox", "Consent"), bounds: { x0: 275, y0: 620, x1: 295, y1: 640 }, defaultValue: "Yes" },
      { ...field("dropdown", "Choice"), bounds: { x0: 75, y0: 580, x1: 230, y1: 608 }, defaultValue: "No" },
      { ...field("listbox", "Choices"), bounds: { x0: 260, y0: 540, x1: 425, y1: 600 } },
      { ...field("multiline", "Notes"), bounds: { x0: 75, y0: 470, x1: 240, y1: 550 }, defaultValue: "Test notes" }
    ] satisfies FormFieldEditorObject[];
    let result: Uint8Array;
    try {
      expect(addDesignedFormFields(pdf, input)).toBe(5);
      const buffer = pdf.saveToBuffer("compress=yes,encrypt=keep");
      try { result = Uint8Array.from(buffer.asUint8Array()); }
      finally { buffer.destroy(); }
    } finally { pdf.destroy(); }
    const outputBuffer = new mupdf.Buffer(result);
    const output = new mupdf.PDFDocument(outputBuffer);
    try {
      expect(output.countPages()).toBe(1);
      const widgets = output.loadPage(0).getWidgets();
      try {
        expect(widgets.length).toBe(5);
        const types = widgets.map((w) => String(w.getFieldType()).toLowerCase());
        expect(types.join(" ")).toMatch(/text/);
        expect(types.join(" ")).toMatch(/check/);
        expect(types.join(" ")).toMatch(/combo/);
        const names = widgets.map((w) => w.getName());
        expect(names).toEqual(expect.arrayContaining(["Name", "Consent", "Choice", "Choices", "Notes"]));
        expect(widgets.find((w) => w.getName() === "Name")?.getValue()).toBe("Ada");
      } finally { widgets.forEach((w) => w.destroy()); }
    } finally { output.destroy(); }
  });
});
