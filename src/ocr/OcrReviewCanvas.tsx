import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { ocrConfidenceBand, ocrWordText, type NormalizedOcrRect } from "./ocrLayer";
import type { OcrPageResult } from "../types/ocr";

interface Props {
  document: PDFDocumentProxy;
  result: OcrPageResult;
  selectedWord: number | null;
  region: NormalizedOcrRect | null;
  onSelectWord: (index: number) => void;
  onRegionChange: (region: NormalizedOcrRect | null) => void;
}

interface DragState { x: number; y: number }

export function OcrReviewCanvas({ document, result, selectedWord, region, onSelectWord, onRegionChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [size, setSize] = useState({ width: 612, height: 792 });

  useEffect(() => {
    let cancelled = false;
    void document.getPage(result.pageNumber).then(async (page) => {
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(1.5, Math.max(.5, 860 / Math.max(1, base.width)));
        const viewport = page.getViewport({ scale });
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
        canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        setSize({ width: viewport.width, height: viewport.height });
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas context unavailable.");
        taskRef.current?.cancel();
        const task = page.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio,0,0,ratio,0,0] });
        taskRef.current = task;
        await task.promise;
      } finally { page.cleanup(); }
    }).catch(() => undefined);
    return () => { cancelled = true; taskRef.current?.cancel(); };
  }, [document, result.pageNumber]);

  const point = (event: ReactPointerEvent) => {
    const rect = hostRef.current?.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - (rect?.left ?? 0)) / Math.max(1, rect?.width ?? size.width))),
      y: Math.max(0, Math.min(1, (event.clientY - (rect?.top ?? 0)) / Math.max(1, rect?.height ?? size.height)))
    };
  };

  const beginRegion = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest(".ocr-word-box")) return;
    const start = point(event);
    dragRef.current = start;
    event.currentTarget.setPointerCapture(event.pointerId);
    onRegionChange({ x0:start.x,y0:start.y,x1:start.x,y1:start.y });
  };
  const moveRegion = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start) return;
    const current = point(event);
    onRegionChange({ x0:Math.min(start.x,current.x),y0:Math.min(start.y,current.y),x1:Math.max(start.x,current.x),y1:Math.max(start.y,current.y) });
  };
  const endRegion = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  };

  return <div className="ocr-review-stage">
    <div
      className="ocr-review-page"
      onPointerDown={beginRegion}
      onPointerMove={moveRegion}
      onPointerUp={endRegion}
      onPointerCancel={endRegion}
      ref={hostRef}
      style={{ width:size.width, height:size.height }}
    >
      <canvas ref={canvasRef}/>
      <div className="ocr-word-layer" aria-label={`Recognized text on page ${result.pageNumber}`}>
        {result.words.map((word,index)=>{
          if (word.ignored) return null;
          const text=ocrWordText(word);
          const band=ocrConfidenceBand(word.confidence);
          return <button
            aria-label={`${text || "Empty OCR word"} · ${Math.round(word.confidence)}% confidence`}
            className={`ocr-word-box ocr-word-box--${band}${selectedWord===index?" ocr-word-box--selected":""}`}
            key={`${index}-${word.bbox.x0}-${word.bbox.y0}`}
            onClick={(event)=>{event.stopPropagation();onSelectWord(index);}}
            style={{
              left:`${(word.bbox.x0/Math.max(1,result.width))*100}%`,
              top:`${(word.bbox.y0/Math.max(1,result.height))*100}%`,
              width:`${((word.bbox.x1-word.bbox.x0)/Math.max(1,result.width))*100}%`,
              height:`${((word.bbox.y1-word.bbox.y0)/Math.max(1,result.height))*100}%`
            }}
            title={`${text} · ${Math.round(word.confidence)}% confidence`}
            type="button"
          ><span>{text}</span></button>;
        })}
      </div>
      {region ? <div className="ocr-region-selection" style={{left:`${region.x0*100}%`,top:`${region.y0*100}%`,width:`${(region.x1-region.x0)*100}%`,height:`${(region.y1-region.y0)*100}%`}}/> : null}
    </div>
    <p className="ocr-review-hint">Click a recognized word to correct it. Drag on empty page space to select a region for re-recognition.</p>
  </div>;
}
