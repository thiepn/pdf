import { memo, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { multiplyTransforms } from "../engines/pdfjs";
import type { RenderScheduler } from "./renderScheduler";

interface PageCanvasProps {
  document: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  lazy?: boolean;
  searchQuery?: string;
  onVisible?: (pageNumber: number) => void;
  pixelRatioCap?: number;
  scheduler?: RenderScheduler;
  activationMarginPx?: number;
  evictionDistanceScreens?: number;
}

interface Dimensions {
  width: number;
  height: number;
}

function PageCanvasComponent({ document, pageNumber, zoom, lazy = false, searchQuery = "", onVisible, pixelRatioCap = 2, scheduler, activationMarginPx = 1200, evictionDistanceScreens = 3 }: PageCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const previousZoomRef = useRef(zoom);
  const [active, setActive] = useState(!lazy);
  const [dimensions, setDimensions] = useState<Dimensions>({ width: 612 * zoom, height: 792 * zoom });
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const previous = previousZoomRef.current;
    if (previous !== zoom && previous > 0) {
      const ratio = zoom / previous;
      setDimensions((current) => ({ width: current.width * ratio, height: current.height * ratio }));
      previousZoomRef.current = zoom;
    }
  }, [zoom]);

  useEffect(() => {
    const host = hostRef.current;
    if (!lazy || !host || typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting) {
        setActive(true);
        onVisible?.(pageNumber);
      } else if (Math.abs(entry?.boundingClientRect.top ?? 0) > window.innerHeight * evictionDistanceScreens) {
        setActive(false);
      }
    }, { rootMargin: `${activationMarginPx}px 0px` });
    observer.observe(host);
    return () => observer.disconnect();
  }, [activationMarginPx, evictionDistanceScreens, lazy, onVisible, pageNumber]);

  useEffect(() => {
    if (!active) {
      setRendered(false);
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
      if (textLayerRef.current) textLayerRef.current.replaceChildren();
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const render = async () => {
      setError(null);
      setRendered(false);
      const execute = async () => {
      if (controller.signal.aborted) throw new DOMException("Render was cancelled.", "AbortError");
      const page = await document.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: zoom });
        if (cancelled) return;
        setDimensions({ width: viewport.width, height: viewport.height });
        const canvas = canvasRef.current;
        const textLayer = textLayerRef.current;
        if (!canvas || !textLayer) return;

        renderTaskRef.current?.cancel();
        const pixelRatio = Math.min(window.devicePixelRatio || 1, pixelRatioCap);
        canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
        canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas context unavailable.");

        const task = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0]
        });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;

        const text = await page.getTextContent({ includeMarkedContent: false });
        textLayer.replaceChildren();
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;
        const query = searchQuery.trim().toLocaleLowerCase();

        for (const raw of text.items) {
          if (!("str" in raw) || !raw.str) continue;
          const item = raw as { str: string; transform: number[]; width: number; height: number };
          const transform = multiplyTransforms(viewport.transform, item.transform);
          const fontHeight = Math.hypot(transform[2], transform[3]);
          const angle = Math.atan2(transform[1], transform[0]);
          const span = documentGlobal().createElement("span");
          span.textContent = item.str;
          span.style.left = `${transform[4]}px`;
          span.style.top = `${transform[5] - fontHeight}px`;
          span.style.fontSize = `${fontHeight}px`;
          span.style.transform = `rotate(${angle}rad)`;
          span.style.transformOrigin = "0 0";
          if (query && item.str.toLocaleLowerCase().includes(query)) span.className = "text-match";
          textLayer.append(span);
        }
        setRendered(true);
      } finally {
        page.cleanup();
      }
      };
      return scheduler ? scheduler.run(execute, controller.signal, "high") : execute();
    };

    void render().catch((reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (!/cancel/i.test(message)) setError(message);
    });

    return () => {
      cancelled = true;
      controller.abort();
      renderTaskRef.current?.cancel();
    };
  }, [active, document, pageNumber, pixelRatioCap, scheduler, searchQuery, zoom]);

  return (
    <section
      aria-label={`PDF page ${pageNumber}`}
      className="pdf-page-shell"
      data-page-number={pageNumber}
      data-rendered={rendered ? "true" : "false"}
      ref={hostRef}
      style={{ width: dimensions.width, minHeight: dimensions.height }}
    >
      <div className="pdf-page-number">{pageNumber}</div>
      {active ? (
        <div className="pdf-page-layers" style={{ width: dimensions.width, height: dimensions.height }}>
          <canvas ref={canvasRef} />
          <div className="pdf-text-layer" ref={textLayerRef} />
        </div>
      ) : <div className="pdf-page-placeholder" style={{ height: dimensions.height }}>Page {pageNumber}</div>}
      {error ? <div className="page-render-error" role="alert">{error}</div> : null}
    </section>
  );
}

export const PageCanvas = memo(PageCanvasComponent);

function documentGlobal(): Document {
  return window.document;
}
