import { describe, expect, it, vi } from "vitest";
import { createSecurityState } from "../../src/security/securityModel";
import type { SecurityExportOptions } from "../../src/types/security";
// @ts-ignore Node runtime-only test fixture input
import { readFileSync } from "node:fs";
import * as mupdf from "mupdf";
import * as pdfjs from "pdfjs-dist";
// @ts-ignore Node runtime-only path resolution
import { resolve } from "node:path";
// @ts-ignore Node runtime-only URL resolution
import { pathToFileURL } from "node:url";
import { inspectPdfFidelityProfile, validatePdfFidelity } from "../../src/fidelity/pdfFidelityClient";
import { comparePdfFidelityProfiles } from "../../src/fidelity/pdfFidelity";

(Promise as any).try ??= (fn: (...args: any[]) => unknown, ...args: any[]) => Promise.resolve().then(() => fn(...args));
(Uint8Array as any).fromHex ??= (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));
(Uint8Array as any).fromBase64 ??= (value: string) => Uint8Array.from(Buffer.from(value, "base64"));
(Uint8Array.prototype as any).toHex ??= function () { return Buffer.from(this).toString("hex"); };
(Uint8Array.prototype as any).toBase64 ??= function () { return Buffer.from(this).toString("base64"); };
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs")).href;

declare const Buffer: { from(value: string | Uint8Array, encoding?: string): Uint8Array & { toString(encoding: string): string } };

const fixtureBytes = new Uint8Array(readFileSync("tests/corpus/generated/forms.pdf"));

function alteredFixture(fieldName: string, value: string): Uint8Array {
  const document = mupdf.Document.openDocument(fixtureBytes, "application/pdf").asPDF()!;
  try {
    const page = document.loadPage(0) as mupdf.PDFPage;
    try {
      const widget = page.getWidgets().find((candidate) => candidate.getName() === fieldName);
      if (!widget) throw new Error("Missing input widget: " + fieldName);
      if (fieldName === "full_name") widget.setTextValue(value);
      else widget.setChoiceValue(value);
      page.update();
    } finally { page.destroy(); }
    const buffer = document.saveToBuffer();
    try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
  } finally { document.destroy(); }
}

function radioFixture(value: "approve" | "reject"): Uint8Array {
  const pdf = new mupdf.PDFDocument();
  const font = new mupdf.Font("Helvetica");
  const embedded = pdf.addSimpleFont(font);
  try {
    pdf.insertPage(-1, pdf.addPage([0, 0, 400, 400], 0, { Font: { F1: embedded } }, "BT /F1 12 Tf 30 300 Td (Radio form) Tj ET"));
    const page = pdf.loadPage(0);
    try {
      const object = page.getObject();
      const parent = pdf.addObject({ FT: "Btn", Ff: 32768, T: pdf.newString("decision"), V: pdf.newName(value), Kids: pdf.newArray() });
      for (const [index, name] of ["approve", "reject"].entries()) {
        const off = pdf.addStream("q Q", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 20, 20] });
        const on = pdf.addStream("q 0 0 1 rg 0 0 20 20 re f Q", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 20, 20] });
        const x = 20 + 50 * index;
        const widget = pdf.addObject({
          Type: "Annot", Subtype: "Widget", Parent: parent, Rect: [x, 20, x + 20, 40], P: object, F: 4,
          AS: pdf.newName(value === name ? name : "Off"), AP: { N: { Off: off, [name]: on } }
        });
        parent.get("Kids").push(widget);
        if (!object.get("Annots").isArray?.()) object.put("Annots", pdf.newArray());
        object.get("Annots").push(widget);
      }
      pdf.getTrailer().get("Root").put("AcroForm", { Fields: [parent], DR: { Font: { Helv: embedded } } });
      page.update();
    } finally { page.destroy(); }
    const saved = pdf.saveToBuffer();
    try { return Uint8Array.from(saved.asUint8Array()); } finally { saved.destroy(); }
  } finally { font.destroy(); pdf.destroy(); }
}

