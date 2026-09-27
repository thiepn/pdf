import { useEffect, useRef, useState, type PointerEvent } from "react";
import { openPdfWithPdfJs } from "../engines/pdfjsBase";
import type { QuickInput } from "./quickOperations";
import type { QuickOptions } from "./quickModel";

const MM_TO_PT = 72 / 25.4;
type Margins = QuickOptions["crop"];
/** The preview uses the displayed (rotated) page coordinate system, matching export. */
export function VisualCrop({ input, margins, disabled, onChange, onCurrentPage }: { input: QuickInput; margins: Margins; disabled: boolean; onChange: (value: Margins) => void; onCurrentPage: (page: number) => void }) {
  const [pageNumber, setPageNumber] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 595, height: 842 });
  const [preview, setPreview] = useState<{ page: number; inputId: string; url: string } | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Margins | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  useEffect(() => { setPageNumber(1); }, [input.id]);
  useEffect(() => {
    let stopped = false;
    let dispose: (() => void) | undefined;
    setPreview(null); setDraft(null); setError("");
    void (async () => {
      try {
        const pdf = await openPdfWithPdfJs(input.bytes, input.password);
        dispose = () => { void pdf.loadingTask.destroy(); };
        if (stopped) { dispose(); return; }
        try {
          const page = await pdf.getPage(pageNumber);
          const original = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(850 / original.width, 1100 / original.height) });
          const canvas = document.createElement("canvas");
          try {
            canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            const context = canvas.getContext("2d", { alpha: false }); if (!context) throw new Error("Preview is unavailable. Use the margin fields instead.");
            await page.render({ canvas, canvasContext: context, viewport }).promise;
            if (!stopped) { setDimensions({ width: original.width, height: original.height }); setPreview({ page: pageNumber, inputId: input.id, url: canvas.toDataURL("image/png") }); }
          } finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
        } finally { dispose(); dispose = undefined; }
      } catch (reason) { if (!stopped) setError(reason instanceof Error ? reason.message : "Preview unavailable."); }
    })();
    return () => { stopped = true; start.current = null; dispose?.(); };
  }, [input.id, input.bytes, input.password, pageNumber]);
  function position(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) };
  }
  function cropTo(event: PointerEvent<HTMLDivElement>): Margins | null {
    const origin = start.current; if (!origin || origin.id !== event.pointerId) return null;
    const end = position(event);
    const left = Math.min(origin.x, end.x), right = Math.max(origin.x, end.x), top = Math.min(origin.y, end.y), bottom = Math.max(origin.y, end.y);
    if ((right - left) * dimensions.width < 12 || (bottom - top) * dimensions.height < 12) return null;
    const mm = (ratio: number, dimension: number) => Math.round(ratio * dimension / MM_TO_PT * 100) / 100;
    return { left: mm(left, dimensions.width), right: mm(1 - right, dimensions.width), top: mm(top, dimensions.height), bottom: mm(1 - bottom, dimensions.height) };
  }
  const readyPreview = preview?.page === pageNumber && preview.inputId === input.id ? preview : null;
  const shown = draft ?? margins;
  const style = { left: `${shown.left * MM_TO_PT / dimensions.width * 100}%`, right: `${shown.right * MM_TO_PT / dimensions.width * 100}%`, top: `${shown.top * MM_TO_PT / dimensions.height * 100}%`, bottom: `${shown.bottom * MM_TO_PT / dimensions.height * 100}%` };
  return <section className="visual-crop" aria-label="Visual crop preview">
    <div className="quick-inline"><label className="quick-field"><span>Preview page</span><input type="number" min={1} max={input.pageCount} disabled={disabled} value={pageNumber} onChange={(event) => { const number = Number(event.target.value); if (Number.isInteger(number) && number >= 1 && number <= input.pageCount) setPageNumber(number); }} /></label><button className="button button--secondary" type="button" disabled={disabled} onClick={() => onCurrentPage(pageNumber)}>Crop only this page</button><button className="button button--secondary" type="button" disabled={disabled} onClick={() => onChange({ top: 0, right: 0, bottom: 0, left: 0 })}>Reset crop</button></div>
    <p id="crop-instructions">Drag across the preview to keep that rectangle. For precise or keyboard adjustments, use the margin fields. Escape cancels a drag.</p>
    {error ? <p role="status">{error}</p> : !readyPreview ? <p role="status">Loading page preview…</p> : <div className="crop-stage" role="group" tabIndex={disabled ? -1 : 0} aria-label="Drag to select the area to keep" aria-describedby="crop-instructions" style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}`, maxWidth: `min(100%, ${75 * dimensions.width / dimensions.height}vh)` }} onKeyDown={(event) => { if (event.key === "Escape") { start.current = null; setDraft(null); } }} onPointerDown={(event) => { if (disabled || !readyPreview || event.button !== 0) return; event.currentTarget.focus({ preventScroll: true }); event.preventDefault(); start.current = { ...position(event), id: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!disabled && start.current) setDraft(cropTo(event)); }} onPointerUp={(event) => { const value = cropTo(event); start.current = null; setDraft(null); if (!disabled && value) onChange(value); }} onPointerCancel={() => { start.current = null; setDraft(null); }}>
      <img alt={`Page ${pageNumber} crop preview`} src={readyPreview.url} draggable={false} /><div className="crop-selection" style={style}><span>Keep this area</span></div>
    </div>}
    <p role="status">Visible size: {Math.max(0, dimensions.width / MM_TO_PT - shown.left - shown.right).toFixed(1)} × {Math.max(0, dimensions.height / MM_TO_PT - shown.top - shown.bottom).toFixed(1)} mm.</p>
  </section>;
}
