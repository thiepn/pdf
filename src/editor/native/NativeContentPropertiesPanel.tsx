import { useEffect, useMemo, useState } from "react";
import { cjkLanguageForScript, detectScript } from "../../native/nativeModel";
import { evaluateTextFit, findFittingFontSize } from "../../native/textFit";
import type {
  NativeEdit,
  NativeFormObject,
  NativeImageEdit,
  NativeImageObject,
  NativePageObject,
  NativeTableCellEdit,
  NativeTableObject,
  NativeTextEdit,
  NativeTextObject,
  NativeVectorEdit,
  NativeVectorObject
} from "../../types/nativeEditor";

interface Props {
  object: NativePageObject;
  queuedEdits: NativeEdit[];
  onQueue: (edits: NativeEdit[]) => void;
  onRemove: (objectId: string) => void;
}

export function NativeContentPropertiesPanel({ object, queuedEdits, onQueue, onRemove }: Props) {
  const related = useMemo(() => queuedEdits.filter((edit) => edit.objectId === object.id), [object.id, queuedEdits]);
  return <aside className="editor-properties native-unified-properties">
    <CapabilitySummary object={object} queuedCount={related.length} onRemove={() => onRemove(object.id)} />
    {object.type === "text" ? <TextEditor object={object} queued={related.find((edit): edit is NativeTextEdit => edit.kind === "text")} onQueue={(edit) => onQueue([edit])} /> : null}
    {object.type === "image" ? <ImageEditor object={object} queued={related.find((edit): edit is NativeImageEdit => edit.kind === "image")} onQueue={(edit) => onQueue([edit])} /> : null}
    {object.type === "vector" ? <VectorEditor object={object} queued={related.find((edit): edit is NativeVectorEdit => edit.kind === "vector")} onQueue={(edit) => onQueue([edit])} /> : null}
    {object.type === "table" ? <TableEditor object={object} queued={related.filter((edit): edit is NativeTableCellEdit => edit.kind === "table-cell")} onQueue={onQueue} /> : null}
    {object.type === "form" ? <FormEditor object={object} queued={related.find((edit) => edit.kind === "form")} onQueue={(edit) => onQueue([edit])} /> : null}
  </aside>;
}

function CapabilitySummary({ object, queuedCount, onRemove }: { object: NativePageObject; queuedCount: number; onRemove: () => void }) {
  const support = object.capability.level === "native-safe" ? "Directly editable" : object.capability.level === "safe-reconstruction" ? "Editable with reconstruction" : object.capability.level === "appearance-only" ? "Limited editing" : "Editing unavailable";
  const heading = object.type === "form" ? "Form field" : object.type === "text" && object.paragraph && (object.lineCount ?? 1) > 1 ? "Text paragraph" : object.type[0].toUpperCase() + object.type.slice(1);
  return <section className="property-section native-capability-card">
    <div className="native-capability-card__heading"><div><p className="eyebrow">Existing PDF content</p><h2>{heading}</h2></div><span className={`capability-chip capability-chip--${object.capability.level}`}>{support}</span></div>
    <p>{object.capability.reason}</p>
    <details><summary>Technical details</summary><div className="capability-meter"><span style={{ width: `${Math.round(object.capability.confidence * 100)}%` }} /></div><small>{Math.round(object.capability.confidence * 100)}% editing-support confidence</small>{object.capability.preserves.length ? <><strong>Preserves</strong><ul>{object.capability.preserves.map((item) => <li key={item}>{item}</li>)}</ul></> : null}{object.capability.risks.length ? <><strong>Possible changes</strong><ul>{object.capability.risks.map((item) => <li key={item}>{item}</li>)}</ul></> : null}</details>
    {queuedCount ? <div className="native-queued-chip"><span>{queuedCount} pending change{queuedCount === 1 ? "" : "s"}</span><button onClick={onRemove} type="button">Discard</button></div> : null}
  </section>;
}

