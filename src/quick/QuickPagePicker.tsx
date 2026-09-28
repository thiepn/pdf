import { useEffect, useRef, useState } from "react";
import { openPdfWithPdfJs } from "../engines/pdfjsBase";
import { parsePageSelection } from "./quickModel";
import type { QuickInput } from "./quickOperations";

/** Only one parser and at most 12 small canvases are alive for this picker. */
export function QuickPagePicker({ input, selection, disabled, onChange, showOutputOrder = false }: { input: QuickInput; showOutputOrder?: boolean; selection: string; disabled: boolean; onChange: (value: string) => void }) {
  const [offset, setOffset] = useState(0);
  const [previews, setPreviews] = useState<Record<number, string>>({});
  const [previewError, setPreviewError] = useState("");
  const generation = useRef(0);
  let selected: number[] = [];
  let error = "";
  try { selected = parsePageSelection(selection, input.pageCount); } catch (reason) { error = (reason as Error).message; }
  useEffect(() => { setOffset(0); }, [input.id]);
  useEffect(() => {
    const current = ++generation.current;
    let stopped = false;
    let dispose: (() => void) | undefined;
    setPreviews({}); setPreviewError("");
    void (async () => {
      try {
        const pdf = await openPdfWithPdfJs(input.bytes, input.password);
        dispose = () => { void pdf.loadingTask.destroy(); };
        if (stopped) { dispose(); return; }
        try {
          for (let index = offset; index < Math.min(offset + 12, input.pageCount); index++) {
            if (stopped) break;
            const page = await pdf.getPage(index + 1);
            const canvas = document.createElement("canvas");
            try {
              const original = page.getViewport({ scale: 1 });
              const viewport = page.getViewport({ scale: Math.min(160 / original.width, 210 / original.height) });
              canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
              const context = canvas.getContext("2d", { alpha: false }); if (!context) break;
              await page.render({ canvas, canvasContext: context, viewport }).promise;
              const image = canvas.toDataURL("image/jpeg", 0.75);
              if (!stopped && current === generation.current) setPreviews((previous) => ({ ...previous, [index]: image }));
            } finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
          }
        } finally { dispose(); dispose = undefined; }
      } catch { if (!stopped) setPreviewError("Thumbnails are unavailable. You can still select pages by number."); }
    })();
    return () => { stopped = true; dispose?.(); };
  }, [input.id, input.bytes, input.password, input.pageCount, offset]);
  const toggle = (page: number) => {
    const next = selected.includes(page) ? selected.filter((value) => value !== page) : [...selected, page];
    onChange(next.map((value) => value + 1).join(", "));
  };
  return <section className="quick-picker" aria-label="Choose pages">
    <label className="quick-field"><span>Pages</span><input aria-describedby="quick-pages-help" aria-invalid={Boolean(error)} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder="1-3, 5, 8-end" value={selection} /></label>
    <p className="quick-hint" id="quick-pages-help">Enter ranges, or click the previews. Use all, odd, even, or 3-1 for reverse order.</p>
    <div className="quick-inline">{["all", "odd", "even"].map((value) => <button className="button button--secondary" disabled={disabled} key={value} onClick={() => onChange(value)} type="button">{value === "all" ? "All pages" : `${value[0].toUpperCase()}${value.slice(1)} pages`}</button>)}<span aria-live="polite">{error || `${selected.length} of ${input.pageCount} pages selected`}</span></div>
    {showOutputOrder && selected.length > 0 ? <div className="output-sequence" aria-label="Output page order"><strong>Output order</strong><p>{selected.slice(0, 30).map((page, index) => `${index + 1}: page ${page + 1}`).join(" → ")}{selected.length > 30 ? ` → ${selected.length - 30} more pages` : ""}</p><button className="button button--secondary" disabled={disabled} type="button" onClick={() => onChange([...selected].reverse().map((page) => page + 1).join(","))}>Reverse output order</button><small>Edit the Pages field to set any order. Thumbnails below stay in source order.</small></div> : null}
    {previewError ? <p className="quick-hint">{previewError}</p> : null}
    <div className="quick-thumbnails">{Array.from({ length: Math.min(12, Math.max(0, input.pageCount - offset)) }, (_, index) => index + offset).map((index) => <button aria-label={`Page ${index + 1}`} aria-pressed={selected.includes(index)} className="quick-thumbnail" disabled={disabled} key={index} onClick={() => toggle(index)} type="button"><span className="quick-thumbnail__image">{previews[index] ? <img alt="" src={previews[index]} /> : <span aria-hidden="true">{index + 1}</span>}</span><strong>{selected.includes(index) ? "✓ " : ""}Page {index + 1}</strong>{showOutputOrder && selected.includes(index) ? <small>Output {selected.indexOf(index) + 1}</small> : null}</button>)}</div>
    {input.pageCount > 12 ? <div className="quick-inline"><button className="button button--secondary" disabled={offset === 0 || disabled} onClick={() => setOffset(Math.max(0, offset - 12))} type="button">Previous pages</button><span>Showing {offset + 1}–{Math.min(offset + 12, input.pageCount)}</span><button className="button button--secondary" disabled={offset + 12 >= input.pageCount || disabled} onClick={() => setOffset(offset + 12)} type="button">Next pages</button></div> : null}
  </section>;
}
