import type { PDFDocumentProxy } from "pdfjs-dist";
import { asAffineMatrix, CoordinateService, type Rect } from "../core/coordinates";
import { multiplyTransforms } from "../engines/pdfjs";
import type { FormFieldCreate, FormFieldCreateType, SecurityFormField } from "../types/security";

export type FormCandidateConfidence = "high" | "medium";

export interface FormFieldCandidate {
  id: string;
  pageNumber: number;
  type: FormFieldCreateType;
  label: string;
  name: string;
  rect: Rect;
  confidence: FormCandidateConfidence;
  reason: string;
}

const MAX_FORM_CANDIDATES = 240;
const LABEL_RE = /^(?:full\s+name|name|first\s+name|last\s+name|e-?mail(?:\s+address)?|phone|telephone|mobile|date|address|street|city|state|province|zip|postal\s+code|country|company|organization|job\s+title|title|account|customer\s+(?:id|number)|reference|signature)\s*:?$/i;
const CHECKBOX_RE = /^(?:☐|□|◻|\[\s*\])$/u;
const BLANK_RE = /^(?:_{3,}|\.{5,}|-{5,})$/;

function finiteRect(rect: Rect): boolean {
  return [rect.x0, rect.y0, rect.x1, rect.y1].every(Number.isFinite) && rect.x1 > rect.x0 && rect.y1 > rect.y0;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function sanitizeFieldName(label: string, pageNumber: number, index: number): string {
  const stem = label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 36) || "field";
  return `p${pageNumber}_${stem}_${index + 1}`;
}

function textBounds(viewport: { transform: number[] }, item: { transform: number[]; width: number; height?: number }): Rect {
  const transform = multiplyTransforms(viewport.transform, item.transform);
  const fontHeight = Math.max(8, Math.hypot(transform[2], transform[3]), Math.abs(item.height ?? 0));
  const width = Math.max(4, Math.abs(item.width));
  return { x0: transform[4], y0: transform[5] - fontHeight, x1: transform[4] + width, y1: transform[5] + Math.max(2, fontHeight * .18) };
}

function candidateToPdf(service: CoordinateService, rect: Rect): Rect {
  const normalized = service.viewportRectToPdf(rect);
  return {
    x0: Math.min(normalized.x0, normalized.x1),
    y0: Math.min(normalized.y0, normalized.y1),
    x1: Math.max(normalized.x0, normalized.x1),
    y1: Math.max(normalized.y0, normalized.y1)
  };
}

export async function detectFormFieldCandidates(
  document: PDFDocumentProxy,
  existingFields: SecurityFormField[],
  pages?: number[],
  signal?: AbortSignal
): Promise<FormFieldCandidate[]> {
  const existing = existingFields.map((field) => field.rect);
  const result: FormFieldCandidate[] = [];
  const pageNumbers = pages?.length ? pages : Array.from({ length: document.numPages }, (_, index) => index + 1);

  for (const pageNumber of pageNumbers) {
    signal?.throwIfAborted();
    if (pageNumber < 1 || pageNumber > document.numPages) continue;
    const page = await document.getPage(pageNumber);
    try {
      const viewport = page.getViewport({ scale: 1 });
      const service = new CoordinateService(asAffineMatrix(viewport.transform));
      const text = await page.getTextContent({ includeMarkedContent: false });
      let ordinal = 0;
      for (const raw of text.items) {
        signal?.throwIfAborted();
        if (!("str" in raw) || typeof raw.str !== "string") continue;
        const value = raw.str.trim();
        if (!value || value.length > 80) continue;
        const item = raw as typeof raw & { transform: number[]; width: number; height?: number };
        const bounds = textBounds(viewport, item);
        let type: FormFieldCreateType | undefined;
        let label = value.replace(/\s*:\s*$/, "");
        let candidateViewport: Rect | undefined;
        let confidence: FormCandidateConfidence = "medium";
        let reason = "";

        if (CHECKBOX_RE.test(value)) {
          type = "checkbox";
          label = "Checkbox";
          const size = Math.max(16, Math.min(24, bounds.y1 - bounds.y0));
          candidateViewport = { x0: bounds.x0, y0: bounds.y0, x1: bounds.x0 + size, y1: bounds.y0 + size };
          confidence = "high";
          reason = "An empty checkbox glyph was detected.";
        } else if (BLANK_RE.test(value)) {
          type = "text";
          label = "Text field";
          candidateViewport = { x0: bounds.x0, y0: bounds.y0 - 2, x1: bounds.x1, y1: bounds.y1 + 3 };
          confidence = "high";
          reason = "A blank write-in line was detected.";
        } else if (LABEL_RE.test(value) || (value.endsWith(":") && value.split(/\s+/).length <= 5)) {
          type = "text";
          const height = Math.max(20, bounds.y1 - bounds.y0 + 7);
          const start = Math.min(viewport.width - 34, bounds.x1 + 8);
          const available = viewport.width - start - 12;
          if (available >= 46) {
            candidateViewport = { x0: start, y0: bounds.y0 - 3, x1: start + Math.min(190, available), y1: bounds.y0 - 3 + height };
            confidence = LABEL_RE.test(value) ? "high" : "medium";
            reason = confidence === "high" ? "A common form label was detected." : "A short label ending in a colon was detected.";
          }
        }

        if (!type || !candidateViewport) continue;
        const rect = candidateToPdf(service, candidateViewport);
        if (!finiteRect(rect) || existing.some((field) => intersects(field, rect))) continue;
        const id = `form-candidate:${pageNumber}:${ordinal++}`;
        result.push({ id, pageNumber, type, label, name: sanitizeFieldName(label, pageNumber, ordinal), rect, confidence, reason });
        if (result.length >= MAX_FORM_CANDIDATES) return result;
      }
    } finally {
      page.cleanup();
    }
  }
  return result;
}

