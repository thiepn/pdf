import { useEffect, useMemo, useState } from "react";
import { cjkLanguageForScript } from "../../native/nativeModel";
import { planTextReflow } from "../../native/layoutReflow";
import { findNativeReflowQueueConflict } from "../../native/nativeEditQueue";
import { buildPreservedEditRuns, editableFamilyForSource } from "../../native/textStyle";
import { evaluateStyledTextFit, evaluateTextFit, findFittingFontSize, fitsWithinSourceBaseline } from "../../native/textFit";
import { firstUnencodableWinAnsiCharacter } from "../../native/textEncoding";
import { nativeTextSourceLines, nativeTextSourceRects } from "../../native/textSourceGeometry";
import { MAX_IMPORTED_FONT_BYTES, validateImportedFont } from "../../native/fontValidation";
import { complexScriptReplacementIssue } from "../../native/complexScript";
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
    sourceRects: nativeTextSourceRects(source),
    sourceLines: nativeTextSourceLines(source),
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
  const shaped = object.editability === "shaped-fixed-box";
  const sourceFamily = editableFamilyForSource(object.family, object.script);
  const [text, setText] = useState(queued?.text ?? object.text);
  const [fontSize, setFontSize] = useState(queued?.fontSize ?? object.size);
  const [fontFamily, setFontFamily] = useState<NativeTextEdit["fontFamily"]>(queued?.fontFamily ?? sourceFamily);
  const [color, setColor] = useState(queued?.color ?? colorValue(object.color));
  const queuedBackground = queued?.backgroundColor ?? "transparent";
  const [background, setBackground] = useState(queuedBackground === "transparent" ? "#ffffff" : queuedBackground);
  const [fillBackground, setFillBackground] = useState(queuedBackground !== "transparent");
  const [align, setAlign] = useState<NativeTextEdit["align"]>(queued?.align ?? object.align ?? (shaped ? "right" : "left"));
  const [wrap, setWrap] = useState(queued?.wrap ?? true);
  const [layoutAware, setLayoutAware] = useState(!shaped && (queued?.layoutMode ?? (object.flow ? "expand-flow" : "fixed-box")) === "expand-flow");
  const [preserveStyle, setPreserveStyle] = useState(!shaped && (queued?.preserveSourceStyle ?? (object.runs?.length ?? 0) > 1));
  const [fontBytes, setFontBytes] = useState<Uint8Array | undefined>(queued?.fontBytes);
  const [fontName, setFontName] = useState(queued?.fontName ?? "");
  const [fontValidation, setFontValidation] = useState<{ phase: "idle" | "checking" | "ready" | "error"; message?: string; validatedText?: string; validatedFontName?: string }>({ phase: queued?.fontBytes ? "ready" : "idle" });

  useEffect(() => {
    setText(queued?.text ?? object.text);
    setFontSize(queued?.fontSize ?? object.size);
    setFontFamily(queued?.fontFamily ?? editableFamilyForSource(object.family, object.script));
    setColor(queued?.color ?? colorValue(object.color));
    const nextBackground = queued?.backgroundColor ?? "transparent";
    setBackground(nextBackground === "transparent" ? "#ffffff" : nextBackground);
    setFillBackground(nextBackground !== "transparent");
    setAlign(queued?.align ?? object.align ?? (shaped ? "right" : "left"));
    setWrap(queued?.wrap ?? true);
    setLayoutAware(!shaped && (queued?.layoutMode ?? (object.flow ? "expand-flow" : "fixed-box")) === "expand-flow");
    setPreserveStyle(!shaped && (queued?.preserveSourceStyle ?? (object.runs?.length ?? 0) > 1));
    setFontBytes(queued?.fontBytes);
    setFontName(queued?.fontName ?? "");
    setFontValidation({ phase: queued?.fontBytes ? "ready" : "idle" });
  }, [object.id, queued, shaped]);

  useEffect(() => {
    if (!fontBytes?.byteLength) return;
    if (fontValidation.phase === "ready" && fontValidation.validatedText === text && fontValidation.validatedFontName === fontName) return;
    const controller = new AbortController();
    setFontValidation({ phase: "checking", message: "Checking this font against the current text…" });
    const timer = window.setTimeout(() => {
      void validateImportedFont(fontBytes, fontName || "Imported Font", text, controller.signal).then(
        (result) => {
          if (controller.signal.aborted) return;
          if (result.missingCharacters.length) {
            const shown = result.missingCharacters.map((character) => `“${character}”`).join(", ");
            setFontValidation({
              phase: "error",
              message: `This font no longer covers every character in the current text. Missing: ${shown}.`,
              validatedText: text,
              validatedFontName: fontName
            });
            return;
          }
          setFontValidation({
            phase: "ready",
            message: "Font checked with the PDF engine and ready to use.",
            validatedText: text,
            validatedFontName: fontName
          });
        },
        (reason) => {
          if (controller.signal.aborted || (reason instanceof DOMException && reason.name === "AbortError")) return;
          setFontValidation({
            phase: "error",
            message: reason instanceof Error ? reason.message : String(reason),
            validatedText: text,
            validatedFontName: fontName
          });
        }
      );
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fontBytes, fontName, text]);

  const unsupported = object.editability === "unsupported";
  const complex = object.editability === "overlay-only";
  const paragraph = Boolean(object.paragraph);
  const preservedRuns = useMemo(() => preserveStyle && !complex && !shaped ? buildPreservedEditRuns(object, text, color) : undefined, [color, complex, object, preserveStyle, shaped, text]);
  const fit = useMemo(
    () => preservedRuns?.length
      ? evaluateStyledTextFit(preservedRuns, object.bounds, wrap, object.lineHeight)
      : evaluateTextFit(text, object.bounds, fontSize, wrap, object.lineHeight),
    [fontSize, object.bounds.h, object.bounds.w, object.lineHeight, preservedRuns, text, wrap]
  );
  const sourceFit = useMemo(() => {
    if (complex || shaped) return evaluateTextFit(object.text, object.bounds, object.size, wrap, object.lineHeight);
    const sourceRuns = preserveStyle ? buildPreservedEditRuns(object, object.text, color) : undefined;
    return sourceRuns?.length
      ? evaluateStyledTextFit(sourceRuns, object.bounds, wrap, object.lineHeight)
      : evaluateTextFit(object.text, object.bounds, object.size, wrap, object.lineHeight);
  }, [color, complex, object, preserveStyle, shaped, wrap]);
  const geometryChanged = text !== object.text || (!preserveStyle && (Math.abs(fontSize - object.size) > 0.01 || fontFamily !== sourceFamily));
  const fitsSourceBaseline = fitsWithinSourceBaseline(fit, sourceFit);
  const expansionBaselineHeight = Math.max(object.bounds.h, sourceFit.requiredHeight);
  const expansionRequired = geometryChanged && !complex && !shaped && fit.requiredHeight > expansionBaselineHeight + 0.5;
  const targetHeight = expansionRequired ? object.bounds.h + (fit.requiredHeight - expansionBaselineHeight) : object.bounds.h;
  const plan = useMemo(() => planTextReflow(page, object.id, targetHeight), [object.id, page, targetHeight]);
  const queuedFlowConflict = useMemo(() => findNativeReflowQueueConflict(
    queuedEdits,
    object.id,
    expansionRequired ? plan.shifts.map((shift) => shift.objectId) : []
  ), [expansionRequired, object.id, plan.shifts, queuedEdits]);
  const selectedMovedByOtherReflow = queuedFlowConflict?.objectId === object.id
    && queuedFlowConflict.kind === "text"
    && Boolean(queuedFlowConflict.reflowFollower);
  const flowBlocked = layoutAware && !complex && !shaped && (
    (!fitsSourceBaseline && fit.widthOverflow)
    || (expansionRequired && (!object.flow || !wrap || !plan.ok || Boolean(queuedFlowConflict)))
  );
  const fixedBlocked = !layoutAware && !complex && !shaped && !fitsSourceBaseline;
  const latinEncodingIssue = useMemo(() => !complex && !shaped && !language ? firstUnencodableWinAnsiCharacter(text) : undefined, [complex, language, shaped, text]);
  const shapedTextIssue = useMemo(() => shaped ? complexScriptReplacementIssue(text) : undefined, [shaped, text]);
  const importedFontReady = shaped
    ? Boolean(fontBytes?.byteLength) && fontValidation.phase === "ready" && fontValidation.validatedText === text && fontValidation.validatedFontName === fontName
    : !fontBytes?.byteLength || (fontValidation.phase === "ready" && fontValidation.validatedText === text && fontValidation.validatedFontName === fontName);
  const queueBlocked = unsupported || selectedMovedByOtherReflow || flowBlocked || fixedBlocked || Boolean(latinEncodingIssue) || Boolean(shapedTextIssue) || !importedFontReady;
  const fittingSize = useMemo(() => fitsSourceBaseline || complex || shaped || preserveStyle ? null : findFittingFontSize(text, object.bounds, fontSize, wrap, Math.max(4, Math.min(8, object.size * 0.65))), [complex, fitsSourceBaseline, fontSize, object.bounds.h, object.bounds.w, object.size, preserveStyle, shaped, text, wrap]);
  const sourceRunCount = object.runs?.length ?? 1;
  const movedCount = layoutAware && expansionRequired && plan.ok ? plan.shifts.length : 0;

  async function importFont(file?: File): Promise<void> {
    if (!file) return;
    setFontValidation({ phase: "checking", message: "Checking this font with the PDF engine…" });
    try {
      if (file.size > MAX_IMPORTED_FONT_BYTES) throw new Error("The selected font is larger than the 25 MB import limit.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const name = file.name.replace(/\.[^.]+$/, "") || "Imported Font";
      const result = await validateImportedFont(bytes, name, text);
      if (result.missingCharacters.length) {
        const shown = result.missingCharacters.map((character) => `“${character}”`).join(", ");
        throw new Error(`This font does not contain every character required by the current text. Missing: ${shown}.`);
      }
      setFontBytes(bytes);
      setFontName(name);
      setFontValidation({ phase: "ready", message: "Font checked with the PDF engine and ready to use.", validatedText: text, validatedFontName: name });
    } catch (reason) {
      setFontBytes(undefined);
      setFontName("");
      setFontValidation({ phase: "error", message: reason instanceof Error ? reason.message : String(reason) });
    }
  }

  function queue(): void {
    if (queueBlocked || !text.trim()) return;
    const source: NativeTextEdit["fontSource"] = shaped
      ? "imported-shaped"
      : complex
        ? "annotation-fallback"
        : language
          ? (fontBytes ? "imported-cjk" : "built-in-cjk")
          : fontBytes ? "imported-latin" : "built-in";
    const useFlow = layoutAware && expansionRequired && plan.ok && !complex && !shaped;
    const primary: NativeTextEdit = {
      id: queued?.id ?? crypto.randomUUID(),
      kind: "text",
      objectId: object.id,
      pageNumber: object.pageNumber,
      originalText: object.text,
      text,
      sourceBounds: object.bounds,
      sourceRects: queued?.sourceRects ?? nativeTextSourceRects(object),
      sourceLines: queued?.sourceLines ?? nativeTextSourceLines(object),
      bounds: useFlow ? plan.primaryBounds : object.bounds,
      fontFamily,
      fontSize: Math.max(1, fontSize),
      color,
      backgroundColor: fillBackground ? background : "transparent",
      align,
      mode: complex ? "overlay" : "replace",
      wrap,
      fontSource: source,
      fontName: fontName || undefined,
      fontBytes,
      fontLanguage: language,
      writingMode: object.writingMode,
      direction: queued?.direction ?? object.direction ?? (shaped ? "rtl" : "ltr"),
      fontWeight: object.weight,
      fontStyle: object.style,
      lineHeight: object.lineHeight,
      layoutMode: useFlow ? "expand-flow" : "fixed-box",
      styleRuns: shaped ? undefined : preservedRuns,
      preserveSourceStyle: shaped ? false : Boolean(preservedRuns?.length)
    };
    const followers = useFlow ? plan.shifts.flatMap((shift) => {
      const sourceObject = page.objects.find((candidate): candidate is NativeTextObject => candidate.type === "text" && candidate.id === shift.objectId);
      return sourceObject ? [textEditForFollower(sourceObject, shift.bounds, object.id)] : [];
    }) : [];
    onQueue([primary, ...followers]);
  }

  function queueDelete(): void {
    if (unsupported || complex || selectedMovedByOtherReflow) return;
    onQueue([{
      id: queued?.id ?? crypto.randomUUID(),
      kind: "text",
      objectId: object.id,
      pageNumber: object.pageNumber,
      originalText: object.text,
      text: "",
      sourceBounds: object.bounds,
      sourceRects: queued?.sourceRects ?? nativeTextSourceRects(object),
      sourceLines: queued?.sourceLines ?? nativeTextSourceLines(object),
      bounds: object.bounds,
      fontFamily: sourceFamily,
      fontSize: Math.max(1, object.size),
      color: colorValue(object.color),
      backgroundColor: "transparent",
      align: object.align ?? "left",
      mode: "replace",
      wrap: false,
      fontSource: language ? "built-in-cjk" : "built-in",
      fontLanguage: language,
      writingMode: object.writingMode,
      fontWeight: object.weight,
      fontStyle: object.style,
      lineHeight: object.lineHeight,
      layoutMode: "fixed-box",
      preserveSourceStyle: false
    }]);
  }

  const support = object.capability.level === "safe-reconstruction" ? "Editable with reconstruction" : object.capability.level === "appearance-only" ? "Limited editing" : "Editing unavailable";

  return <aside className="editor-properties native-unified-properties p2-text-properties">
    <section className="property-section native-capability-card">
      <div className="native-capability-card__heading"><div><p className="eyebrow">Existing PDF content</p><h2>{paragraph ? "Layout-aware paragraph" : "Text"}</h2></div><span className={`capability-chip capability-chip--${object.capability.level}`}>{support}</span></div>
      <p>{object.reason}</p>
      <dl className="native-object-facts">
        <dt>Visual lines</dt><dd>{object.lineCount ?? 1}</dd>
        <dt>Source spans</dt><dd>{object.sourceSpanCount ?? sourceRunCount}</dd>
        <dt>Detected font</dt><dd>{object.fontName || object.family}</dd>
        <dt>Original size</dt><dd>{Number(object.size.toFixed(1))} pt</dd>
        <dt>Line spacing</dt><dd>{object.lineHeight ? `${Number(object.lineHeight.toFixed(1))} pt` : "Detected"}</dd>
        <dt>Text flow</dt><dd>{object.flow ? `${object.flow.threadId ? `Region ${(object.flow.regionIndex ?? 0) + 1}/${object.flow.regionCount ?? 1}` : "Single region"} · item ${object.flow.index + 1}` : "Fixed region"}</dd>
      </dl>
      {queued ? <div className="native-queued-chip"><span>Pending text change</span><button onClick={() => onRemove(object.id)} type="button">Discard</button></div> : null}
    </section>

    <section className="property-section property-stack">
      <h3>Content & layout</h3>
      <label className="property-field"><span>Content</span><textarea disabled={unsupported || selectedMovedByOtherReflow} rows={Math.min(16, Math.max(7, (object.lineCount ?? 1) + 3))} value={text} onChange={(event) => setText(event.target.value)} /></label>

      <label className="property-toggle"><input checked={layoutAware} disabled={!object.flow || complex || shaped || unsupported || selectedMovedByOtherReflow} type="checkbox" onChange={(event) => setLayoutAware(event.target.checked)} />Layout-aware reflow</label>
      {object.flow ? <p className="property-note">When enabled, a replacement that needs more vertical space moves later safe text blocks by the exact height delta. For a uniquely detected two-column thread, an overflowing suffix may continue into the adjacent region only when its destination and blockers are deterministic.</p> : <p className="property-note">This block is not in a safe detected flow, so PDF Studio keeps it inside its original region.</p>}

      {selectedMovedByOtherReflow ? <div className="warning-banner"><strong>Paragraph already belongs to another queued reflow</strong><span>This block is being repositioned by an earlier layout-aware edit. Apply or discard that upstream edit before editing this paragraph so both changes are not planned from conflicting geometry.</span></div> : layoutAware && !complex && !shaped ? flowBlocked ? <div className="warning-banner"><strong>Layout reflow blocked</strong><span>{fit.widthOverflow ? "The replacement is too wide and vertical expansion cannot solve the overflow." : !wrap ? "Enable wrapping before expanding a paragraph flow." : queuedFlowConflict ? "A paragraph affected by this flow already has another queued edit. Apply or discard that change before planning a second reflow." : plan.blockers[0] ?? "This paragraph cannot be propagated safely."}</span></div> : <div className="result-card"><strong>{expansionRequired ? `Paragraph expands ${Number(plan.deltaY.toFixed(1))} pt` : "Layout remains stable"}</strong><span>{expansionRequired ? (movedCount ? `${movedCount} following paragraph${movedCount === 1 ? "" : "s"} will move within the bounded detected flow.` : "No following text block needs to move.") : "The replacement fits inside the existing text region, so surrounding content stays in place."}</span></div> : null}

      {!layoutAware && !complex && !shaped && !selectedMovedByOtherReflow ? fitsSourceBaseline ? <p className="property-note">{fit.fits ? `Complete text fits: ${fit.lineCount} reflowed line${fit.lineCount === 1 ? "" : "s"} · fixed-box capacity ${fit.maxLines}.` : "Replacement stays within the source text’s conservative footprint, so the existing region remains safe."} Export will not silently truncate this edit.</p> : <div className="warning-banner"><strong>Text does not fit the fixed box</strong><span>{fit.widthOverflow ? "The text is wider than the source text baseline for this region." : `${fit.lineCount} lines require ${Number(fit.requiredHeight.toFixed(1))} pt, exceeding the source text baseline of ${Number(sourceFit.requiredHeight.toFixed(1))} pt.`}</span>{fittingSize ? <button className="button button--secondary button--small" onClick={() => setFontSize(fittingSize)} type="button">Fit at {Number(fittingSize.toFixed(2))} pt</button> : null}</div> : null}
      {shapedTextIssue ? <div className="warning-banner"><strong>Arabic shaping path blocked</strong><span>{shapedTextIssue}</span></div> : null}
      {latinEncodingIssue ? <div className="warning-banner"><strong>Character cannot be exported with this Latin reconstruction path</strong><span>“{latinEncodingIssue}” is outside the qualified Windows-1252 character set used by the current Latin PDF writer. Change that character or use a supported script-specific editing path. PDF Studio blocks the edit now instead of failing during export.</span></div> : null}
    </section>

    <section className="property-section property-stack">
      <h3>Font fidelity</h3>
      {sourceRunCount > 1 ? <label className="property-toggle"><input checked={preserveStyle} disabled={complex || shaped || unsupported || selectedMovedByOtherReflow} type="checkbox" onChange={(event) => setPreserveStyle(event.target.checked)} />Preserve source formatting runs ({sourceRunCount})</label> : <p className="property-note">One source font/style run was detected for this paragraph.</p>}
      {preserveStyle && sourceRunCount > 1 ? <p className="property-note">Unchanged prefix/suffix text retains its detected font, size, bold/italic state, and extracted color when available. Newly typed text inherits the nearest source run instead of inventing arbitrary styling. Turn preservation off to apply one global size or text color.</p> : null}
      <div className="property-grid-two"><label className="property-field"><span>Fallback font</span><select disabled={Boolean(language) || complex || shaped || unsupported || preserveStyle || selectedMovedByOtherReflow} value={fontFamily} onChange={(event) => setFontFamily(event.target.value as NativeTextEdit["fontFamily"])}><option value="Helvetica">Helvetica</option><option value="Times-Roman">Times</option><option value="Courier">Courier</option></select></label><label className="property-field"><span>Size</span><input disabled={preserveStyle || selectedMovedByOtherReflow} min="1" max="200" step="0.5" type="number" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label></div>
      {!complex ? <label className="button button--secondary button--small">{fontValidation.phase === "checking" ? "Checking font…" : fontName ? `Matching font: ${fontName}` : shaped ? "Import Arabic shaping font" : "Import matching font"}<input accept=".otf,.ttf,.ttc,font/otf,font/ttf" disabled={selectedMovedByOtherReflow || fontValidation.phase === "checking"} hidden type="file" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void importFont(file); }} /></label> : null}
      {fontBytes && !shaped ? <button className="button button--ghost button--small" disabled={selectedMovedByOtherReflow} onClick={() => { setFontBytes(undefined); setFontName(""); setFontValidation({ phase: "idle" }); }} type="button">Use built-in reconstruction font</button> : null}
      {fontValidation.phase !== "idle" ? <div aria-live="polite" className={fontValidation.phase === "error" ? "warning-banner" : "property-note"} role={fontValidation.phase === "error" ? "alert" : "status"}>{fontValidation.phase === "error" ? <><strong>Could not use this font</strong><span>{fontValidation.message}</span></> : fontValidation.message}</div> : null}
      <p className="property-note">PDF Studio does not claim byte-for-byte reuse of an embedded source font unless compatible font bytes are explicitly available. Imported fonts are validated with the same MuPDF parser used for export, checked for current-text glyph coverage, and kept local to this project.</p>
      <div className="property-grid-two"><label className="property-field"><span>Text</span><input disabled={preserveStyle || selectedMovedByOtherReflow} type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><label className="property-field"><span>Background</span><input disabled={!fillBackground || selectedMovedByOtherReflow} type="color" value={background} onChange={(event) => setBackground(event.target.value)} /></label></div>
      <label className="property-toggle"><input checked={fillBackground} disabled={selectedMovedByOtherReflow} type="checkbox" onChange={(event) => setFillBackground(event.target.checked)} />Paint a solid background behind replacement text</label>
      <p className="property-note">Background fill is off by default so existing images, color fills, and vector artwork behind the source text remain visible.</p>
      <label className="property-field"><span>Alignment</span><select disabled={unsupported || selectedMovedByOtherReflow} value={align} onChange={(event) => setAlign(event.target.value as NativeTextEdit["align"])}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      <label className="property-toggle"><input checked={wrap} disabled={unsupported || selectedMovedByOtherReflow} type="checkbox" onChange={(event) => setWrap(event.target.checked)} />Reflow text into measured lines</label>
      {shaped ? <div className="result-card"><strong>Qualified Arabic/RTL reconstruction</strong><span>Import a compatible font, then PDF Studio uses Unicode bidi ordering and HarfBuzz shaping inside this fixed text region. Cross-paragraph RTL reflow and automatic bulk replacement remain disabled.</span></div> : complex ? <div className="warning-banner"><strong>Appearance-only edit</strong><span>This shaping-dependent script is outside the qualified Arabic path. Static reconstruction is not attempted.</span></div> : null}
    </section>

    <section className="property-section property-stack">
      <div className="button-row">
        <button className="button" disabled={queueBlocked || !text.trim()} onClick={queue} type="button">{queued ? "Update layout-aware text change" : "Apply layout-aware text change"}</button>
        {!complex && !unsupported && !selectedMovedByOtherReflow ? <button className="button button--danger-ghost" onClick={queueDelete} type="button">Delete existing text</button> : null}
      </div>
    </section>
  </aside>;
}
