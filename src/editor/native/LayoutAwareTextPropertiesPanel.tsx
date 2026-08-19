import { useEffect, useMemo, useState } from "react";
import { cjkLanguageForScript } from "../../native/nativeModel";
import { planTextReflow } from "../../native/layoutReflow";
import { buildPreservedEditRuns, editableFamilyForSource } from "../../native/textStyle";
import { evaluateTextFit, findFittingFontSize } from "../../native/textFit";
import type {
  NativeEdit,
  NativePageTree,
  NativeTextEdit,
  NativeTextObject
} from "../../types/nativeEditor";

interface Props {
  object: NativeTextObject;
  page: NativePageTree;
  queuedEdits: NativeEdit[];
  onQueue: (edits: NativeEdit[]) => void;
  onRemove: (objectId: string) => void;
}

function colorValue(value?: string): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value as string : "#111111";
}

function textEditForFollower(source: NativeTextObject, bounds: NativeTextObject["bounds"], parentId: string): NativeTextEdit {
  const language = cjkLanguageForScript(source.script);
  const family = editableFamilyForSource(source.family, source.script);
  return {
    id: `p2-reflow:${parentId}:${source.id}`,
    kind: "text",
    objectId: source.id,
    pageNumber: source.pageNumber,
    originalText: source.text,
    text: source.text,
    sourceBounds: source.bounds,
    bounds,
    fontFamily: family,
    fontSize: Math.max(1, source.size),
    color: colorValue(source.color),
    backgroundColor: "transparent",
    align: source.align ?? "left",
    mode: "replace",
    wrap: true,
    fontSource: language ? "built-in-cjk" : "built-in",
    fontLanguage: language,
    writingMode: source.writingMode,
    fontWeight: source.weight,
    fontStyle: source.style,
    lineHeight: source.lineHeight,
    layoutMode: "expand-flow",
    styleRuns: buildPreservedEditRuns(source, source.text, colorValue(source.color)),
    preserveSourceStyle: true,
    reflowFollower: true
  };
}

