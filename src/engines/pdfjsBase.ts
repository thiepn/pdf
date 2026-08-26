import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { measureRuntimeAsync } from "../performance/runtimeMetrics";
import type { PdfDocumentSummary } from "../types/project";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type PdfJsDocument = Awaited<ReturnType<typeof openPdfWithPdfJs>>;
export type PdfJsPage = Awaited<ReturnType<PdfJsDocument["getPage"]>>;

export async function openPdfWithPdfJs(bytes: Uint8Array, password?: string) {
  return measureRuntimeAsync("pdf", "pdfjs.open", async () => {
    const loadingTask = pdfjs.getDocument({
      data: bytes.slice(),
      password,
      useWorkerFetch: true,
      enableXfa: false
    });
    try {
      return await loadingTask.promise;
    } catch (reason) {
      await loadingTask.destroy();
      throw reason;
    }
  }, { byteLength: bytes.byteLength, passwordProtected: Boolean(password) });
}

export async function extractPageText(document: PdfJsDocument, pageNumber: number): Promise<string> {
  return measureRuntimeAsync("render", "pdfjs.extractPageText", async () => {
    const page = await document.getPage(pageNumber);
    try {
      const text = await page.getTextContent({ includeMarkedContent: false });
      return text.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    } finally {
      page.cleanup();
    }
  }, { pageNumber });
}

