import type { PDFDocumentProxy } from "pdfjs-dist";
import { asAffineMatrix, CoordinateService, type Rect } from "../core/coordinates";
import { extractPageText, inspectPdfBytes, multiplyTransforms, openPdfWithPdfJs } from "../engines/pdfjs";
import type { EditorObject } from "../types/editor";
import type { SecurityExportOptions, SecurityInspectionReport } from "../types/security";
import { inspectSecurity } from "./securityClient";

export interface SecurityValidationReport {
  valid: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
  inspection: SecurityInspectionReport;
  redactedTokens: string[];
}

function intersects(left: Rect, right: Rect): boolean {
  return left.x0 < right.x1 && left.x1 > right.x0 && left.y0 < right.y1 && left.y1 > right.y0;
}

export async function collectRedactionTokens(document: PDFDocumentProxy, objects: EditorObject[]): Promise<string[]> {
  const marks = objects.filter((object): object is Extract<EditorObject, { type: "redaction" }> => object.type === "redaction" && !object.hidden);
  const byPage = new Map<number, typeof marks>();
  for (const mark of marks) {
    const pageMarks = byPage.get(mark.pageNumber) ?? [];
    pageMarks.push(mark);
    byPage.set(mark.pageNumber, pageMarks);
  }
  const tokens = new Set<string>();
  for (const [pageNumber, pageMarks] of byPage) {
    if (pageNumber < 1 || pageNumber > document.numPages) continue;
    const page = await document.getPage(pageNumber);
    try {
      const viewport = page.getViewport({ scale: 1 });
      const service = new CoordinateService(asAffineMatrix(viewport.transform));
      const text = await page.getTextContent({ includeMarkedContent: false });
      for (const raw of text.items) {
        if (!("str" in raw) || !raw.str.trim()) continue;
        const item = raw as { str: string; transform: number[]; width: number; height: number };
        const transform = multiplyTransforms(viewport.transform, item.transform);
        const fontHeight = Math.max(1, Math.hypot(transform[2], transform[3]));
        const width = Math.max(1, Math.abs(item.width));
        const viewportBounds = { x0: transform[4], y0: transform[5] - fontHeight, x1: transform[4] + width, y1: transform[5] };
        const pdfBounds = service.viewportRectToPdf(viewportBounds);
        if (pageMarks.some((mark) => intersects(pdfBounds, mark.bounds))) {
          const normalized = item.str.replace(/\s+/g, " ").trim();
          if (normalized.length >= 3) tokens.add(normalized);
        }
      }
    } finally { page.cleanup(); }
  }
  return [...tokens];
}

