import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { asAffineMatrix, CoordinateService, type Rect } from "../core/coordinates";
import type { EditorObject } from "../types/editor";
import type { SecurityFormField } from "../types/security";

interface Props {
  document: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  fields: SecurityFormField[];
  objects: EditorObject[];
  selectedFieldId?: string;
  onSelectField?: (field: SecurityFormField) => void;
}

interface PageState {
  width: number;
  height: number;
  service: CoordinateService | null;
}

export function SecurityPreviewPage({ document, pageNumber, zoom, fields, objects, selectedFieldId, onSelectField }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const [page, setPage] = useState<PageState>({ width: 612 * zoom, height: 792 * zoom, service: null });
  const pageFields = useMemo(() => fields.filter((field) => field.pageNumber === pageNumber), [fields, pageNumber]);
  const pageObjects = useMemo(() => objects.filter((object): object is Extract<EditorObject, { type: "redaction" | "signature" }> => object.pageNumber === pageNumber && !object.hidden && (object.type === "redaction" || object.type === "signature")), [objects, pageNumber]);

  useEffect(() => {
    let cancelled = false;
    void document.getPage(pageNumber).then(async (pdfPage) => {
      try {
        const viewport = pdfPage.getViewport({ scale: zoom });
        const service = new CoordinateService(asAffineMatrix(viewport.transform));
        if (cancelled) return;
        setPage({ width: viewport.width, height: viewport.height, service });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
        canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas context unavailable.");
        taskRef.current?.cancel();
        const task = pdfPage.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
        taskRef.current = task;
        await task.promise;
      } finally { pdfPage.cleanup(); }
    }).catch(() => undefined);
    return () => { cancelled = true; taskRef.current?.cancel(); };
  }, [document, pageNumber, zoom]);

  const service = page.service;
  return <div className="security-preview-shell" style={{ width: page.width, height: page.height }}>
    <canvas ref={canvasRef} />
    {service ? <div className="security-preview-overlay">
      {pageFields.map((field) => <button className={`security-field-box${selectedFieldId === field.id ? " active" : ""}`} key={field.id} onClick={() => onSelectField?.(field)} style={rectStyle(service.pdfRectToViewport(field.rect))} title={`${field.label || field.name || field.type} · ${field.type}`} type="button"><span>{field.type}</span></button>)}
      {pageObjects.map((object) => {
        const bounds = service.pdfRectToViewport(object.bounds);
        if (!bounds) return null;
        if (object.type === "redaction") return <div className="security-redaction-preview" key={object.id} style={{ ...rectStyle(bounds), background: object.fillColor }}><span>{object.overlayText || "REDACTED"}</span></div>;
        return <div className="security-signature-preview" key={object.id} style={{ ...rectStyle(bounds), color: object.color }}><strong>{object.signerName || "Signature"}</strong>{object.showDate ? <small>{new Date(object.signedAt).toLocaleDateString()}</small> : null}</div>;
      })}
    </div> : null}
  </div>;
}

function rectStyle(rect: Rect) {
  return { left: rect.x0, top: rect.y0, width: Math.max(1, rect.x1 - rect.x0), height: Math.max(1, rect.y1 - rect.y0) };
}
