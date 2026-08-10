import { memo, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { RenderScheduler } from "./renderScheduler";

interface ThumbnailProps {
  document: PDFDocumentProxy;
  pageNumber: number;
  label?: string;
  selected: boolean;
  onSelect: (pageNumber: number) => void;
  scheduler?: RenderScheduler;
}

function ThumbnailComponent({ document, pageNumber, label, selected, onSelect, scheduler }: ThumbnailProps) {
  const hostRef = useRef<HTMLButtonElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [visible, setVisible] = useState(pageNumber <= 4);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setVisible(true);
    }, { rootMargin: "400px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const controller = new AbortController();
    const render = async () => {
      if (controller.signal.aborted) throw new DOMException("Thumbnail render was cancelled.", "AbortError");
      const page = await document.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: 0.18 });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return;
        const task = page.render({ canvas, canvasContext: context, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } finally {
        page.cleanup();
      }
    };
    void (scheduler ? scheduler.run(render, controller.signal, "low") : render()).catch(() => undefined);
    return () => {
      cancelled = true;
      controller.abort();
      renderTaskRef.current?.cancel();
    };
  }, [document, pageNumber, scheduler, visible]);

  return (
    <button
      aria-current={selected ? "page" : undefined}
      aria-label={`Open page ${label ?? pageNumber}`}
      className={selected ? "thumbnail thumbnail--selected" : "thumbnail"}
      onClick={() => onSelect(pageNumber)}
      ref={hostRef}
      type="button"
    >
      <span className="thumbnail__canvas">{visible ? <canvas ref={canvasRef} /> : null}</span>
      <span>{label ?? pageNumber}</span>
    </button>
  );
}

export const Thumbnail = memo(ThumbnailComponent);
