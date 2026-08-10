import type { EditorObject } from "../../types/editor";
import { rectHeight, rectWidth } from "../editorModel";

interface Props {
  selected: EditorObject[];
  onChange: (label: string, object: EditorObject, mergeKey?: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringFront: () => void;
  onSendBack: () => void;
}

export function EditorPropertiesPanel({ selected, onChange, onDelete, onDuplicate, onBringFront, onSendBack }: Props) {
  if (!selected.length) return <aside className="editor-properties"><div className="editor-panel-empty"><strong>No selection</strong><p>Select an object to edit its appearance and behavior.</p></div></aside>;
  if (selected.length > 1) return (
    <aside className="editor-properties">
      <header><span>Selection</span><strong>{selected.length} objects</strong></header>
      <div className="editor-properties__body">
        <div className="property-actions"><button onClick={onDuplicate} type="button">Duplicate</button><button onClick={onBringFront} type="button">Bring front</button><button onClick={onSendBack} type="button">Send back</button><button className="danger" onClick={onDelete} type="button">Delete</button></div>
      </div>
    </aside>
  );
  const object = selected[0];
  const patch = <T extends EditorObject>(changes: Partial<T>, label = "Change properties", mergeKey = `property:${object.id}`) => onChange(label, { ...object, ...changes } as EditorObject, mergeKey);

  return (
    <aside className="editor-properties">
      <header><span>Properties</span><strong>{object.type}</strong></header>
      <div className="editor-properties__body">
        <section className="property-section">
          <h3>Position</h3>
          <div className="property-grid property-grid--two">
            <NumberField label="X" value={object.bounds.x0} onChange={(value) => patch({ bounds: { ...object.bounds, x0: value, x1: value + rectWidth(object.bounds) } } as Partial<typeof object>, "Move object")} />
            <NumberField label="Y" value={object.bounds.y0} onChange={(value) => patch({ bounds: { ...object.bounds, y0: value, y1: value + rectHeight(object.bounds) } } as Partial<typeof object>, "Move object")} />
            <NumberField label="Width" min={2} value={rectWidth(object.bounds)} onChange={(value) => patch({ bounds: { ...object.bounds, x1: object.bounds.x0 + value } } as Partial<typeof object>, "Resize object")} />
            <NumberField label="Height" min={2} value={rectHeight(object.bounds)} onChange={(value) => patch({ bounds: { ...object.bounds, y1: object.bounds.y0 + value } } as Partial<typeof object>, "Resize object")} />
          </div>
          <div className="property-grid property-grid--two">
            <NumberField label="Rotation" min={-180} max={180} value={object.rotation} onChange={(value) => patch({ rotation: value } as Partial<typeof object>, "Rotate object")} />
            <NumberField label="Opacity" min={0.05} max={1} step={0.05} value={object.opacity} onChange={(value) => patch({ opacity: value } as Partial<typeof object>)} />
          </div>
          {object.rotation ? <p className="property-note">Rotation is preserved in the editor preview. The current annotation exporter normalizes rotation and reports it during export.</p> : null}
          <label className="property-toggle"><input checked={object.locked} onChange={(event) => patch({ locked: event.target.checked } as Partial<typeof object>, event.target.checked ? "Lock object" : "Unlock object", undefined)} type="checkbox" />Locked</label>
        </section>

        {object.type === "text" ? <TextProperties object={object} patch={patch} /> : null}
        {object.type === "image" ? <ImageProperties object={object} patch={patch} /> : null}
        {object.type === "shape" ? <ShapeProperties object={object} patch={patch} /> : null}
        {object.type === "ink" ? <InkProperties object={object} patch={patch} /> : null}
        {object.type === "highlight" ? <section className="property-section"><h3>{object.style}</h3><ColorField label="Color" value={object.color} onChange={(color) => patch({ color })} /></section> : null}
        {object.type === "note" ? <NoteProperties object={object} patch={patch} /> : null}
        {object.type === "link" ? <LinkProperties object={object} patch={patch} /> : null}
        {object.type === "stamp" ? <StampProperties object={object} patch={patch} /> : null}
        {object.type === "signature" ? <SignatureProperties object={object} patch={patch} /> : null}
        {object.type === "redaction" ? <RedactionProperties object={object} patch={patch} /> : null}

        <section className="property-section">
          <h3>Arrange</h3>
          <div className="property-actions"><button onClick={onDuplicate} type="button">Duplicate</button><button onClick={onBringFront} type="button">Bring front</button><button onClick={onSendBack} type="button">Send back</button><button className="danger" onClick={onDelete} type="button">Delete</button></div>
        </section>
      </div>
    </aside>
  );
}

function TextProperties({ object, patch }: { object: Extract<EditorObject, { type: "text" }>; patch: PatchFn<typeof object> }) {
  return <section className="property-section"><h3>Text</h3>
    <label className="property-field"><span>Content</span><textarea onChange={(event) => patch({ text: event.target.value }, "Edit text", `text:${object.id}`)} rows={5} value={object.text} /></label>
    <label className="property-field"><span>Font</span><select onChange={(event) => patch({ fontFamily: event.target.value as typeof object.fontFamily })} value={object.fontFamily}><option>Helvetica</option><option>Times-Roman</option><option>Courier</option></select></label>
    <div className="property-grid property-grid--two"><NumberField label="Size" min={4} max={144} value={object.fontSize} onChange={(fontSize) => patch({ fontSize })} /><NumberField label="Line height" min={0.8} max={3} step={0.05} value={object.lineHeight} onChange={(lineHeight) => patch({ lineHeight })} /></div>
    <div className="property-segmented"><button className={object.fontWeight === "bold" ? "active" : ""} onClick={() => patch({ fontWeight: object.fontWeight === "bold" ? "normal" : "bold" })} type="button">Bold</button><button className={object.fontStyle === "italic" ? "active" : ""} onClick={() => patch({ fontStyle: object.fontStyle === "italic" ? "normal" : "italic" })} type="button">Italic</button>{(["left", "center", "right"] as const).map((align) => <button className={object.textAlign === align ? "active" : ""} key={align} onClick={() => patch({ textAlign: align })} type="button">{align}</button>)}</div>
    <ColorField label="Text color" value={object.color} onChange={(color) => patch({ color })} />
    <ColorField label="Background" value={solidColor(object.backgroundColor)} onChange={(backgroundColor) => patch({ backgroundColor })} />
    <ColorField label="Border" value={solidColor(object.borderColor)} onChange={(borderColor) => patch({ borderColor })} />
    <NumberField label="Border width" min={0} max={12} step={0.5} value={object.borderWidth} onChange={(borderWidth) => patch({ borderWidth })} />
  </section>;
}

function ImageProperties({ object, patch }: { object: Extract<EditorObject, { type: "image" }>; patch: PatchFn<typeof object> }) {
  return <section className="property-section"><h3>Image</h3><p className="property-note">{object.intrinsicWidth} × {object.intrinsicHeight}px · {object.mimeType}</p><label className="property-field"><span>Alt description</span><textarea onChange={(event) => patch({ altText: event.target.value }, "Edit image description", `alt:${object.id}`)} rows={3} value={object.altText} /></label><label className="property-toggle"><input checked={object.preserveAspectRatio} onChange={(event) => patch({ preserveAspectRatio: event.target.checked }, "Change image sizing", undefined)} type="checkbox" />Preserve aspect ratio</label></section>;
}

function ShapeProperties({ object, patch }: { object: Extract<EditorObject, { type: "shape" }>; patch: PatchFn<typeof object> }) {
  return <section className="property-section"><h3>Shape</h3><ColorField label="Stroke" value={object.strokeColor} onChange={(strokeColor) => patch({ strokeColor })} />{!(["line", "arrow"] as string[]).includes(object.shape) ? <ColorField label="Fill" value={solidColor(object.fillColor)} onChange={(fillColor) => patch({ fillColor })} /> : null}<NumberField label="Stroke width" min={0.5} max={24} step={0.5} value={object.strokeWidth} onChange={(strokeWidth) => patch({ strokeWidth })} /><label className="property-field"><span>Line style</span><select onChange={(event) => patch({ dash: event.target.value as typeof object.dash })} value={object.dash}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label></section>;
}

function InkProperties({ object, patch }: { object: Extract<EditorObject, { type: "ink" }>; patch: PatchFn<typeof object> }) {
  return <section className="property-section"><h3>Drawing</h3><ColorField label="Color" value={object.color} onChange={(color) => patch({ color })} /><NumberField label="Stroke width" min={0.5} max={30} step={0.5} value={object.strokeWidth} onChange={(strokeWidth) => patch({ strokeWidth })} /><label className="property-toggle"><input checked={object.highlighter} onChange={(event) => patch({ highlighter: event.target.checked, opacity: event.target.checked ? 0.4 : 1 }, "Change pen mode", undefined)} type="checkbox" />Highlighter stroke</label></section>;
}

function NoteProperties({ object, patch }: { object: Extract<EditorObject, { type: "note" }>; patch: PatchFn<typeof object> }) {
  return <section className="property-section"><h3>Comment</h3><label className="property-field"><span>Author</span><input onChange={(event) => patch({ author: event.target.value }, "Edit comment author", `note-author:${object.id}`)} value={object.author} /></label><label className="property-field"><span>Subject</span><input onChange={(event) => patch({ subject: event.target.value }, "Edit comment subject", `note-subject:${object.id}`)} value={object.subject} /></label><label className="property-field"><span>Comment</span><textarea onChange={(event) => patch({ contents: event.target.value }, "Edit comment", `note:${object.id}`)} rows={6} value={object.contents} /></label><ColorField label="Color" value={object.color} onChange={(color) => patch({ color })} /><label className="property-toggle"><input checked={object.resolved} onChange={(event) => patch({ resolved: event.target.checked }, event.target.checked ? "Resolve comment" : "Reopen comment", undefined)} type="checkbox" />Resolved</label></section>;
}

function LinkProperties({ object, patch }: { object: Extract<EditorObject, { type: "link" }>; patch: PatchFn<typeof object> }) {
  return <section className="property-section"><h3>Link</h3><label className="property-field"><span>Type</span><select onChange={(event) => patch({ targetType: event.target.value as typeof object.targetType }, "Change link type", undefined)} value={object.targetType}><option value="url">Web URL</option><option value="page">Page</option><option value="email">Email</option></select></label><label className="property-field"><span>Target</span><input onChange={(event) => patch({ target: event.target.value }, "Edit link", `link:${object.id}`)} placeholder={object.targetType === "page" ? "Page number" : object.targetType === "email" ? "name@example.com" : "https://example.com"} value={object.target} /></label><ColorField label="Guide color" value={object.borderColor} onChange={(borderColor) => patch({ borderColor })} /><NumberField label="Guide width" min={0} max={6} step={0.5} value={object.borderWidth} onChange={(borderWidth) => patch({ borderWidth })} /></section>;
}

function StampProperties({ object, patch }: { object: Extract<EditorObject, { type: "stamp" }>; patch: PatchFn<typeof object> }) {
  return <section className="property-section"><h3>Stamp</h3><label className="property-field"><span>Label</span><input onChange={(event) => patch({ label: event.target.value.toUpperCase() }, "Edit stamp", `stamp:${object.id}`)} value={object.label} /></label><ColorField label="Text" value={object.color} onChange={(color) => patch({ color })} /><ColorField label="Background" value={solidColor(object.backgroundColor)} onChange={(backgroundColor) => patch({ backgroundColor })} /><ColorField label="Border" value={object.borderColor} onChange={(borderColor) => patch({ borderColor })} /></section>;
}

function SignatureProperties({ object, patch }: { object: Extract<EditorObject, { type: "signature" }>; patch: PatchFn<typeof object> }) {
  return <section className="property-section"><h3>Visual signature</h3><p className="property-note">This creates a visible signature mark only. It does not contain a digital certificate.</p><label className="property-field"><span>Name</span><input onChange={(event) => patch({ signerName: event.target.value }, "Edit signature", `signature:${object.id}`)} value={object.signerName} /></label><label className="property-field"><span>Reason</span><input onChange={(event) => patch({ reason: event.target.value }, "Edit signature reason", `signature-reason:${object.id}`)} placeholder="Optional" value={object.reason} /></label><label className="property-field"><span>Location</span><input onChange={(event) => patch({ location: event.target.value }, "Edit signature location", `signature-location:${object.id}`)} placeholder="Optional" value={object.location} /></label><ColorField label="Ink" value={object.color} onChange={(color) => patch({ color })} /><label className="property-toggle"><input checked={object.showDate} onChange={(event) => patch({ showDate: event.target.checked }, "Toggle signature date", undefined)} type="checkbox" />Show date</label><label className="property-toggle"><input checked={object.showLabels} onChange={(event) => patch({ showLabels: event.target.checked }, "Toggle signature details", undefined)} type="checkbox" />Show reason and location</label><button onClick={() => patch({ signedAt: Date.now() }, "Update signature date", undefined)} type="button">Use current date and time</button></section>;
}

function RedactionProperties({ object, patch }: { object: Extract<EditorObject, { type: "redaction" }>; patch: PatchFn<typeof object> }) {
  return <section className="property-section"><h3>Redaction mark</h3><p className="property-note">This region is only marked until you apply it in the Secure workspace. A black rectangle alone does not remove the underlying content.</p><ColorField label="Fill" value={object.fillColor} onChange={(fillColor) => patch({ fillColor })} /><label className="property-field"><span>Overlay label</span><input onChange={(event) => patch({ overlayText: event.target.value.toUpperCase() }, "Edit redaction label", `redaction:${object.id}`)} value={object.overlayText} /></label></section>;
}

type PatchFn<T> = (changes: Partial<T>, label?: string, mergeKey?: string) => void;

function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="property-field"><span>{label}</span><input max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} step={step} type="number" value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0} /></label>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="property-color"><span>{label}</span><input onChange={(event) => onChange(event.target.value)} type="color" value={solidColor(value)} /><code>{solidColor(value)}</code></label>;
}

function solidColor(value: string): string { return /^#[0-9a-f]{6}/i.test(value) ? value.slice(0, 7) : "#000000"; }