export function formCandidateToCreate(candidate: FormFieldCandidate): FormFieldCreate {
  return {
    id: candidate.id.replace("form-candidate:", "form-create:"),
    pageNumber: candidate.pageNumber,
    type: candidate.type,
    name: candidate.name,
    label: candidate.label,
    rect: { ...candidate.rect },
    defaultValue: "",
    multiline: false,
    required: false
  };
}

export function createManualFormField(pageNumber: number, type: FormFieldCreateType, ordinal: number): FormFieldCreate {
  const isCheckbox = type === "checkbox";
  return {
    id: crypto.randomUUID?.() ?? `manual-form-${Date.now()}-${ordinal}`,
    pageNumber,
    type,
    name: `p${pageNumber}_${type}_${ordinal + 1}`,
    label: type === "text" ? "Text field" : "Checkbox",
    rect: isCheckbox ? { x0: 72, y0: 720, x1: 90, y1: 738 } : { x0: 72, y0: 700, x1: 252, y1: 726 },
    defaultValue: "",
    multiline: false,
    required: false
  };
}

export function updateFormCreateGeometry(field: FormFieldCreate, patch: { x?: number; y?: number; width?: number; height?: number }): FormFieldCreate {
  const width = Math.max(8, patch.width ?? field.rect.x1 - field.rect.x0);
  const height = Math.max(8, patch.height ?? field.rect.y1 - field.rect.y0);
  const x = patch.x ?? field.rect.x0;
  const y = patch.y ?? field.rect.y0;
  return { ...field, rect: { x0: x, y0: y, x1: x + width, y1: y + height } };
}


export function validateFormCreates(drafts: FormFieldCreate[], existingFields: SecurityFormField[]): string[] {
  const errors: string[] = [];
  const existing = new Set(existingFields.map((field) => field.name).filter(Boolean));
  const seen = new Set<string>();
  for (const draft of drafts) {
    const name = draft.name.trim();
    if (!name) errors.push(`Page ${draft.pageNumber}: a new ${draft.type} field has no field name.`);
    else if (existing.has(name)) errors.push(`Field name “${name}” already exists in the PDF.`);
    else if (seen.has(name)) errors.push(`Field name “${name}” is used by more than one new field.`);
    else seen.add(name);
    if (!Number.isInteger(draft.pageNumber) || draft.pageNumber < 1) errors.push(`Field “${name || draft.label}” has an invalid page number.`);
    const width = draft.rect.x1 - draft.rect.x0;
    const height = draft.rect.y1 - draft.rect.y0;
    if (![draft.rect.x0, draft.rect.y0, draft.rect.x1, draft.rect.y1].every(Number.isFinite) || width < 8 || height < 8) {
      errors.push(`Field “${name || draft.label}” has invalid geometry.`);
    }
  }
  return [...new Set(errors)];
}
