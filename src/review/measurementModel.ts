import type { Rect } from "../core/coordinates";
import type { MeasurementEditorObject } from "../types/editor";

export const MM_PER_PDF_POINT = 25.4 / 72;
export type MeasurementUnit = "mm" | "cm" | "m";
export type MeasurementKind = "distance" | "area";

function points(rect: Rect): { width: number; height: number } {
  return { width: Math.abs(rect.x1 - rect.x0), height: Math.abs(rect.y1 - rect.y0) };
}
export function measurementSpan(rect: Rect, kind: MeasurementKind): number {
  const { width, height } = points(rect);
  return kind === "distance" ? Math.hypot(width, height) : width;
}
export function measurementValue(rect: Rect, kind: MeasurementKind, mmPerPoint: number, unit: MeasurementUnit): number {
  if (!Number.isFinite(mmPerPoint) || mmPerPoint <= 0) throw new Error("Calibration must be a positive finite scale.");
  const { width, height } = points(rect);
  const factor = unit === "mm" ? 1 : unit === "cm" ? 10 : 1000;
  return kind === "distance"
    ? Math.hypot(width, height) * mmPerPoint / factor
    : width * height * mmPerPoint * mmPerPoint / (factor * factor);
}
export function measurementLabel(object: Pick<MeasurementEditorObject, "bounds" | "kind" | "mmPerPoint" | "unit">): string {
  const value = measurementValue(object.bounds, object.kind, object.mmPerPoint, object.unit);
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })} ${object.unit}${object.kind === "area" ? "²" : ""}`;
}
export function calibrateMeasurement(rect: Rect, kind: MeasurementKind, knownDistanceMm: number): number {
  const span = measurementSpan(rect, kind);
  if (!Number.isFinite(knownDistanceMm) || knownDistanceMm <= 0 || !Number.isFinite(span) || span < 1) {
    throw new Error("Draw a span at least one PDF point long, then enter a positive real-world distance in mm.");
  }
  const result = knownDistanceMm / span;
  if (result < 0.000001 || result > 1_000_000) throw new Error("Calibration must be between 0.000001 and 1,000,000 mm per point.");
  return result;
}
export function validateMeasurement(object: MeasurementEditorObject): void {
  const { width, height } = points(object.bounds);
  if (!(["distance", "area"] as string[]).includes(object.kind)) throw new Error("Unsupported measurement type.");
  if (!(["mm", "cm", "m"] as string[]).includes(object.unit)) throw new Error("Unsupported metric unit.");
  if (![object.bounds.x0, object.bounds.y0, object.bounds.x1, object.bounds.y1].every(Number.isFinite) || !Number.isFinite(width * height) || width < 1 || height < 1) throw new Error("Measurement geometry must be finite and nonzero.");
  if (!Number.isFinite(object.mmPerPoint) || object.mmPerPoint < 0.000001 || object.mmPerPoint > 1_000_000) throw new Error("Measurement calibration is outside supported bounds.");
}
