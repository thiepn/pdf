import { memo, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { PagePlanItem } from "../types/organizer";

interface OrganizerThumbnailProps {
  document: PDFDocumentProxy;
  item: PagePlanItem;
  displayIndex: number;
  onToggle: (id: string, additive: boolean) => void;
  onDropAt: (id: string, targetIndex: number) => void;
}

function OrganizerThumbnailComponent({ document, item, displayIndex, onToggle, onDropAt }: OrganizerThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [visible, setVisible] = useState(displayIndex <= 12);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setVisible(true);
    }, { rootMargin: "700px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void document.getPage(item.sourcePageIndex + 1).then(async (page) => {
      try {
        const base = page.getViewport({ scale: 0.28, rotation: page.rotate + item.rotation });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.max(1, Math.floor(base.width));
        canvas.height = Math.max(1, Math.floor(base.height));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return;
        const task = page.render({ canvas, canvasContext: context, viewport: base });
        renderTaskRef.current = task;
        await task.promise;
      } finally { page.cleanup(); }
    }).catch(() => undefined);
    return () => { cancelled = true; renderTaskRef.current?.cancel(); };
  }, [document, item.sourcePageIndex, item.rotation, visible]);

  return (
    <div
      className={item.selected ? "organizer-page organizer-page--selected" : "organizer-page"}
      draggable
      onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/page-plan-id", item.id); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
      onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/page-plan-id"); if (id) onDropAt(id, displayIndex - 1); }}
      ref={hostRef}
    >
      <button className="organizer-page__preview" onClick={(event) => onToggle(item.id, event.ctrlKey || event.metaKey || event.shiftKey)} type="button">
        {visible ? <canvas ref={canvasRef} /> : <span className="organizer-page__placeholder" />}
        {item.rotation ? <span className="organizer-page__rotation">↻ {item.rotation}°</span> : null}
        <span className="organizer-page__check">{item.selected ? "✓" : ""}</span>
      </button>
      <div className="organizer-page__meta"><strong>{displayIndex}</strong><span>Source {item.sourcePageIndex + 1}</span></div>
    </div>
  );
}

export const OrganizerThumbnail = memo(OrganizerThumbnailComponent);
