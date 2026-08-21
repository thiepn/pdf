import { useEffect, useState } from "react";
import type { NativeComplexEdit, NativeComplexObject, NativeRect } from "../../types/nativeEditor";

interface Props {
  object: NativeComplexObject;
  queued?: NativeComplexEdit;
  onQueue: (edit: NativeComplexEdit) => void;
  onRemove: () => void;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function GeometryEditor({ bounds, onChange }: { bounds: NativeRect; onChange: (bounds: NativeRect) => void }) {
  const field = (label: string, key: keyof NativeRect, min?: number) => <label className="property-field"><span>{label}</span><input aria-label={label} min={min} step="1" type="number" value={Number(bounds[key].toFixed(2))} onChange={(event) => onChange({ ...bounds, [key]: key === "w" || key === "h" ? Math.max(1, finite(Number(event.target.value), bounds[key])) : finite(Number(event.target.value), bounds[key]) })} /></label>;
  return <div className="property-grid-two">{field("X", "x")}{field("Y", "y")}{field("Width", "w", 1)}{field("Height", "h", 1)}</div>;
}

function contentLabel(object: NativeComplexObject): string {
  const labels: Record<string, string> = { text: "text", image: "images", vector: "vector artwork", form: "nested forms", unknown: "other PDF content" };
  return object.contentKinds.map((kind) => labels[kind] ?? kind).join(", ");
}

export function NativeComplexPropertiesPanel({ object, queued, onQueue, onRemove }: Props) {
  const [action, setAction] = useState<NativeComplexEdit["action"]>(queued?.action ?? "transform");
  const [bounds, setBounds] = useState<NativeRect>(queued?.bounds ?? object.bounds);
  const [rotation, setRotation] = useState(queued?.rotation ?? 0);

  useEffect(() => {
    setAction(queued?.action ?? "transform");
    setBounds(queued?.bounds ?? object.bounds);
    setRotation(queued?.rotation ?? 0);
  }, [object.id, queued?.id]);

  const unsupported = object.editability === "unsupported";
  const queue = () => onQueue({
    id: queued?.id ?? crypto.randomUUID(),
    kind: "complex",
    objectId: object.id,
    pageNumber: object.pageNumber,
    action,
    sourceBounds: queued?.sourceBounds ?? object.bounds,
    bounds,
    resourceName: object.resourceName,
    sourceStreamIndex: object.sourceStreamIndex,
    sourceInvocationIndex: object.sourceInvocationIndex,
    sourceSignature: object.sourceSignature,
    rotation: finite(rotation, 0)
  });

  return <aside className="editor-properties native-unified-properties p7-complex-properties">
    <section className="property-section native-capability-card">
      <div className="native-capability-card__heading"><div><p className="eyebrow">Existing PDF content · P7</p><h2>Nested PDF group</h2></div><span className={`capability-chip capability-chip--${object.capability.level}`}>{unsupported ? "Editing unavailable" : "Instance editing"}</span></div>
      <p>{object.capability.reason}</p>
      <details><summary>Technical details</summary><div className="capability-meter"><span style={{ width: `${Math.round(object.capability.confidence * 100)}%` }} /></div><small>{Math.round(object.capability.confidence * 100)}% editing-support confidence</small><dl className="native-object-facts"><dt>PDF resource</dt><dd>/{object.resourceName}</dd><dt>Nested content</dt><dd>{contentLabel(object)}</dd><dt>Instances on page</dt><dd>{object.instanceCount}</dd><dt>Page clipping</dt><dd>{object.clipped ? "Yes" : "No"}</dd></dl>{object.capability.preserves.length ? <><strong>Preserves</strong><ul>{object.capability.preserves.map((item) => <li key={item}>{item}</li>)}</ul></> : null}{object.capability.risks.length ? <><strong>Possible changes</strong><ul>{object.capability.risks.map((item) => <li key={item}>{item}</li>)}</ul></> : null}</details>
      {queued ? <div className="native-queued-chip"><span>1 pending nested-group change</span><button onClick={onRemove} type="button">Discard</button></div> : null}
    </section>

    <section className="property-section property-stack">
      <h3>Group instance</h3>
      <p className="property-note">This edits only the selected page placement. The shared Form XObject is not flattened or rewritten, so other uses of the same nested PDF object stay unchanged.</p>
      <label className="property-field"><span>Operation</span><select aria-label="Nested group operation" disabled={unsupported} value={action} onChange={(event) => setAction(event.target.value as NativeComplexEdit["action"])}><option value="transform">Move / resize / rotate instance</option><option value="delete">Delete this instance</option></select></label>
      {action === "transform" ? <><GeometryEditor bounds={bounds} onChange={setBounds} /><label className="property-field"><span>Rotation</span><input aria-label="Rotation" disabled={unsupported} max="360" min="-360" step="1" type="number" value={Number(rotation.toFixed(2))} onChange={(event) => setRotation(finite(Number(event.target.value), rotation))} /></label>{object.clipped ? <div className="warning-banner"><strong>Clipped group</strong><span>The group remains inside its original page clipping boundary. Moving it can change which portions are visible without changing the clipping object itself.</span></div> : null}</> : <div className="warning-banner"><strong>Delete one instance only</strong><span>The selected page invocation will be removed. The reusable nested Form and any other instances remain in the PDF.</span></div>}
      <button className={action === "delete" ? "button button--danger" : "button"} disabled={unsupported} onClick={queue} type="button">{action === "delete" ? "Delete nested group" : queued ? "Update nested group transform" : "Apply nested group transform"}</button>
    </section>
  </aside>;
}