function readString(info: Record<string, unknown>, key: string): string | undefined {
  const value = info[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export async function inspectPdfBytes(bytes: Uint8Array, password?: string): Promise<PdfDocumentSummary> {
  return measureRuntimeAsync("pdf", "pdfjs.inspectSummary", async () => {
    const document = await openPdfWithPdfJs(bytes, password);
    try {
      const [metadataResult, outlineResult, labelsResult, attachmentsResult, fieldsResult, actionsResult] = await Promise.allSettled([
        document.getMetadata(),
        document.getOutline(),
        document.getPageLabels(),
        document.getAttachments(),
        document.getFieldObjects(),
        document.getJSActions()
      ]);

      const info = metadataResult.status === "fulfilled"
        ? metadataResult.value.info as Record<string, unknown>
        : {};
      const outline = outlineResult.status === "fulfilled" ? outlineResult.value : null;
      const labels = labelsResult.status === "fulfilled" ? labelsResult.value : null;
      const attachments = attachmentsResult.status === "fulfilled" ? attachmentsResult.value : null;
      const fields = fieldsResult.status === "fulfilled" ? fieldsResult.value : null;
      const actions = actionsResult.status === "fulfilled" ? actionsResult.value : null;

      let formFieldCount = 0;
      if (fields) {
        for (const value of Object.values(fields)) formFieldCount += Array.isArray(value) ? value.length : 0;
      }

      return {
        pageCount: document.numPages,
        title: readString(info, "Title"),
        author: readString(info, "Author"),
        subject: readString(info, "Subject"),
        creator: readString(info, "Creator"),
        producer: readString(info, "Producer"),
        pdfFormatVersion: readString(info, "PDFFormatVersion"),
        encrypted: Boolean(password) || info.IsEncrypted === true,
        hasOutline: Boolean(outline?.length),
        formFieldCount,
        attachmentCount: attachments ? Object.keys(attachments).length : 0,
        hasJavaScript: Boolean(actions && Object.keys(actions).length),
        pageLabels: labels ?? undefined
      };
    } finally {
      await document.loadingTask.destroy();
    }
  }, { byteLength: bytes.byteLength });
}

export interface PdfAnnotationInventory {
  pageNumbers: number[];
  annotationCount: number;
  linkCount: number;
  widgetCount: number;
}

export async function inspectPdfAnnotationInventory(
  bytes: Uint8Array,
  password?: string,
  requestedPages?: Iterable<number>
): Promise<PdfAnnotationInventory> {
  const document = await openPdfWithPdfJs(bytes, password);
  try {
    const pageNumbers = requestedPages
      ? [...new Set(requestedPages)].filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= document.numPages).sort((a, b) => a - b)
      : Array.from({ length: document.numPages }, (_, index) => index + 1);
    let annotationCount = 0;
    let linkCount = 0;
    let widgetCount = 0;
    for (const pageNumber of pageNumbers) {
      const page = await document.getPage(pageNumber);
      try {
        const annotations = await page.getAnnotations({ intent: "display" });
        for (const annotation of annotations) {
          const subtype = typeof annotation.subtype === "string" ? annotation.subtype : "";
          if (subtype === "Link") linkCount += 1;
          else if (subtype === "Widget") widgetCount += 1;
          else annotationCount += 1;
        }
      } finally {
        page.cleanup();
      }
    }
    return { pageNumbers, annotationCount, linkCount, widgetCount };
  } finally {
    await document.loadingTask.destroy();
  }
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface PdfSearchResult {
  id: string;
  pageNumber: number;
  pageLabel?: string;
  matchCount: number;
  snippet: string;
}

function countMatches(text: string, query: string, options: SearchOptions): number {
  if (!query) return 0;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(options.wholeWord ? `\\b${escaped}\\b` : escaped, options.caseSensitive ? "g" : "gi");
  return Array.from(text.matchAll(expression)).length;
}

export async function searchPdfDocument(
  document: PdfJsDocument,
  query: string,
  options: SearchOptions,
  signal: AbortSignal,
  onProgress?: (completed: number, total: number) => void
): Promise<PdfSearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const labels = await document.getPageLabels().catch(() => null);
  const results: PdfSearchResult[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    if (signal.aborted) throw new DOMException("Search cancelled.", "AbortError");
    const text = await extractPageText(document, pageNumber);
    const matchCount = countMatches(text, normalizedQuery, options);
    if (matchCount > 0) {
      const haystack = options.caseSensitive ? text : text.toLocaleLowerCase();
      const needle = options.caseSensitive ? normalizedQuery : normalizedQuery.toLocaleLowerCase();
      const index = haystack.indexOf(needle);
      const start = Math.max(0, index - 70);
      const end = Math.min(text.length, index + normalizedQuery.length + 100);
      results.push({
        id: `${pageNumber}-${results.length}`,
        pageNumber,
        pageLabel: labels?.[pageNumber - 1],
        matchCount,
        snippet: `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`
      });
    }
    onProgress?.(pageNumber, document.numPages);
    if (pageNumber % 5 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  return results;
}

export function multiplyTransforms(left: number[], right: number[]): [number, number, number, number, number, number] {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ];
}

export interface DetailedPageInspection {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  textCharacters: number;
  fontNames: string[];
  imageOperations: number;
  annotationCount: number;
  linkCount: number;
  widgetCount: number;
}

export interface DetailedPdfInspection {
  pageCount: number;
  metadata: Record<string, string>;
  outlineEntries: number;
  attachmentCount: number;
  formFieldCount: number;
  pages: DetailedPageInspection[];
  totals: { textCharacters: number; uniqueFonts: number; imageOperations: number; annotations: number; links: number; widgets: number };
}

export async function inspectDetailedPdf(document: PdfJsDocument, signal?: AbortSignal, onProgress?: (completed: number, total: number) => void): Promise<DetailedPdfInspection> {
  const [metadataResult, outlineResult, attachmentsResult, fieldsResult] = await Promise.allSettled([document.getMetadata(), document.getOutline(), document.getAttachments(), document.getFieldObjects()]);
  const rawInfo = metadataResult.status === "fulfilled" ? metadataResult.value.info as Record<string, unknown> : {};
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawInfo)) if (["string","number","boolean"].includes(typeof value)) metadata[key] = String(value);
  const outline = outlineResult.status === "fulfilled" ? outlineResult.value : null;
  const countOutline = (items: any[] | null): number => items ? items.reduce((sum, item) => sum + 1 + countOutline(item.items ?? null), 0) : 0;
  const attachments = attachmentsResult.status === "fulfilled" ? attachmentsResult.value : null;
  const fields = fieldsResult.status === "fulfilled" ? fieldsResult.value : null;
  let formFieldCount = 0; if (fields) for (const value of Object.values(fields)) formFieldCount += Array.isArray(value) ? value.length : 0;
  const pages: DetailedPageInspection[] = [];
  const uniqueFonts = new Set<string>();
  const ops = (pdfjs as any).OPS ?? {};
  const imageCodes = new Set([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject, ops.paintSolidColorImageMask].filter((value: unknown) => typeof value === "number"));
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    if (signal?.aborted) throw new DOMException("Inspection cancelled.", "AbortError");
    const page = await document.getPage(pageNumber);
    try {
      const viewport = page.getViewport({ scale: 1 });
      const [text, operatorList, annotations] = await Promise.all([page.getTextContent({ includeMarkedContent: false }), page.getOperatorList(), page.getAnnotations({ intent: "display" })]);
      const fontNames = Object.keys(text.styles ?? {}); fontNames.forEach((font) => uniqueFonts.add(font));
      let textCharacters = 0; for (const item of text.items) if ("str" in item) textCharacters += item.str.length;
      let imageOperations = 0; for (const code of operatorList.fnArray) if (imageCodes.has(code)) imageOperations += 1;
      let linkCount = 0, widgetCount = 0, annotationCount = 0;
      for (const annotation of annotations) { if (annotation.subtype === "Link") linkCount += 1; else if (annotation.subtype === "Widget") widgetCount += 1; else annotationCount += 1; }
      pages.push({ pageNumber, width: viewport.width, height: viewport.height, rotation: viewport.rotation, textCharacters, fontNames, imageOperations, annotationCount, linkCount, widgetCount });
    } finally { page.cleanup(); }
    onProgress?.(pageNumber, document.numPages);
    if (pageNumber % 5 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return {
    pageCount: document.numPages, metadata, outlineEntries: countOutline(outline), attachmentCount: attachments ? Object.keys(attachments).length : 0, formFieldCount, pages,
    totals: { textCharacters: pages.reduce((s,p)=>s+p.textCharacters,0), uniqueFonts: uniqueFonts.size, imageOperations: pages.reduce((s,p)=>s+p.imageOperations,0), annotations: pages.reduce((s,p)=>s+p.annotationCount,0), links: pages.reduce((s,p)=>s+p.linkCount,0), widgets: pages.reduce((s,p)=>s+p.widgetCount,0) }
  };
}