function TextEditor({ object, queued, onQueue }: { object: NativeTextObject; queued?: NativeTextEdit; onQueue: (edit: NativeTextEdit) => void }) {
  const language = cjkLanguageForScript(object.script);
  const [text, setText] = useState(queued?.text ?? object.text);
  const [fontSize, setFontSize] = useState(queued?.fontSize ?? object.size);
  const [fontFamily, setFontFamily] = useState<NativeTextEdit["fontFamily"]>(queued?.fontFamily ?? language ?? familyForObject(object));
  const [color, setColor] = useState(queued?.color ?? "#111111");
  const [background, setBackground] = useState(queued?.backgroundColor ?? "#ffffff");
  const [align, setAlign] = useState<NativeTextEdit["align"]>(queued?.align ?? object.align ?? "left");
  const [wrap, setWrap] = useState(queued?.wrap ?? true);
  const [fontBytes, setFontBytes] = useState<Uint8Array | undefined>(queued?.fontBytes);
  const [fontName, setFontName] = useState(queued?.fontName ?? "");

  useEffect(() => {
    setText(queued?.text ?? object.text);
    setFontSize(queued?.fontSize ?? object.size);
    setFontFamily(queued?.fontFamily ?? language ?? familyForObject(object));
    setColor(queued?.color ?? "#111111");
    setBackground(queued?.backgroundColor ?? "#ffffff");
    setAlign(queued?.align ?? object.align ?? "left");
    setWrap(queued?.wrap ?? true);
    setFontBytes(queued?.fontBytes);
    setFontName(queued?.fontName ?? "");
  }, [object.id]);

  const unsupported = object.editability === "unsupported";
  const complex = object.editability === "overlay-only";
  const cjk = Boolean(language);
  const paragraph = Boolean(object.paragraph && (object.lineCount ?? 1) > 1);
  const fit = useMemo(() => evaluateTextFit(text, object.bounds, fontSize, wrap), [fontSize, object.bounds.h, object.bounds.w, text, wrap]);
  const fittingSize = useMemo(() => fit.fits || complex ? null : findFittingFontSize(text, object.bounds, fontSize, wrap, Math.max(4, Math.min(8, object.size * 0.65))), [complex, fit.fits, fontSize, object.bounds.h, object.bounds.w, object.size, text, wrap]);
  const fitBlocked = !complex && !fit.fits;

  async function importFont(file?: File): Promise<void> {
    if (!file) return;
    setFontBytes(new Uint8Array(await file.arrayBuffer()));
    setFontName(file.name.replace(/\.[^.]+$/, ""));
  }
  function queue(): void {
    if (unsupported || fitBlocked) return;
    const source: NativeTextEdit["fontSource"] = complex ? "annotation-fallback" : cjk ? (fontBytes ? "imported-cjk" : "built-in-cjk") : "built-in";
    onQueue({
      id: queued?.id ?? crypto.randomUUID(),
      kind: "text",
      objectId: object.id,
      pageNumber: object.pageNumber,
      originalText: object.text,
      text,
      bounds: object.bounds,
      fontFamily,
      fontSize: Math.max(1, fontSize),
      color,
      backgroundColor: background,
      align,
      mode: complex ? "overlay" : "replace",
      wrap,
      fontSource: source,
      fontName: fontName || undefined,
      fontBytes,
      fontLanguage: language,
      writingMode: object.writingMode,
      fontWeight: object.weight,
      fontStyle: object.style
    });
  }

  return <section className="property-section property-stack">
    <h3>{paragraph ? "Paragraph" : "Text"}</h3>
    {paragraph ? <dl className="native-object-facts"><dt>Source lines</dt><dd>{object.lineCount}</dd><dt>Detected font</dt><dd>{object.fontName || object.family}</dd><dt>Original size</dt><dd>{Number(object.size.toFixed(1))} pt</dd><dt>Line spacing</dt><dd>{object.lineHeight ? `${Number(object.lineHeight.toFixed(1))} pt` : "Detected"}</dd><dt>Direction</dt><dd>{object.direction ?? "ltr"}</dd></dl> : null}
    <label className="property-field"><span>Content</span><textarea disabled={unsupported} rows={Math.min(14, Math.max(6, (object.lineCount ?? 1) + 2))} value={text} onChange={(event) => setText(event.target.value)} /></label>
    <div className="property-grid-two"><label className="property-field"><span>Font</span><select disabled={cjk || complex || unsupported} value={fontFamily} onChange={(event) => setFontFamily(event.target.value as NativeTextEdit["fontFamily"])}><option value="Helvetica">Helvetica</option><option value="Times-Roman">Times</option><option value="Courier">Courier</option></select></label><NumberInput label="Size" value={fontSize} min={1} max={200} step={0.5} onChange={setFontSize} /></div>
    {cjk ? <><p className="property-note">Built-in {language} CID font is available for static CJK replacement. You may optionally supply a compatible OpenType/TrueType font.</p><label className="button button--secondary button--small">{fontName ? `Font: ${fontName}` : "Import CJK font"}<input accept=".otf,.ttf,.ttc,font/otf,font/ttf" hidden type="file" onChange={(event) => void importFont(event.target.files?.[0])} /></label></> : null}
    {complex ? <div className="warning-banner"><strong>Appearance-only edit</strong><span>Complex shaping/RTL is not reconstructed statically. The replacement will be added as a visual text layer because this script cannot be safely rebuilt as original PDF text.</span></div> : null}
    <div className="property-grid-two"><ColorInput label="Text" value={color} onChange={setColor} /><ColorInput label="Background" value={background} onChange={setBackground} /></div>
    <label className="property-field"><span>Alignment</span><select disabled={unsupported} value={align} onChange={(event) => setAlign(event.target.value as NativeTextEdit["align"])}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
    <label className="property-toggle"><input checked={wrap} disabled={unsupported} type="checkbox" onChange={(event) => setWrap(event.target.checked)} />{paragraph ? "Reflow paragraph inside detected box" : "Wrap inside existing box"}</label>
    {!complex ? fit.fits ? <p className="property-note">Complete text fits: {fit.lineCount} reflowed line{fit.lineCount === 1 ? "" : "s"} · capacity {fit.maxLines} at {Number(fontSize.toFixed(1))} pt. Export will not silently truncate this edit.</p> : <div className="warning-banner"><strong>Paragraph does not fit</strong><span>{fit.widthOverflow ? "The unwrapped text is wider than the detected box." : `${fit.lineCount} reflowed lines need more space than the ${fit.maxLines} lines available at this font size.`} Lower the font size or shorten the text before applying the change.</span>{fittingSize ? <button className="button button--secondary button--small" onClick={() => setFontSize(fittingSize)} type="button">Fit at {Number(fittingSize.toFixed(2))} pt</button> : null}</div> : null}
    <button className="button" disabled={unsupported || fitBlocked || !text.trim()} onClick={queue} type="button">{queued ? `Update ${paragraph ? "paragraph" : "text"} change` : `Apply ${paragraph ? "paragraph" : "text"} change`}</button>
  </section>;
}

