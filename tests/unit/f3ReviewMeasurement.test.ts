// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as mupdf from "mupdf";
import { createMinimalPdf } from "../../src/fixtures/minimalPdf";
import { createObjectForTool } from "../../src/editor/editorModel";
import { measurementLabel, measurementValue, calibrateMeasurement, validateMeasurement, MM_PER_PDF_POINT } from "../../src/review/measurementModel";
import { reviewReply, reviewStatus, validateReviewNote, reviewAnnotationCount } from "../../src/review/reviewModel";
import { writeReviewNote, writeMeasurement } from "../../src/review/pdfReviewWriter";
import type { MeasurementEditorObject, NoteEditorObject } from "../../src/types/editor";

const identity: [number,number,number,number,number,number] = [1,0,0,1,0,0];

function sample<T extends "note" | "measurement">(tool: "note" | "measure-distance" | "measure-area", type: T): Extract<import("../../src/types/editor").EditorObject, {type: T}> {
  const value = createObjectForTool({
    tool, pageNumber: 1,
    bounds: { x0: 50, y0: 200, x1: 150, y1: 240 },
    author: "Editor", zIndex: 1
  });
  if (!value || value.type !== type) throw new Error("Missing F3 sample");
  return value as Extract<import("../../src/types/editor").EditorObject, {type: T}>;
}
describe("F3 calibrated review geometry", () => {
  it("calculates metric length, rectangle area and reproducible calibration", () => {
    const box = { x0:0,y0:0,x1:30,y1:40 };
    expect(measurementValue(box,"distance",2,"mm")).toBe(100);
    expect(measurementValue(box,"area",2,"cm")).toBe(48);
    expect(calibrateMeasurement(box,"distance",200)).toBe(4);
    expect(calibrateMeasurement(box,"area",120)).toBe(4);
    expect(() => calibrateMeasurement(box,"distance",0)).toThrow();
    expect(MM_PER_PDF_POINT).toBeCloseTo(.3527777,6);
  });
  it("rejects unsafe calibration and duplicate reply identities", () => {
    const line = sample("measure-distance","measurement") as MeasurementEditorObject;
    expect(() => validateMeasurement({...line,mmPerPoint:0})).toThrow();
    expect(() => validateMeasurement({...line,mmPerPoint:Infinity})).toThrow();
    const note = sample("note","note") as NoteEditorObject;
    const reply = reviewReply("Reviewer","Approved with changes", "reply-1", 1000);
    expect(() => validateReviewNote({...note,replies:[reply,reply]})).toThrow(/identifiers/);
    expect(reviewStatus({...note,resolved:true,reviewStatus:undefined})).toBe("resolved");
    expect(reviewAnnotationCount({...note,replies:[reply]})).toBe(2);
  });
  it("exports linked PDF reply annotations and ISO /Measure dictionaries", () => {
    const pdf = new mupdf.PDFDocument(createMinimalPdf());
    let bytes: Uint8Array;
    try {
      const note: NoteEditorObject = {
        ...(sample("note","note") as NoteEditorObject),
        id:"parent-note", subject:"Source review", contents:"Please verify", resolved:true,reviewStatus:"resolved",
        replies:[reviewReply("Reviewer A","Checked", "reply-1", 1000),reviewReply("Reviewer B","Accepted","reply-2",2000)]
      };
      const length: MeasurementEditorObject = {...(sample("measure-distance","measurement") as MeasurementEditorObject),id:"length-1", mmPerPoint:2,unit:"cm"};
      const area: MeasurementEditorObject = {...(sample("measure-area","measurement") as MeasurementEditorObject),id:"area-1",unit:"mm"};
      const page = pdf.loadPage(0);
      try {
        expect(writeReviewNote(pdf,page,note,identity)).toBe(3);
        expect(writeMeasurement(pdf,page,length,identity)).toBe(1);
        expect(writeMeasurement(pdf,page,area,identity)).toBe(1);
      } finally {page.destroy();}
      const buffer = pdf.saveToBuffer("compress=yes");
      try { bytes = Uint8Array.from(buffer.asUint8Array()); } finally {buffer.destroy();}
    } finally {pdf.destroy();}
    const output = new mupdf.PDFDocument(bytes!);
    try {
      const page = output.loadPage(0);
      try {
        const annotations = page.getAnnotations();
        try {
          expect(annotations).toHaveLength(5);
          const parent = annotations.find((a) => a.getName() === "parent-note");
          expect(parent?.getContents()).toBe("Please verify");
          expect(parent?.getObject().get("State").asString()).toBe("Completed");
          const children = annotations.filter((a) => a.getObject().get("IRT").isNull() === false);
          expect(children).toHaveLength(2);
          expect(children.map((a) => a.getContents()).sort()).toEqual(["Accepted","Checked"]);
          for(const child of children) expect(child.getObject().get("RT").asName()).toBe("R");
          const dimensions = annotations.filter((a) => ["length-1","area-1"].includes(a.getName()));
          expect(dimensions).toHaveLength(2);
          for (const annotation of dimensions) {
            const measure = annotation.getObject().get("Measure");
            expect(measure.get("Subtype").asName()).toBe("RL");
            expect(measure.get("X").length).toBeGreaterThan(0);
          }
        } finally { annotations.forEach((a) => a.destroy()); }
      } finally {page.destroy();}
    } finally {output.destroy();}
    expect(measurementLabel({bounds:{x0:0,y0:0,x1:3,y1:4},kind:"distance",mmPerPoint:10,unit:"cm"})).toBe("5 cm");
  });
});