export async function validateSecurityOutput(
  bytes: Uint8Array,
  expectedPages: number,
  options: SecurityExportOptions,
  sourcePassword: string | undefined,
  redactionTokens: string[],
  redactionPages: number[]
): Promise<SecurityValidationReport> {
  const outputPassword = options.encryption.mode === "aes-256"
    ? options.encryption.userPassword || options.encryption.ownerPassword
    : options.encryption.mode === "keep" ? sourcePassword : undefined;
  const [summary, inspection] = await Promise.all([
    inspectPdfBytes(bytes, outputPassword),
    inspectSecurity(bytes, outputPassword)
  ]);
  const checks: SecurityValidationReport["checks"] = [];
  checks.push({ name: "Page tree", passed: summary.pageCount === expectedPages, detail: `${summary.pageCount} of ${expectedPages} expected pages` });

  if (options.encryption.mode === "aes-256") {
    let blockedWithoutPassword = false;
    try {
      const plain = await openPdfWithPdfJs(bytes);
      await plain.loadingTask.destroy();
    } catch { blockedWithoutPassword = true; }
    checks.push({ name: "Password protection", passed: blockedWithoutPassword && inspection.encrypted, detail: blockedWithoutPassword ? "Opening without a password was rejected." : "The output opened without the requested password." });
  } else if (options.encryption.mode === "remove") {
    checks.push({ name: "Encryption removal", passed: !inspection.encrypted, detail: inspection.encrypted ? "Encryption is still reported." : "The output opens without encryption." });
  }

  if (options.redaction.enabled) {
    checks.push({ name: "Redaction annotations consumed", passed: inspection.redactionMarkCount === 0, detail: `${inspection.redactionMarkCount} redaction marks remain.` });
    if (redactionTokens.length) {
      const document = await openPdfWithPdfJs(bytes, outputPassword);
      try {
        const remainingText = (await Promise.all([...new Set(redactionPages)].map((pageNumber) => extractPageText(document, pageNumber)))).join("\n").toLocaleLowerCase();
        const remaining = redactionTokens.filter((token) => remainingText.includes(token.toLocaleLowerCase()));
        checks.push({ name: "Redacted text extraction", passed: remaining.length === 0, detail: remaining.length ? `Still found: ${remaining.slice(0, 5).join(", ")}` : `${redactionTokens.length} covered text fragments were absent after export.` });
      } finally { await document.loadingTask.destroy(); }
    } else checks.push({ name: "Redacted text extraction", passed: true, detail: "No selectable text fragments were detected inside the marked regions; image and vector removal rely on MuPDF redaction processing." });
  }

  if (options.formUpdates.length && !options.sanitization.flattenForms && !options.sanitization.clearFormValues) {
    const mismatches = options.formUpdates.filter((update) => {
      const field = inspection.formFields.find((candidate) => candidate.name === update.name && candidate.pageNumber === update.pageNumber)
        ?? inspection.formFields.find((candidate) => candidate.id === update.id);
      if (!field) return true;
      if (update.type === "checkbox" || update.type === "radiobutton" || update.type === "button") return isEnabledValue(field.value) !== isEnabledValue(update.value);
      return field.value !== update.value;
    });
    checks.push({ name: "Form values", passed: mismatches.length === 0, detail: mismatches.length ? `${mismatches.length} requested field updates did not persist.` : `${options.formUpdates.length} requested field updates persisted.` });
  }
  if (options.sanitization.removeJavaScript || options.sanitization.removeOpenActions) checks.push({ name: "Active content", passed: !inspection.hasJavaScript && !inspection.hasOpenAction && !inspection.hasAdditionalActions, detail: inspection.hasJavaScript || inspection.hasOpenAction || inspection.hasAdditionalActions ? "Active document actions remain." : "No catalog JavaScript or automatic actions were detected." });
  if (options.sanitization.removeAttachments) checks.push({ name: "Attachments", passed: inspection.attachmentCount === 0, detail: `${inspection.attachmentCount} embedded attachment entries remain.` });
  if (options.sanitization.removeLinks) checks.push({ name: "Links", passed: inspection.linkCount === 0, detail: `${inspection.linkCount} page links remain.` });
  if (options.sanitization.removeComments) checks.push({ name: "Comments", passed: inspection.annotationCount === 0, detail: `${inspection.annotationCount} non-redaction annotations remain.` });
  if (options.sanitization.removeMetadata) checks.push({ name: "Metadata", passed: Object.keys(inspection.metadata).length === 0, detail: Object.keys(inspection.metadata).length ? `Remaining fields: ${Object.keys(inspection.metadata).join(", ")}` : "Standard document metadata was removed." });
  if (options.sanitization.clearFormValues && !options.sanitization.flattenForms) {
    const uncleared = inspection.formFields.filter((field) => field.type !== "signature" && field.type !== "button" && isEnabledValue(field.value));
    checks.push({ name: "Form clearing", passed: uncleared.length === 0, detail: `${uncleared.length} non-empty field values remain.` });
  }
  if (options.sanitization.flattenForms) checks.push({ name: "Form flattening", passed: inspection.formFields.length === 0, detail: `${inspection.formFields.length} interactive fields remain.` });
  if (options.sanitization.flattenAnnotations) checks.push({ name: "Annotation flattening", passed: inspection.annotationCount === 0 && inspection.redactionMarkCount === 0, detail: `${inspection.annotationCount + inspection.redactionMarkCount} editable annotations remain.` });

  return { valid: checks.every((check) => check.passed), checks, inspection, redactedTokens: redactionTokens };
}

function isEnabledValue(value: string): boolean {
  return !["", "off", "false", "0", "no"].includes(value.trim().toLocaleLowerCase());
}