function ImageEditor({ object, queued, onQueue }: { object: NativeImageObject; queued?: NativeImageEdit; onQueue: (edit: NativeImageEdit) => void }) {
  const [bytes, setBytes] = useState<Uint8Array | undefined>(queued?.bytes);
  const [mimeType, setMimeType] = useState(queued?.mimeType ?? "image/png");
  const [fit, setFit] = useState<NativeImageEdit["fit"]>(queued?.fit ?? "contain");
  const [removeUnderlying, setRemoveUnderlying] = useState(queued?.removeUnderlying ?? true);
  const [bounds, setBounds] = useState(queued?.bounds ?? object.bounds);
  useEffect(() => { setBytes(queued?.bytes); setMimeType(queued?.mimeType ?? "image/png"); setFit(queued?.fit ?? "contain"); setRemoveUnderlying(queued?.removeUnderlying ?? true); setBounds(queued?.bounds ?? object.bounds); }, [object.id]);
  async function choose(file?: File): Promise<void> { if (!file) return; setBytes(new Uint8Array(await file.arrayBuffer())); setMimeType(file.type || "image/png"); }
  return <section className="property-section property-stack"><h3>Image replacement</h3><label className="button button--secondary">{bytes ? "Choose different image" : "Choose replacement image"}<input accept="image/png,image/jpeg,image/webp" hidden type="file" onChange={(event) => void choose(event.target.files?.[0])} /></label><label className="property-field"><span>Fit</span><select value={fit} onChange={(event) => setFit(event.target.value as NativeImageEdit["fit"])}><option value="contain">Contain</option><option value="cover">Cover + crop</option><option value="stretch">Stretch</option></select></label><GeometryEditor bounds={bounds} onChange={setBounds} /><label className="property-toggle"><input checked={removeUnderlying} type="checkbox" onChange={(event) => setRemoveUnderlying(event.target.checked)} />Permanently remove content under replacement region</label><button className="button" disabled={!bytes} onClick={() => bytes && onQueue({ id: queued?.id ?? crypto.randomUUID(), kind: "image", objectId: object.id, pageNumber: object.pageNumber, bounds, sourceBounds: object.bounds, bytes, mimeType, removeUnderlying, fit })} type="button">{queued ? "Update image change" : "Apply image change"}</button></section>;
}