describe("P8 exact AcroForm state regressions (real PDFs)", () => {
  it("rejects accidental text-widget value mutation on an edited page", async () => {
    const report = await validatePdfFidelity(fixtureBytes, alteredFixture("full_name", "CORRUPTED"), [1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/form|field|value/i);
  });
  it("rejects accidental checkbox state mutation on an edited page", async () => {
    const report = await validatePdfFidelity(fixtureBytes, alteredFixture("accepted", "Off"), [1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/form|field|value/i);
  });
  it("does not count the PDF.js radio-group parent as a physical widget", async () => {
    const profile = await inspectPdfFidelityProfile(radioFixture("approve"), [1]);
    expect(profile.formFieldCount).toBe(2);
    expect(profile.semantics[0]?.widgetCount).toBe(2);
  });
  it("rejects changing an existing radio-group selection on an edited page", async () => {
    const report = await validatePdfFidelity(radioFixture("approve"), radioFixture("reject"), [1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/form|field|value/i);
  });
  it("permits an exact user-authorized text update but rejects any other field changes", async () => {
    const update = alteredFixture("full_name", "Authorized");
    const report = await validatePdfFidelity(fixtureBytes, update, [1], undefined, undefined, {
      expectations: { formValueUpdates: [{ name: "full_name", value: "Authorized" }] } as any
    });
    expect(report.passed).toBe(true);
    const other = alteredFixture("accepted", "Off");
    const negative = await validatePdfFidelity(fixtureBytes, other, [1], undefined, undefined, {
      expectations: { formValueUpdates: [{ name: "full_name", value: "Authorized" }] } as any
    });
    expect(negative.passed).toBe(false);
  });
});

let securityWorkerHandler: ((event: { data: any }) => void) | undefined;
async function secureWriterExport(bytes: Uint8Array, options: SecurityExportOptions): Promise<Uint8Array> {
  const messages: any[] = [];
  const scope: any = { postMessage: (message: any) => messages.push(message) };
  vi.stubGlobal("self", scope);
  try {
    if (!securityWorkerHandler) {
      await import("../../src/workers/security.worker");
      securityWorkerHandler = scope.onmessage;
    }
    if (!securityWorkerHandler) throw new Error("Real security worker handler not installed");
    securityWorkerHandler({ data: { type: "APPLY_SECURITY", requestId: "p8-real-worker-regression", bytes: bytes.slice().buffer, options } });
    const response = messages.find((entry) => entry.type === "SECURITY_EXPORT_RESULT" || entry.type === "SECURITY_ERROR");
    if (!response) throw new Error("Real security worker returned no result");
    if (response.error) throw new Error(response.error.message);
    return new Uint8Array(response.output);
  } finally { vi.unstubAllGlobals(); }
}
function securityOptions(): SecurityExportOptions {
  const state = createSecurityState("p8-fidelity");
  return { formUpdates: [], formCreates: [], redaction: state.redaction, sanitization: state.sanitization, encryption: state.encryption };
}
describe("P8 verification of actual P7 writer output", () => {
  it("accepts an exact authorized text update without loosening other fields", async () => {
    const options = securityOptions();
    options.formUpdates = [{ id: "1:0:full_name", pageNumber: 1, widgetIndex: 0, name: "full_name", type: "text", value: "New permitted name" }];
    const output = await secureWriterExport(fixtureBytes, options);
    const report = await validatePdfFidelity(fixtureBytes, output, [1], undefined, undefined, {
      expectations: { expectedFormFieldCount: 3, formValueUpdates: [{ name: "full_name", value: "New permitted name" }] }
    });
    expect(report.failures).toEqual([]);
  });
  it("accepts an authorized checkbox update and preserves unrelated text", async () => {
    const options = securityOptions();
    options.formUpdates = [{ id: "1:1:accepted", pageNumber: 1, widgetIndex: 1, name: "accepted", type: "checkbox", value: "Off" }];
    const output = await secureWriterExport(fixtureBytes, options);
    const report = await validatePdfFidelity(fixtureBytes, output, [1], undefined, undefined, {
      expectations: { expectedFormFieldCount: 3, formValueUpdates: [{ name: "accepted", value: "Off" }] }
    });
    expect(report.failures).toEqual([]);
  });
  it("accepts authoring a uniquely named interactive text field", async () => {
    const options = securityOptions();
    options.formCreates = [{
      id: "new", pageNumber: 1, type: "text", name: "new_review", label: "Review",
      rect: { x0: 100, y0: 100, x1: 250, y1: 130 }, defaultValue: "Created on purpose",
      required: false, multiline: false
    }];
    const output = await secureWriterExport(fixtureBytes, options);
    const report = await validatePdfFidelity(fixtureBytes, output, [1], undefined, undefined, {
      expectations: {
        expectedFormFieldCount: 4, widgetDeltaByPage: { 1: 1 },
        formCreates: [{ name: "new_review", pageNumber: 1, type: "text", value: "Created on purpose" }]
      }
    });
    expect(report.failures).toEqual([]);
  });
  it("accepts explicitly clearing editable form values", async () => {
    const options = securityOptions();
    options.sanitization = { ...options.sanitization, clearFormValues: true };
    const output = await secureWriterExport(fixtureBytes, options);
    const report = await validatePdfFidelity(fixtureBytes, output, [1], undefined, undefined, {
      expectations: { expectedFormFieldCount: 3, clearFormValues: true }
    });
    expect(report.failures).toEqual([]);
  });
  it("accepts explicitly flattening form widgets", async () => {
    const options = securityOptions();
    options.sanitization = { ...options.sanitization, flattenForms: true };
    const output = await secureWriterExport(fixtureBytes, options);
    const report = await validatePdfFidelity(fixtureBytes, output, [1], undefined, undefined, {
      expectations: { expectedFormFieldCount: 0, expectNoWidgetsOnAffectedPages: true, flattenForms: true }
    });
    expect(report.failures).toEqual([]);
  });
  it("retains all existing form states during an ordinary annotation-only edit", async () => {
    const pdf = mupdf.Document.openDocument(fixtureBytes, "application/pdf").asPDF()!;
    const page = pdf.loadPage(0) as mupdf.PDFPage;
    const annotation = page.createAnnotation("FreeText");
    annotation.setRect([350, 350, 490, 375]);
    annotation.setContents("Ordinary editor addition");
    annotation.update();
    const buffer = pdf.saveToBuffer();
    const output = Uint8Array.from(buffer.asUint8Array());
    buffer.destroy(); annotation.destroy(); page.destroy(); pdf.destroy();
    const report = await validatePdfFidelity(fixtureBytes, output, [1]);
    expect(report.failures).toEqual([]);
  });
});

function readonlyFixture(tamper: boolean): Uint8Array {
  const pdf = mupdf.Document.openDocument(fixtureBytes, "application/pdf").asPDF()!;
  try {
    const page = pdf.loadPage(0) as mupdf.PDFPage;
    try {
      const widget = page.getWidgets().find((candidate) => candidate.getName() === "full_name");
      if (!widget) throw new Error("Source test field missing");
      widget.getObject().put("Ff", 1); // PDF read-only flag.
      if (tamper) widget.getObject().put("V", pdf.newString("UNAUTHORIZED-READONLY"));
      page.update();
    } finally { page.destroy(); }
    const saved = pdf.saveToBuffer();
    try { return Uint8Array.from(saved.asUint8Array()); } finally { saved.destroy(); }
  } finally { pdf.destroy(); }
}
describe("P8 field authorization boundaries", () => {
  it("rejects read-only field changes even if falsely declared authorized", async () => {
    const source = readonlyFixture(false);
    const changed = readonlyFixture(true);
    const original = await inspectPdfFidelityProfile(source, [1]);
    expect(original.formWidgets?.find((widget) => widget.name === "full_name")?.editable).toBe(false);
    const report = await validatePdfFidelity(source, changed, [1], undefined, undefined, {
      expectations: { formValueUpdates: [{ name: "full_name", value: "UNAUTHORIZED-READONLY" }] }
    });
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/protected|form|field/i);
  });
  it("refuses signed-field value changes or signature flattening even if requested", async () => {
    const original = await inspectPdfFidelityProfile(fixtureBytes, [1]);
    const widgets = original.formWidgets?.map((widget) => widget.name === "full_name"
      ? { ...widget, type: "signature", editable: false } : widget);
    if (!widgets) throw new Error("Missing source fingerprint");
    const protectedProfile = { ...original, formWidgets: widgets };
    const tamperedProfile = {
      ...protectedProfile,
      formWidgets: widgets.map((widget) => widget.name === "full_name"
        ? { ...widget, value: JSON.stringify("forged") } : widget)
    };
    expect(comparePdfFidelityProfiles(protectedProfile, tamperedProfile, {
      formValueUpdates: [{ name: "full_name", value: "forged" }]
    }).passed).toBe(false);
    expect(comparePdfFidelityProfiles(protectedProfile, {
      ...protectedProfile, formWidgets: [], formFieldCount: 0,
      semantics: protectedProfile.semantics.map((page) => ({ ...page, widgetCount: 0 }))
    }, { flattenForms: true, expectedFormFieldCount: 0, expectNoWidgetsOnAffectedPages: true }).passed).toBe(false);
  });
  it("passes a real authorized P7 radio selection when the writer supports it", async () => {
    const input = radioFixture("approve");
    const options = securityOptions();
    options.formUpdates = [{ id: "1:1:decision", pageNumber: 1, widgetIndex: 1, name: "decision", type: "radiobutton", value: "reject" }];
    const output = await secureWriterExport(input, options);
    const report = await validatePdfFidelity(input, output, [1], undefined, undefined, {
      expectations: { expectedFormFieldCount: 2, formValueUpdates: [{ name: "decision", value: "reject" }] }
    });
    expect(report.failures).toEqual([]);
  });
  it("accepts a new P7 checkbox with its initial Off state", async () => {
    const options = securityOptions();
    options.formCreates = [{
      id: "created-checkbox", pageNumber: 1, type: "checkbox", name: "new_checkbox", label: "New checkbox",
      rect: { x0: 130, y0: 150, x1: 155, y1: 175 }, defaultValue: "", multiline: false, required: false
    }];
    const output = await secureWriterExport(fixtureBytes, options);
    const report = await validatePdfFidelity(fixtureBytes, output, [1], undefined, undefined, {
      expectations: { expectedFormFieldCount: 4, widgetDeltaByPage: { 1: 1 },
        formCreates: [{ name: "new_checkbox", pageNumber: 1, type: "checkbox", value: "Off" }] }
    });
    expect(report.failures).toEqual([]);
  });
  it("clears editable values but never clears an existing read-only field", async () => {
    const input = readonlyFixture(false);
    const options = securityOptions();
    options.sanitization = { ...options.sanitization, clearFormValues: true };
    const output = await secureWriterExport(input, options);
    const report = await validatePdfFidelity(input, output, [1], undefined, undefined, {
      expectations: { expectedFormFieldCount: 3, clearFormValues: true }
    });
    expect(report.failures).toEqual([]);
  });
  it("rejects contradictory authorizations for one named field", async () => {
    const report = await validatePdfFidelity(fixtureBytes, fixtureBytes, [1], undefined, undefined, {
      expectations: { formValueUpdates: [
        { name: "full_name", value: "one" }, { name: "full_name", value: "two" }
      ] }
    });
    expect(report.passed).toBe(false);
  });
});

describe("P7/P8 physical-widget counting contract", () => {
  it("agrees with actual Security worker inspection for a radio group", async () => {
    const input = radioFixture("approve");
    const profile = await inspectPdfFidelityProfile(input, [1]);
    const posted: any[] = [];
    const scope: any = { postMessage: (message: any) => posted.push(message) };
    vi.stubGlobal("self", scope);
    try {
      if (!securityWorkerHandler) {
        await import("../../src/workers/security.worker");
        securityWorkerHandler = scope.onmessage;
      }
      securityWorkerHandler!({ data: { type: "INSPECT_SECURITY", requestId: "p8-count-contract", bytes: input.slice().buffer } });
      const result = posted.find((entry) => entry.type === "SECURITY_INSPECTION_RESULT");
      if (!result) throw new Error("Security inspection did not return a report");
      expect(result.report.formFields).toHaveLength(2);
      expect(profile.formFieldCount).toBe(result.report.formFields.length);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe("P7 permitted choice-field edits remain usable", () => {
  it("accepts an exact authorized combobox selection", async () => {
    const options = securityOptions();
    options.formUpdates = [{ id: "1:2:country", pageNumber: 1, widgetIndex: 2, name: "country", type: "combobox", value: "Korea" }];
    const output = await secureWriterExport(fixtureBytes, options);
    const report = await validatePdfFidelity(fixtureBytes, output, [1], undefined, undefined, {
      expectations: { expectedFormFieldCount: 3, formValueUpdates: [{ name: "country", value: "Korea" }] }
    });
    expect(report.failures).toEqual([]);
  });
});
