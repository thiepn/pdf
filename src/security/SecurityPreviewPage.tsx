import { useEffect, useMemo, useRef, useState } from "react";
import { AnnotationMode, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import { previewFormValues } from "./formPreview";
import { boundedPairScale } from "../comparison/visualDiff";
import { asAffineMatrix, CoordinateService, type Rect } from "../core/coordinates";
import type { EditorObject } from "../types/editor";
import type { FormFieldCreate, SecurityFormField } from "../types/security";
import type { RedactionCandidate } from "./redactionDiscovery";
import type { FormFieldCandidate } from "./formAuthoring";

interface Props {
  document: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  fields: SecurityFormField[];
  objects: EditorObject[];
  values?: Record<string, string>;
  selectedFieldId?: string;
  draftFields?: FormFieldCreate[];
  selectedDraftId?: string;
  onSelectField?: (field: SecurityFormField) => void;
  onSelectDraft?: (field: FormFieldCreate) => void;
  redactionCandidate?: RedactionCandidate | null;
  formCandidate?: FormFieldCandidate | null;
}

interface PageState {
  width: number;
  height: number;
  service: CoordinateService | null;
}

export function SecurityPreviewPage({ document, pageNumber, zoom, fields, objects, values, selectedFieldId, draftFields = [], selectedDraftId, onSelectField, onSelectDraft, redactionCandidate, formCandidate }: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const taskRef = useRef<RenderTask | null>(null);
  const [page, setPage] = useState<PageState>({ width: 612 * zoom, height: 792 * zoom, service: null });
  const pageFields = useMemo(() => fields.filter((field) => field.pageNumber === pageNumber), [fields, pageNumber]);
  const pageDrafts = useMemo(() => draftFields.filter((field) => field.pageNumber === pageNumber), [draftFields, pageNumber]);
  const pageObjects = useMemo(() => objects.filter((object): object is Extract<EditorObject, { type: "redaction" | "signature" }> => object.pageNumber === pageNumber && !object.hidden && (object.type === "redaction" || object.type === "signature")), [objects, pageNumber]);

  useEffect(() => {
    let cancelled = false;
    let rendered: HTMLCanvasElement | null = null;
    setRendering(true); setRenderError(null);
    const timer = window.setTimeout(() => { void (async () => {
      const pdfPage = await document.getPage(pageNumber);
      try {
        const annotations = await pdfPage.getAnnotations();
        if (cancelled) return;
        for (const entry of previewFormValues(annotations, pageFields, values)) document.annotationStorage.setValue(entry.id, { value: entry.value });
        const viewport = pdfPage.getViewport({ scale: zoom });
        const service = new CoordinateService(asAffineMatrix(viewport.transform));
        // Each generation owns its canvas. A cancelled render cannot overwrite a newer preview.
        rendered = window.document.createElement("canvas");
        const ratio = Math.min(window.devicePixelRatio || 1, 2) * boundedPairScale(
          { width: viewport.width * Math.min(window.devicePixelRatio || 1, 2), height: viewport.height * Math.min(window.devicePixelRatio || 1, 2) }, null
        );
        rendered.width = Math.max(1, Math.floor(viewport.width * ratio));
        rendered.height = Math.max(1, Math.floor(viewport.height * ratio));
        rendered.style.width = `${viewport.width}px`; rendered.style.height = `${viewport.height}px`;
        const context = rendered.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas context unavailable.");
        const task = pdfPage.render({ canvas: rendered, canvasContext: context, viewport, annotationMode: AnnotationMode.ENABLE_STORAGE, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
        taskRef.current = task;
        await task.promise;
        if (cancelled) return;
        for (const old of canvasRef.current?.querySelectorAll("canvas") ?? []) { old.width = 1; old.height = 1; }
        canvasRef.current?.replaceChildren(rendered);
        rendered = null;
        setPage({ width: viewport.width, height: viewport.height, service });
        setRendering(false);
      } finally {
        if (rendered) { rendered.width = 1; rendered.height = 1; }
        pdfPage.cleanup();
      }
    })().catch((reason) => {
      if (!cancelled) { setRenderError(reason instanceof Error ? reason.message : "The preview could not render."); setRendering(false); }
    }); }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); taskRef.current?.cancel(); };
  }, [document, pageNumber, zoom, pageFields, values]);

  const service = page.service;
  return <div className="security-preview-shell" aria-busy={rendering} style={{ width: page.width, height: page.height }}>
    <div ref={canvasRef} className="security-preview-canvas" />
    {renderError ? <p className="security-preview-error" role="alert">Preview unavailable: {renderError}</p> : null}
    {rendering ? <span className="security-preview-status" role="status">Updating form preview…</span> : null}
    {service ? <div className="security-preview-overlay">
      {pageFields.map((field) => <button className={`security-field-box${selectedFieldId === field.id ? " active" : ""}`} key={field.id} aria-label={`Fill ${field.label || field.name || field.type}`} onClick={() => onSelectField?.(field)} style={rectStyle(service.pdfRectToViewport(field.rect))} title={`${field.label || field.name || field.type} · ${field.type}`} type="button"><span>{values && values[field.id] !== undefined && values[field.id] !== field.value ? field.password ? "••••" : values[field.id] || "Empty" : field.type}</span></button>)}
      {pageDrafts.map((field) => <button className={`security-field-box security-field-box--draft${selectedDraftId === field.id ? " active" : ""}`} key={field.id} aria-label={`New ${field.label || field.name || field.type}`} onClick={() => onSelectDraft?.(field)} style={rectStyle(service.pdfRectToViewport(field.rect))} title={`New interactive ${field.type}: ${field.label || field.name}`} type="button"><span>NEW {field.type}</span></button>)}
      {formCandidate?.pageNumber === pageNumber ? <div className="security-form-candidate-preview" style={rectStyle(service.pdfRectToViewport(formCandidate.rect))}><span>PROPOSED {formCandidate.type}</span></div> : null}
      {redactionCandidate?.pageNumber === pageNumber ? <div className="security-redaction-candidate-preview" style={rectStyle(service.pdfRectToViewport(redactionCandidate.bounds))}><span>REVIEW MATCH</span></div> : null}
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