function VectorEditor({ object, queued, onQueue }: { object: NativeVectorObject; queued?: NativeVectorEdit; onQueue: (edit: NativeVectorEdit) => void }) {
  const [action, setAction] = useState<NativeVectorEdit["action"]>(queued?.action ?? "restyle");
  const [fill, setFill] = useState(queued?.fillColor ?? object.fillColor ?? "#ffffff");
  const [stroke, setStroke] = useState(queued?.strokeColor ?? object.strokeColor ?? "#333333");
  const [lineWidth, setLineWidth] = useState(queued?.lineWidth ?? object.lineWidth);
  const [alpha, setAlpha] = useState(queued?.alpha ?? object.alpha);
  const [dx, setDx] = useState(queued?.dx ?? 0);
  const [dy, setDy] = useState(queued?.dy ?? 0);
  const [scaleX, setScaleX] = useState(queued?.scaleX ?? 1);
  const [scaleY, setScaleY] = useState(queued?.scaleY ?? 1);
  useEffect(() => { setAction(queued?.action ?? "restyle"); setFill(queued?.fillColor ?? object.fillColor ?? "#ffffff"); setStroke(queued?.strokeColor ?? object.strokeColor ?? "#333333"); setLineWidth(queued?.lineWidth ?? object.lineWidth); setAlpha(queued?.alpha ?? object.alpha); setDx(queued?.dx ?? 0); setDy(queued?.dy ?? 0); setScaleX(queued?.scaleX ?? 1); setScaleY(queued?.scaleY ?? 1); }, [object.id]);
  return <section className="property-section property-stack"><h3>Vector path</h3><p className="property-note">{object.commands.length} detected commands · {object.paint}</p><label className="property-field"><span>Operation</span><select value={action} onChange={(event) => setAction(event.target.value as NativeVectorEdit["action"])}><option value="restyle">Restyle</option><option value="transform">Transform</option><option value="delete">Delete region</option></select></label>{action !== "delete" ? <><div className="property-grid-two"><ColorInput label="Fill" value={fill} onChange={setFill} /><ColorInput label="Stroke" value={stroke} onChange={setStroke} /></div><div className="property-grid-two"><NumberInput label="Stroke width" value={lineWidth} min={0.1} max={50} step={0.1} onChange={setLineWidth} /><NumberInput label="Opacity" value={alpha} min={0} max={1} step={0.05} onChange={setAlpha} /></div><div className="property-grid-two"><NumberInput label="Move X" value={dx} step={1} onChange={setDx} /><NumberInput label="Move Y" value={dy} step={1} onChange={setDy} /><NumberInput label="Scale X" value={scaleX} min={0.05} max={20} step={0.05} onChange={setScaleX} /><NumberInput label="Scale Y" value={scaleY} min={0.05} max={20} step={0.05} onChange={setScaleY} /></div></> : <div className="warning-banner"><strong>Permanent region deletion</strong><span>The detected path region will be redacted in the derived output.</span></div>}<button className={action === "delete" ? "button button--danger" : "button"} onClick={() => onQueue({ id: queued?.id ?? crypto.randomUUID(), kind: "vector", objectId: object.id, pageNumber: object.pageNumber, bounds: object.bounds, commands: object.commands, action, fillColor: action === "delete" ? undefined : fill, strokeColor: action === "delete" ? undefined : stroke, lineWidth, alpha, dx, dy, scaleX, scaleY })} type="button">{queued ? "Update vector change" : "Apply vector change"}</button></section>;
}