export function LayoutAwareTextPropertiesPanel({ object, page, queuedEdits, onQueue, onRemove }: Props) {
  const queued = queuedEdits.find((edit): edit is NativeTextEdit => edit.kind === "text" && edit.objectId === object.id && !edit.reflowFollower);
  const language = cjkLanguageForScript(object.script);
  const [text, setText] = useState(queued?.text ?? object.text);
  const [fontSize, setFontSize] = useState(queued?.fontSize ?? object.size);
  const [fontFamily, setFontFamily] = useState<NativeTextEdit["fontFamily"]>(queued?.fontFamily ?? editableFamilyForSource(object.family, object.script));
  const [color, setColor] = useState(queued?.color ?? colorValue(object.color));
  const [background, setBackground] = useState(queued?.backgroundColor ?? "#ffffff");
  const [align, setAlign] = useState<NativeTextEdit["align"]>(queued?.align ?? object.align ?? "left");
  const [wrap, setWrap] = useState(queued?.wrap ?? true);
  const [layoutAware, setLayoutAware] = useState((queued?.layoutMode ?? (object.flow ? "expand-flow" : "fixed-box")) === "expand-flow");
  const [preserveStyle, setPreserveStyle] = useState(queued?.preserveSourceStyle ?? (object.runs?.length ?? 0) > 1);
  const [fontBytes, setFontBytes] = useState<Uint8Array | undefined>(queued?.fontBytes);
  const [fontName, setFontName] = useState(queued?.fontName ?? "");

  useEffect(() => {
    setText(queued?.text ?? object.text);
    setFontSize(queued?.fontSize ?? object.size);
    setFontFamily(queued?.fontFamily ?? editableFamilyForSource(object.family, object.script));
    setColor(queued?.color ?? colorValue(object.color));
    setBackground(queued?.backgroundColor ?? "#ffffff");
    setAlign(queued?.align ?? object.align ?? "left");
    setWrap(queued?.wrap ?? true);
    setLayoutAware((queued?.layoutMode ?? (object.flow ? "expand-flow" : "fixed-box")) === "expand-flow");
    setPreserveStyle(queued?.preserveSourceStyle ?? (object.runs?.length ?? 0) > 1);
    setFontBytes(queued?.fontBytes);
    setFontName(queued?.fontName ?? "");
  }, [object.id]);

  const unsupported = object.editability === "unsupported";
  const complex = object.editability === "overlay-only";
  const paragraph = Boolean(object.paragraph);
  const fit = useMemo(() => evaluateTextFit(text, object.bounds, fontSize, wrap, object.lineHeight), [fontSize, object.bounds.h, object.bounds.w, object.lineHeight, text, wrap]);
  const targetHeight = text === object.text ? object.bounds.h : fit.requiredHeight;
  const plan = useMemo(() => planTextReflow(page, object.id, targetHeight), [object.id, page, targetHeight]);
  const manuallyEditedFollower = useMemo(() => plan.shifts
    .map((shift) => queuedEdits.find((edit) => edit.objectId === shift.objectId && !(edit.kind === "text" && edit.reflowFollower)))
    .find(Boolean), [plan.shifts, queuedEdits]);
  const flowBlocked = layoutAware && (!object.flow || !wrap || fit.widthOverflow || !plan.ok || Boolean(manuallyEditedFollower));
  const fixedBlocked = !layoutAware && !complex && !fit.fits;
  const queueBlocked = unsupported || flowBlocked || fixedBlocked;
  const fittingSize = useMemo(() => fit.fits || complex ? null : findFittingFontSize(text, object.bounds, fontSize, wrap, Math.max(4, Math.min(8, object.size * 0.65))), [complex, fit.fits, fontSize, object.bounds.h, object.bounds.w, object.size, text, wrap]);
  const sourceRunCount = object.runs?.length ?? 1;
  const movedCount = layoutAware && plan.ok ? plan.shifts.length : 0;

  async function importFont(file?: File): Promise<void> {
    if (!file) return;
    setFontBytes(new Uint8Array(await file.arrayBuffer()));
    setFontName(file.name.replace(/\.[^.]+$/, ""));
  }

  function queue(): void {
    if (queueBlocked || !text.trim()) return;
    const source: NativeTextEdit["fontSource"] = complex
      ? "annotation-fallback"
      : language
        ? (fontBytes ? "imported-cjk" : "built-in-cjk")
        : fontBytes ? "imported-latin" : "built-in";
    const useFlow = layoutAware && plan.ok && !complex;
    const primary: NativeTextEdit = {
      id: queued?.id ?? crypto.randomUUID(),
      kind: "text",
      objectId: object.id,
      pageNumber: object.pageNumber,
      originalText: object.text,
      text,
      sourceBounds: object.bounds,
      bounds: useFlow ? plan.primaryBounds : object.bounds,
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
      fontStyle: object.style,
      lineHeight: object.lineHeight,
      layoutMode: useFlow ? "expand-flow" : "fixed-box",
      styleRuns: preserveStyle && !complex ? buildPreservedEditRuns(object, text, color) : undefined,
      preserveSourceStyle: preserveStyle && !complex
    };
    const followers = useFlow ? plan.shifts.flatMap((shift) => {
      const sourceObject = page.objects.find((candidate): candidate is NativeTextObject => candidate.type === "text" && candidate.id === shift.objectId);
      return sourceObject ? [textEditForFollower(sourceObject, shift.bounds, object.id)] : [];
    }) : [];
    onQueue([primary, ...followers]);
  }

  const support = object.capability.level === "safe-reconstruction" ? "Editable with reconstruction" : object.capability.level === "appearance-only" ? "Limited editing" : "Editing unavailable";

  return <aside className="editor-properties native-unified-properties p2-text-properties">
    <section className="property-section native-capability-card">
      <div className="native-capability-card__heading"><div><p className="eyebrow">Existing PDF content · P2</p><h2>{paragraph ? "Layout-aware paragraph" : "Text"}</h2></div><span className={`capability-chip capability-chip--${object.capability.level}`}>{support}</span></div>
      <p>{object.reason}</p>
      <dl className="native-object-facts">
        <dt>Visual lines</dt><dd>{object.lineCount ?? 1}</dd>
        <dt>Source spans</dt><dd>{object.sourceSpanCount ?? sourceRunCount}</dd>
        <dt>Detected font</dt><dd>{object.fontName || object.family}</dd>
        <dt>Original size</dt><dd>{Number(object.size.toFixed(1))} pt</dd>
        <dt>Line spacing</dt><dd>{object.lineHeight ? `${Number(object.lineHeight.toFixed(1))} pt` : "Detected"}</dd>
        <dt>Text flow</dt><dd>{object.flow ? `Same-column flow · item ${object.flow.index + 1}` : "Fixed region"}</dd>
      </dl>
      {queued ? <div className="native-queued-chip"><span>Pending text change</span><button onClick={() => onRemove(object.id)} type="button">Discard</button></div> : null}
    </section>

    <section className="property-section property-stack">
      <h3>Content & layout</h3>
      <label className="property-field"><span>Content</span><textarea disabled={unsupported} rows={Math.min(16, Math.max(7, (object.lineCount ?? 1) + 3))} value={text} onChange={(event) => setText(event.target.value)} /></label>

      <label className="property-toggle"><input checked={layoutAware} disabled={!object.flow || complex || unsupported} type="checkbox" onChange={(event) => setLayoutAware(event.target.checked)} />Layout-aware reflow</label>
      {object.flow ? <p className="property-note">When enabled, this paragraph may grow or shrink and later safe text blocks in the same detected column move by the exact height delta. Other columns and page graphics are never moved automatically.</p> : <p className="property-note">This block is not in a safe same-column flow, so P2 keeps it inside its original region.</p>}

      {layoutAware && !complex ? flowBlocked ? <div className="warning-banner"><strong>Layout reflow blocked</strong><span>{!wrap ? "Enable wrapping before expanding a paragraph flow." : fit.widthOverflow ? "The replacement is too wide and vertical expansion cannot solve the overflow." : manuallyEditedFollower ? "A following paragraph already has its own manual edit. Apply or discard that edit before moving the flow." : plan.blockers[0] ?? "This paragraph cannot be propagated safely."}</span></div> : <div className="result-card"><strong>{Math.abs(plan.deltaY) < 0.5 ? "Layout remains stable" : plan.deltaY > 0 ? `Paragraph expands ${Number(plan.deltaY.toFixed(1))} pt` : `Paragraph contracts ${Number(Math.abs(plan.deltaY).toFixed(1))} pt`}</strong><span>{movedCount ? `${movedCount} following paragraph${movedCount === 1 ? "" : "s"} will move with the detected column flow.` : "No following text block needs to move."}</span></div> : null}

      {!layoutAware && !complex ? fit.fits ? <p className="property-note">Complete text fits: {fit.lineCount} reflowed line{fit.lineCount === 1 ? "" : "s"} · fixed-box capacity {fit.maxLines}. Export will not silently truncate this edit.</p> : <div className="warning-banner"><strong>Text does not fit the fixed box</strong><span>{fit.widthOverflow ? "The text is wider than the detected box." : `${fit.lineCount} lines require ${Number(fit.requiredHeight.toFixed(1))} pt but the source box provides ${Number(object.bounds.h.toFixed(1))} pt.`}</span>{fittingSize ? <button className="button button--secondary button--small" onClick={() => setFontSize(fittingSize)} type="button">Fit at {Number(fittingSize.toFixed(2))} pt</button> : null}</div> : null}
    </section>

    <section className="property-section property-stack">
      <h3>Font fidelity</h3>
      {sourceRunCount > 1 ? <label className="property-toggle"><input checked={preserveStyle} disabled={complex || unsupported} type="checkbox" onChange={(event) => setPreserveStyle(event.target.checked)} />Preserve source formatting runs ({sourceRunCount})</label> : <p className="property-note">One source font/style run was detected for this paragraph.</p>}
      {preserveStyle && sourceRunCount > 1 ? <p className="property-note">Unchanged prefix/suffix text retains its detected font, size, bold/italic state, and extracted color when available. Newly typed text inherits the nearest source run instead of inventing arbitrary styling.</p> : null}
      <div className="property-grid-two"><label className="property-field"><span>Fallback font</span><select disabled={Boolean(language) || complex || unsupported || preserveStyle} value={fontFamily} onChange={(event) => setFontFamily(event.target.value as NativeTextEdit["fontFamily"])}><option value="Helvetica">Helvetica</option><option value="Times-Roman">Times</option><option value="Courier">Courier</option></select></label><label className="property-field"><span>Size</span><input min="1" max="200" step="0.5" type="number" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label></div>
      {!complex ? <label className="button button--secondary button--small">{fontName ? `Matching font: ${fontName}` : "Import matching font"}<input accept=".otf,.ttf,.ttc,font/otf,font/ttf" hidden type="file" onChange={(event) => void importFont(event.target.files?.[0])} /></label> : null}
      {fontBytes ? <button className="button button--ghost button--small" onClick={() => { setFontBytes(undefined); setFontName(""); }} type="button">Use built-in reconstruction font</button> : null}
      <p className="property-note">PDF Studio does not claim byte-for-byte reuse of an embedded source font unless compatible font bytes are explicitly available. Imported font bytes remain local to this project.</p>
      <div className="property-grid-two"><label className="property-field"><span>Text</span><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><label className="property-field"><span>Background</span><input type="color" value={background} onChange={(event) => setBackground(event.target.value)} /></label></div>
      <label className="property-field"><span>Alignment</span><select disabled={unsupported} value={align} onChange={(event) => setAlign(event.target.value as NativeTextEdit["align"])}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      <label className="property-toggle"><input checked={wrap} disabled={unsupported} type="checkbox" onChange={(event) => setWrap(event.target.checked)} />Reflow text into measured lines</label>
      {complex ? <div className="warning-banner"><strong>Appearance-only edit</strong><span>Complex shaping and bidirectional layout are still not reconstructed statically. P2 does not pretend otherwise; this replacement remains a visual text layer.</span></div> : null}
    </section>

    <section className="property-section property-stack">
      <button className="button" disabled={queueBlocked || !text.trim()} onClick={queue} type="button">{queued ? "Update layout-aware text change" : "Apply layout-aware text change"}</button>
    </section>
  </aside>;
}
