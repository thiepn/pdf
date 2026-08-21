import type { NativeComplexEdit, NativeEdit, NativePageObject, NativeTableEdit } from "../../types/nativeEditor";
import { NativeComplexPropertiesPanel } from "./NativeComplexPropertiesPanel";
import { NativeContentPropertiesPanel as LegacyNativeContentPropertiesPanel } from "./LegacyNativeContentPropertiesPanel";
import { NativeTablePropertiesPanel } from "./NativeTablePropertiesPanel";

interface Props {
  object: NativePageObject;
  queuedEdits: NativeEdit[];
  onQueue: (edits: NativeEdit[]) => void;
  onRemove: (objectId: string) => void;
}

/**
 * P7 preserves the qualified P1-P5 property implementations and intercepts only
 * first-class nested Form XObject groups. Structured tables remain on the P5
 * panel; all earlier object types continue through the legacy implementation.
 */
export function NativeContentPropertiesPanel({ object, queuedEdits, onQueue, onRemove }: Props) {
  if (object.type === "complex") {
    const queued = queuedEdits.find((edit): edit is NativeComplexEdit => edit.kind === "complex" && edit.objectId === object.id);
    return <NativeComplexPropertiesPanel object={object} queued={queued} onQueue={(edit) => onQueue([edit])} onRemove={() => onRemove(object.id)} />;
  }
  if (object.type !== "table") return <LegacyNativeContentPropertiesPanel object={object} queuedEdits={queuedEdits} onQueue={onQueue} onRemove={onRemove} />;
  const queued = queuedEdits.find((edit): edit is NativeTableEdit => edit.kind === "table" && edit.objectId === object.id);
  return <aside className="editor-properties native-unified-properties">
    <section className="property-section native-capability-card">
      <div className="native-capability-card__heading"><div><p className="eyebrow">Existing PDF content</p><h2>Table</h2></div><span className={`capability-chip capability-chip--${object.capability.level}`}>{object.editability === "structured-table" ? "Structured editing" : object.editability === "unsupported" ? "Editing unavailable" : "Cell reconstruction"}</span></div>
      <p>{object.capability.reason}</p>
      <details><summary>Technical details</summary><div className="capability-meter"><span style={{ width: `${Math.round(object.capability.confidence * 100)}%` }} /></div><small>{Math.round(object.capability.confidence * 100)}% editing-support confidence</small>{object.capability.preserves.length ? <><strong>Preserves</strong><ul>{object.capability.preserves.map((item) => <li key={item}>{item}</li>)}</ul></> : null}{object.capability.risks.length ? <><strong>Possible changes</strong><ul>{object.capability.risks.map((item) => <li key={item}>{item}</li>)}</ul></> : null}</details>
      {queued ? <div className="native-queued-chip"><span>1 pending table change</span><button onClick={() => onRemove(object.id)} type="button">Discard</button></div> : null}
    </section>
    <NativeTablePropertiesPanel object={object} queued={queued} onQueue={(edit) => onQueue([edit])} />
  </aside>;
}
