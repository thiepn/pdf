import { useState } from "react";
import type { MeasurementEditorObject } from "../types/editor";
import { calibrateMeasurement, measurementLabel, measurementSpan, validateMeasurement } from "./measurementModel";

interface Props {
  object: MeasurementEditorObject;
  onPatch: (changes: Partial<MeasurementEditorObject>, label?: string, mergeKey?: string) => void;
}
export function MeasurementProperties({ object, onPatch }: Props) {
  const [referenceMm, setReferenceMm] = useState("");
  const [error, setError] = useState("");
  let valid = true;
  try { validateMeasurement(object); } catch { valid = false; }
  function calibrate(): void {
    try {
      const scale = calibrateMeasurement(object.bounds, object.kind, Number(referenceMm));
      onPatch({ mmPerPoint: scale }, "Calibrate PDF measurement", undefined);
      setReferenceMm("");
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  return <section className="property-section f3-measurement-properties" aria-label="Calibrated PDF measurement">
    <h3>{object.kind === "distance" ? "Measure distance" : "Measure rectangle area"}</h3>
    <output aria-live="polite" className="f3-measurement-result">{valid ? measurementLabel(object) : "Invalid calibration"}</output>
    <p className="property-note">Uses the PDF page's vector coordinates. Scale applies only to this measurement; confirm the drawing scale before relying on a result.</p>
    <label className="property-field"><span>Metric unit</span><select aria-label="Measurement unit" value={object.unit} onChange={(event) => onPatch({ unit: event.target.value as MeasurementEditorObject["unit"] }, "Change measurement unit", undefined)}>
      <option value="mm">Millimetres</option><option value="cm">Centimetres</option><option value="m">Metres</option>
    </select></label>
    <label className="property-field"><span>Line color</span><input aria-label="Measurement line color" type="color" value={object.strokeColor} onChange={(event) => onPatch({ strokeColor: event.target.value }, "Change measurement appearance", undefined)} /></label>
    <label className="property-field"><span>Line thickness (pt)</span><input type="number" aria-label="Measurement line thickness" min="0.5" max="12" step="0.5" value={object.lineWidth} onChange={(event) => onPatch({ lineWidth: Number(event.target.value) }, "Change measurement thickness", undefined)} /></label>
    <h3>Calibrate using a known distance</h3>
    <p className="property-note">{object.kind === "distance" ? "Reference: full diagonal of the drawn measurement." : "Reference: width of the drawn rectangle."} Current reference span: {measurementSpan(object.bounds, object.kind).toFixed(1)} PDF pt.</p>
    <label className="property-field"><span>Known real-world length (mm)</span><input aria-label="Known measurement length in mm" type="number" min="0.001" step="any" placeholder="e.g. 1000" value={referenceMm} onChange={(event) => setReferenceMm(event.target.value)} /></label>
    <button disabled={!referenceMm.trim()} type="button" onClick={calibrate}>Apply calibration</button>
    <p className="property-note">Scale: {object.mmPerPoint.toPrecision(5)} mm per PDF point. Default assumes unscaled PDF points (25.4 mm per 72 pt).</p>
    {error ? <p role="alert" className="property-note">{error}</p> : null}
  </section>;
}