function TableEditor({ object, queued, onQueue }: { object: NativeTableObject; queued: NativeTableCellEdit[]; onQueue: (edits: NativeEdit[]) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const cell of object.cells) next[cell.id] = queued.find((edit) => edit.cellId === cell.id)?.text ?? cell.text;
    setValues(next);
  }, [object.id, queued.length]);
  const changed = object.cells.filter((cell) => (values[cell.id] ?? cell.text) !== cell.text);
  return <section className="property-section property-stack"><h3>Table cells</h3><p className="property-note">{object.rows} rows × {object.columns} columns</p><div className="native-table-editor" style={{ gridTemplateColumns: `repeat(${Math.max(1, object.columns)}, minmax(80px, 1fr))` }}>{Array.from({ length: object.rows }, (_, row) => Array.from({ length: object.columns }, (_, column) => { const cell = object.cells.find((item) => item.row === row && item.column === column); return cell ? <label key={cell.id}><small>R{row + 1} C{column + 1}</small><textarea rows={2} value={values[cell.id] ?? cell.text} onChange={(event) => setValues((current) => ({ ...current, [cell.id]: event.target.value }))} /></label> : <span className="native-table-missing" key={`${row}-${column}`}>—</span>; }))}</div>{changed.some((cell) => { const script = detectScript(values[cell.id] ?? cell.text); return script === "complex" || script === "unknown"; }) ? <div className="warning-banner"><strong>Complex-script table edit blocked</strong><span>Static table-cell reconstruction currently supports Latin and CJK. This table editor currently supports Latin and CJK text only. Complex-script cells are left unchanged to avoid damaging text.</span></div> : null}<button className="button" disabled={!changed.length || changed.some((cell) => { const script = detectScript(values[cell.id] ?? cell.text); return script === "complex" || script === "unknown"; })} onClick={() => onQueue(changed.map<NativeTableCellEdit>((cell) => { const cellText = values[cell.id] ?? cell.text; const language = cjkLanguageForScript(detectScript(cellText)); return { id: queued.find((edit) => edit.cellId === cell.id)?.id ?? crypto.randomUUID(), kind: "table-cell", objectId: object.id, cellId: cell.id, pageNumber: object.pageNumber, bounds: cell.bounds, originalText: cell.text, text: cellText, fontSize: cell.fontSize ?? 10, fontFamily: language ?? "Helvetica", fontSource: language ? "built-in-cjk" : "built-in", fontLanguage: language }; }))} type="button">Apply {changed.length} changed cell{changed.length === 1 ? "" : "s"}</button></section>;
}

function FormEditor({ object, queued, onQueue }: { object: NativeFormObject; queued?: Extract<NativeEdit, { kind: "form" }>; onQueue: (edit: Extract<NativeEdit, { kind: "form" }>) => void }) {
  const [value, setValue] = useState(queued?.value ?? object.value);
  useEffect(() => setValue(queued?.value ?? object.value), [object.id]);
  const disabled = object.editability !== "field-value";
  const checkbox = object.fieldType === "checkbox" || object.fieldType === "radiobutton";
  return <section className="property-section property-stack"><h3>{object.label || object.name || "Form field"}</h3><dl className="native-object-facts"><dt>Type</dt><dd>{object.fieldType}</dd><dt>Name</dt><dd>{object.name || "Unnamed"}</dd><dt>State</dt><dd>{object.readOnly ? "Read only" : object.signed ? "Signed" : "Editable"}</dd></dl>{object.options.length ? <label className="property-field"><span>Value</span><select disabled={disabled} value={value} onChange={(event) => setValue(event.target.value)}>{object.options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label> : checkbox ? <label className="property-toggle"><input checked={!["", "off", "false", "0", "no"].includes(value.toLowerCase())} disabled={disabled} type="checkbox" onChange={(event) => setValue(event.target.checked ? "Yes" : "Off")} />Checked</label> : <label className="property-field"><span>Value</span>{object.multiline ? <textarea disabled={disabled} rows={5} value={value} onChange={(event) => setValue(event.target.value)} /> : <input disabled={disabled} type={object.password ? "password" : "text"} value={value} onChange={(event) => setValue(event.target.value)} />}</label>}<button className="button" disabled={disabled || value === object.value} onClick={() => onQueue({ id: queued?.id ?? crypto.randomUUID(), kind: "form", objectId: object.id, pageNumber: object.pageNumber, widgetIndex: object.widgetIndex, name: object.name, fieldType: object.fieldType, originalValue: object.value, value })} type="button">{queued ? "Update field change" : "Apply field change"}</button></section>;
}

function GeometryEditor({ bounds, onChange }: { bounds: NativeImageEdit["bounds"]; onChange: (bounds: NativeImageEdit["bounds"]) => void }) {
  return <div className="property-grid-two"><NumberInput label="X" value={bounds.x} step={1} onChange={(x) => onChange({ ...bounds, x })} /><NumberInput label="Y" value={bounds.y} step={1} onChange={(y) => onChange({ ...bounds, y })} /><NumberInput label="Width" value={bounds.w} min={1} step={1} onChange={(w) => onChange({ ...bounds, w })} /><NumberInput label="Height" value={bounds.h} min={1} step={1} onChange={(h) => onChange({ ...bounds, h })} /></div>;
}

function NumberInput({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <label className="property-field"><span>{label}</span><input type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="property-color"><span>{label}</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(event) => onChange(event.target.value)} /><code>{value}</code></label>;
}

function familyForObject(object: NativeTextObject): NativeTextEdit["fontFamily"] {
  if (object.family === "serif") return "Times-Roman";
  if (object.family === "monospace") return "Courier";
  return "Helvetica";
}
