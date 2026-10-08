import type { AffineMatrix, Point } from "../core/coordinates";
import type { MeasurementEditorObject, NoteEditorObject } from "../types/editor";
import { measurementLabel, validateMeasurement } from "./measurementModel";
import { reviewAnnotationCount, reviewStatus, validateReviewNote } from "./reviewModel";

/** PDF.js and MuPDF load these as genuine annotations. The writer is used only
 * inside the existing full-save export Worker; nothing writes to source bytes. */
type PdfLike = {
  newDictionary(): any;
  newArray(): any;
  newName(value: string): any;
  newString(value: string): any;
};
function point(matrix: AffineMatrix, value: Point): [number, number] {
  const [a,b,c,d,e,f] = matrix;
  return [a * value.x + c * value.y + e, b * value.x + d * value.y + f];
}
function color(hex: string): number[] {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "236a92";
  return [0,2,4].map((i) => parseInt(value.slice(i,i+2),16)/255);
}
function numberFormat(pdf: PdfLike, unit: string, conversion: number): any {
  const dict = pdf.newDictionary();
  dict.put("Type", pdf.newName("NumberFormat"));
  dict.put("U", pdf.newString(unit));
  dict.put("C", conversion);
  dict.put("D", 100);
  return dict;
}
function arrayOne(pdf: PdfLike, value: any): any {
  const array = pdf.newArray();
  array.push(value);
  return array;
}

export function writeReviewNote(pdf: PdfLike, page: any, note: NoteEditorObject, transform: AffineMatrix): number {
  validateReviewNote(note);
  const p = point(transform, { x: note.bounds.x0, y: note.bounds.y0 });
  const q = point(transform, { x: note.bounds.x1, y: note.bounds.y1 });
  const rect = [Math.min(p[0],q[0]), Math.min(p[1],q[1]), Math.max(p[0],q[0]), Math.max(p[1],q[1])];
  const annotation = page.createAnnotation("Text");
  annotation.setName(note.id);
  annotation.setFlags(4);
  annotation.setRect(rect);
  annotation.setContents(note.contents);
  annotation.setAuthor?.(note.author);
  annotation.setSubject?.(note.subject);
  annotation.setCreationDate?.(new Date(note.createdAt));
  annotation.setModificationDate?.(new Date(note.modifiedAt));
  annotation.setColor(color(note.color));
  annotation.setIcon?.(reviewStatus(note) === "resolved" ? "Check" : "Comment");
  annotation.update();
  const status = reviewStatus(note);
  if (status === "resolved") {
    const object = annotation.getObject();
    object.put("StateModel", pdf.newString("Review"));
    object.put("State", pdf.newString("Completed"));
  }
  for (const reply of note.replies ?? []) {
    const child = page.createAnnotation("Text");
    child.setName(reply.id);
    child.setFlags(4);
    child.setRect(rect);
    child.setContents(reply.contents);
    child.setAuthor?.(reply.author);
    child.setCreationDate?.(new Date(reply.createdAt));
    child.setSubject?.("Reply");
    child.setColor(color(note.color));
    child.update();
    const dict = child.getObject();
    dict.put("IRT", annotation.getObject());
    dict.put("RT", pdf.newName("R"));
  }
  return reviewAnnotationCount(note);
}

export function writeMeasurement(pdf: PdfLike, page: any, object: MeasurementEditorObject, transform: AffineMatrix): number {
  validateMeasurement(object);
  const { x0,y0,x1,y1 } = object.bounds;
  const annotation = page.createAnnotation(object.kind === "distance" ? "Line" : "Polygon");
  annotation.setName(object.id);
  annotation.setFlags(4);
  annotation.setColor(color(object.strokeColor));
  annotation.setOpacity?.(object.opacity);
  annotation.setBorderWidth?.(Math.min(12,Math.max(.5,object.lineWidth)));
  if (object.kind === "distance") {
    annotation.setLine(point(transform,{x:x0,y:y0}), point(transform,{x:x1,y:y1}));
    annotation.setIntent?.("LineDimension");
  } else {
    annotation.setVertices?.([
      point(transform,{x:x0,y:y0}),point(transform,{x:x1,y:y0}),
      point(transform,{x:x1,y:y1}),point(transform,{x:x0,y:y1})
    ]);
    annotation.setIntent?.("PolygonDimension");
  }
  annotation.setContents(measurementLabel(object));
  annotation.update();
  const factor = object.unit === "mm" ? 1 : object.unit === "cm" ? 10 : 1000;
  const ratio = object.mmPerPoint / factor;
  // Rectilinear measurement dictionaries: ISO 32000 /Measure /Subtype /RL.
  // /X converts PDF points to the selected real-world unit.
  // /D converts X-units into distance units; /A formats squared X-units.
  const measure = pdf.newDictionary();
  measure.put("Type",pdf.newName("Measure"));
  measure.put("Subtype",pdf.newName("RL"));
  measure.put("R",pdf.newString(`1 pt = ${Number(ratio.toPrecision(9))} ${object.unit}`));
  measure.put("X",arrayOne(pdf,numberFormat(pdf,object.unit,ratio)));
  measure.put("D",arrayOne(pdf,numberFormat(pdf,object.unit,1)));
  measure.put("A",arrayOne(pdf,numberFormat(pdf,`${object.unit}²`,1)));
  annotation.getObject().put("Measure",measure);
  return 1;
}
