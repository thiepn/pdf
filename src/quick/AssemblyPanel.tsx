import { useEffect, useRef, useState } from "react";
import { openPdfWithPdfJs } from "../engines/pdfjsBase";
import { Icon } from "../components/Icon";
import type { QuickInput } from "./quickOperations";
import { createAssemblyPlan, interleaveAssembly, MAX_ASSEMBLY_PAGES, moveAssemblyPage, type AssemblyPage } from "./assemblyModel";

interface Props {
  inputs: QuickInput[];
  value: AssemblyPage[];
  disabled: boolean;
  onChange: (value: AssemblyPage[]) => void;
  onAddFilesAt: (index: number, replaceId?: string) => void;
}
/** The renderer opens sources serially and renders at most twelve thumbnails per window. */
function usePreviews(inputs: QuickInput[], pages: AssemblyPage[]) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const key = pages.map((page) => `${page.sourceId}:${page.sourcePageIndex}`).join("|");
  useEffect(() => {
    let stopped = false; let destroy: (() => void) | undefined;
    const urls: string[] = []; setPreviews({});
    void (async () => {
      for (const source of inputs) {
        const wanted = [...new Set(pages.filter((page) => page.sourceId === source.id).map((page) => page.sourcePageIndex))];
        if (!wanted.length || stopped) continue;
        if (source.image) {
          const url = URL.createObjectURL(source.image); urls.push(url);
          if (!stopped) setPreviews((current) => ({ ...current, [`${source.id}:0`]: url })); continue;
        }
        try {
          const pdf = await openPdfWithPdfJs(source.bytes, source.password);
          destroy = () => { void pdf.loadingTask.destroy(); };
          if (stopped) { destroy(); break; }
          try {
            for (const index of wanted) {
              if (stopped) break;
              const page = await pdf.getPage(index + 1); const canvas = document.createElement("canvas");
              try {
                const base = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({ scale: Math.min(180 / base.width, 240 / base.height) });
                canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
                const context = canvas.getContext("2d", { alpha: false }); if (!context) continue;
                await page.render({ canvas, canvasContext: context, viewport }).promise;
                const url = canvas.toDataURL("image/jpeg", 0.8);
                if (!stopped) setPreviews((current) => ({ ...current, [`${source.id}:${index}`]: url }));
              } finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
            }
          } finally { destroy(); destroy = undefined; }
        } catch { /* Numeric page labels remain usable when thumbnail rendering fails. */ }
      }
    })();
    return () => { stopped = true; destroy?.(); urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [inputs, key]);
  return previews;
}
export function AssemblyPanel({ inputs, value, disabled, onChange, onAddFilesAt }: Props) {
  const [offset, setOffset] = useState(0); const [selected, setSelected] = useState<Set<string>>(new Set());
  const [past, setPast] = useState<AssemblyPage[][]>([]); const [future, setFuture] = useState<AssemblyPage[][]>([]);
  const [notice, setNotice] = useState(""); const dragged = useRef<number | null>(null);
  const visible = value.slice(offset, offset + 12); const previews = usePreviews(inputs, visible);
  const sourceKey = inputs.map((input) => input.id).join(":");
  const previousPlan = useRef(value);
  useEffect(() => {
    const sources = new Set(sourceKey.split(":"));
    const valid = (plan: AssemblyPage[]) => plan.every((page) => page.sourceId === null || sources.has(page.sourceId));
    // File insertion/replacement is undoable too. Removed sources invalidate only
    // history entries that actually need those bytes; retained files stay usable.
    const previous = previousPlan.current;
    setPast((items) => [...items.filter(valid), ...(previous !== value && valid(previous) ? [previous] : [])].slice(-20));
    setFuture((items) => previous !== value ? [] : items.filter(valid));
    previousPlan.current = value;
    setSelected((current) => new Set([...current].filter((id) => value.some((page) => page.id === id))));
  }, [value, sourceKey]);
  useEffect(() => { if (offset >= value.length) setOffset(Math.max(0, Math.floor((value.length - 1) / 12) * 12)); }, [value.length, offset]);
  function change(next: AssemblyPage[], message: string) {
    if (disabled) return;
    if (next.length > MAX_ASSEMBLY_PAGES) { setNotice(`A maximum of ${MAX_ASSEMBLY_PAGES} pages can be assembled at once.`); return; }
    setPast((items) => [...items.slice(-19), value]); setFuture([]); setNotice(message); previousPlan.current = next; onChange(next);
  }
  function undo() { const next = past.at(-1); if (!next || disabled) return; setPast(past.slice(0, -1)); setFuture([value, ...future]); previousPlan.current = next; onChange(next); setNotice("Page change undone."); }
  function redo() { const next = future[0]; if (!next || disabled) return; setFuture(future.slice(1)); setPast([...past, value]); previousPlan.current = next; onChange(next); setNotice("Page change restored."); }
  function move(from: number, to: number) { change(moveAssemblyPage(value, from, to), `Moved page ${from + 1} to position ${to + 1}.`); }
  return <section className="assembly" aria-label="Arrange output pages">
    <div className="assembly-heading"><div><h2>Output order</h2><p>These are the pages in your finished PDF, from first to last.</p></div><strong aria-live="polite">{value.length} pages</strong></div>
    <div className="assembly-tools"><button className="button button--secondary" disabled={disabled || !past.length} onClick={undo} type="button"><Icon name="undo"/>Undo</button><button className="button button--secondary" disabled={disabled || !future.length} onClick={redo} type="button"><Icon name="redo"/>Redo</button><button className="button button--secondary" disabled={disabled} onClick={() => change([...value].reverse(), "Page order reversed.")} type="button">Reverse order</button><button className="button button--secondary" disabled={disabled} onClick={() => change([...value, { id: crypto.randomUUID(), sourceId: null, sourcePageIndex: 0, rotation: 0 }], "Blank A4 page added at the end.")} type="button">Add blank page</button><button className="button button--secondary" disabled={disabled || !selected.size} onClick={() => { change(value.filter((page) => !selected.has(page.id)), "Selected pages removed. Undo restores them."); setSelected(new Set()); }} type="button">Remove selected ({value.filter((page) => selected.has(page.id)).length})</button></div>
    {inputs.length === 2 ? <details className="assembly-presets"><summary>Double-sided scans & page order</summary><p>Use the first document for fronts and the second for backs. These shortcuts replace the current page order.</p><div className="assembly-tools"><button disabled={disabled} onClick={() => change(interleaveAssembly(inputs), "Front and back pages interleaved.")} type="button">Interleave fronts and backs</button><button disabled={disabled} onClick={() => change(interleaveAssembly(inputs, true), "Back pages reversed, then interleaved.")} type="button">Reverse backs, then interleave</button><button disabled={disabled} onClick={() => change(createAssemblyPlan(inputs), "Original file order restored.")} type="button">Reset to file order</button></div></details> : null}
    {notice ? <p className="quick-hint" role="status">{notice}</p> : null}
    <ol className="assembly-grid" start={offset + 1}>{visible.map((page, slot) => {
      const index = offset + slot; const input = inputs.find((source) => source.id === page.sourceId); const preview = previews[`${page.sourceId}:${page.sourcePageIndex}`];
      return <li className="assembly-card" key={page.id} draggable={!disabled} onDragStart={(event) => { dragged.current = index; event.dataTransfer.setData("text/plain", String(index)); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { dragged.current = null; }} onDragOver={(event) => { if (dragged.current !== null) event.preventDefault(); }} onDrop={(event) => { if (dragged.current === null) return; event.preventDefault(); event.stopPropagation(); move(dragged.current, index); dragged.current = null; }}>
        <label className="assembly-select"><input type="checkbox" checked={selected.has(page.id)} disabled={disabled} aria-label={`Select output page ${index + 1}`} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(page.id)) next.delete(page.id); else next.add(page.id); return next; })}/><strong>Output page {index + 1}</strong></label>
        <div className="assembly-preview" aria-hidden="true">{preview ? <img alt="" src={preview} style={{ transform: `rotate(${page.rotation}deg)`, maxWidth: page.rotation % 180 ? "70%" : undefined }} /> : <span>{page.sourceId ? `Page ${page.sourcePageIndex + 1}` : "Blank page"}</span>}</div>
        <p className="assembly-source" title={input?.name}>{input ? `${input.name} · page ${page.sourcePageIndex + 1}` : "Blank A4 page"}{page.rotation ? ` · +${page.rotation}°` : ""}</p>
        <div className="assembly-card-actions"><button aria-label={`Move output page ${index + 1} earlier`} disabled={disabled || index === 0} onClick={() => move(index, index - 1)} type="button">←</button><button aria-label={`Move output page ${index + 1} later`} disabled={disabled || index === value.length - 1} onClick={() => move(index, index + 1)} type="button">→</button><button aria-label={`Rotate output page ${index + 1}`} disabled={disabled} onClick={() => change(value.map((item) => item.id === page.id ? { ...item, rotation: ((item.rotation + 90) % 360) as AssemblyPage["rotation"] } : item), `Rotated output page ${index + 1}.`)} type="button">Rotate</button></div>
        <details className="assembly-page-menu"><summary>Page actions</summary><label>Move to position<input aria-label={`Position of output page ${index + 1}`} type="number" min={1} max={value.length} defaultValue={index + 1} key={index} disabled={disabled} onBlur={(event) => { const target = Number(event.target.value) - 1; if (Number.isInteger(target) && target >= 0 && target < value.length && target !== index) move(index, target); }} /></label><button disabled={disabled} onClick={() => change([...value.slice(0, index + 1), { ...page, id: crypto.randomUUID() }, ...value.slice(index + 1)], `Duplicated output page ${index + 1}.`)} type="button">Duplicate page</button><button disabled={disabled} onClick={() => onAddFilesAt(index)} type="button">Insert files before</button><button disabled={disabled} onClick={() => onAddFilesAt(index, page.id)} type="button">Replace with file…</button><button disabled={disabled} onClick={() => change(value.filter((item) => item.id !== page.id), `Removed output page ${index + 1}. Undo restores it.`)} type="button">Remove page</button></details>
      </li>;
    })}</ol>
    {!value.length ? <p role="status">No output pages. Undo the removal or add a blank page.</p> : null}
    {value.length > 12 ? <div className="assembly-tools"><button disabled={disabled || offset === 0} onClick={() => setOffset(Math.max(0, offset - 12))} type="button">Previous output pages</button><label>Go to output page<input min={1} max={value.length} type="number" aria-label="Go to output page" value={offset + 1} onChange={(event) => { const page = Number(event.target.value); if (Number.isInteger(page) && page >= 1 && page <= value.length) setOffset(Math.floor((page - 1) / 12) * 12); }}/></label><button disabled={disabled || offset + 12 >= value.length} onClick={() => setOffset(offset + 12)} type="button">Next output pages</button><span>{offset + 1}–{Math.min(offset + 12, value.length)} of {value.length}</span></div> : null}
    <p className="quick-hint">Drag pages or use the move buttons. Replacing a page inserts every page of the chosen file in its place. Originals are unchanged.</p>
  </section>;
}
