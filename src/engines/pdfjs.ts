import { recordRuntimeMetric } from "../performance/runtimeMetrics";
import * as base from "./pdfjsBase";

export type PdfJsDocument = Awaited<ReturnType<typeof base.openPdfWithPdfJs>>;
export type PdfJsPage = Awaited<ReturnType<PdfJsDocument["getPage"]>>;
export type PdfAnnotationInventory = base.PdfAnnotationInventory;
export type SearchOptions = base.SearchOptions;
export type PdfSearchResult = base.PdfSearchResult;
export type DetailedPageInspection = base.DetailedPageInspection;
export type DetailedPdfInspection = base.DetailedPdfInspection;

export const inspectPdfBytes = base.inspectPdfBytes;
export const inspectPdfAnnotationInventory = base.inspectPdfAnnotationInventory;
export const inspectDetailedPdf = base.inspectDetailedPdf;
export const multiplyTransforms = base.multiplyTransforms;

const SESSION_IDLE_MS = 30_000;

interface PdfPageGeometry {
  width: number;
  height: number;
  rotation: number;
}

interface SharedPdfEntry {
  owner: Map<string, SharedPdfEntry>;
  key: string;
  promise: Promise<PdfJsDocument>;
  document?: PdfJsDocument;
  references: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  textCache: Map<number, Promise<string>>;
  geometryCache: Map<number, Promise<PdfPageGeometry>>;
}

const sessionsByBytes = new WeakMap<Uint8Array, Map<string, SharedPdfEntry>>();
const entryByLease = new WeakMap<object, SharedPdfEntry>();

function sessionKey(password?: string): string {
  return password ? `protected:${password}` : "unprotected";
}

function clearIdleTimer(entry: SharedPdfEntry): void {
  if (entry.idleTimer !== null) clearTimeout(entry.idleTimer);
  entry.idleTimer = null;
}

function releaseLease(entry: SharedPdfEntry): void {
  entry.references = Math.max(0, entry.references - 1);
  if (entry.references || entry.idleTimer !== null) return;
  entry.idleTimer = setTimeout(() => {
    entry.idleTimer = null;
    if (entry.references) return;
    entry.owner.delete(entry.key);
    entry.textCache.clear();
    entry.geometryCache.clear();
    const document = entry.document;
    entry.document = undefined;
    if (document) void document.loadingTask.destroy().catch(() => undefined);
  }, SESSION_IDLE_MS);
}

function bindValue<T extends object>(target: T, property: PropertyKey): unknown {
  const value = Reflect.get(target, property, target);
  return typeof value === "function" ? value.bind(target) : value;
}

function createDocumentLease(entry: SharedPdfEntry): PdfJsDocument {
  const document = entry.document;
  if (!document) throw new Error("Shared PDF session is not ready.");
  clearIdleTimer(entry);
  entry.references += 1;
  let released = false;
  const loadingTask = new Proxy(document.loadingTask, {
    get(target, property) {
      if (property === "destroy") {
        return async () => {
          if (released) return;
          released = true;
          releaseLease(entry);
        };
      }
      return bindValue(target, property);
    }
  });
  const lease = new Proxy(document, {
    get(target, property) {
      if (property === "loadingTask") return loadingTask;
      return bindValue(target, property);
    }
  }) as PdfJsDocument;
  entryByLease.set(lease as object, entry);
  return lease;
}

/**
 * Recovery P2 keeps one parsed PDF.js document alive while the user moves among
 * document modes. Individual mode components receive lightweight leases; their
 * existing cleanup calls release only that lease instead of destroying the
 * underlying parser/worker between Read, Edit and Pages.
 */
export async function openPdfWithPdfJs(bytes: Uint8Array, password?: string): Promise<PdfJsDocument> {
  let sessions = sessionsByBytes.get(bytes);
  if (!sessions) {
    sessions = new Map();
    sessionsByBytes.set(bytes, sessions);
  }
  const key = sessionKey(password);
  let entry = sessions.get(key);
  if (entry) {
    clearIdleTimer(entry);
    recordRuntimeMetric("pdf", "pdfjs.session.hit", 0, undefined, {
      byteLength: bytes.byteLength,
      passwordProtected: Boolean(password)
    });
  } else {
    const owner = sessions;
    entry = {
      owner,
      key,
      promise: Promise.resolve(undefined as unknown as PdfJsDocument),
      references: 0,
      idleTimer: null,
      textCache: new Map(),
      geometryCache: new Map()
    };
    entry.promise = base.openPdfWithPdfJs(bytes, password)
      .then((document) => {
        entry!.document = document;
        return document;
      })
      .catch((reason) => {
        owner.delete(key);
        throw reason;
      });
    sessions.set(key, entry);
    recordRuntimeMetric("pdf", "pdfjs.session.miss", 0, undefined, {
      byteLength: bytes.byteLength,
      passwordProtected: Boolean(password)
    });
  }
  await entry.promise;
  return createDocumentLease(entry);
}

/** Cache extracted page text for the lifetime of the shared parsed document. */
export async function extractPageText(document: PdfJsDocument, pageNumber: number): Promise<string> {
  const entry = entryByLease.get(document as object);
  if (!entry) return base.extractPageText(document, pageNumber);
  const cached = entry.textCache.get(pageNumber);
  if (cached) {
    recordRuntimeMetric("render", "pdfjs.pageText.hit", 0, undefined, { pageNumber });
    return cached;
  }
  const pending = base.extractPageText(document, pageNumber).catch((reason) => {
    entry.textCache.delete(pageNumber);
    throw reason;
  });
  entry.textCache.set(pageNumber, pending);
  recordRuntimeMetric("render", "pdfjs.pageText.miss", 0, undefined, { pageNumber });
  return pending;
}

/**
 * Page geometry is tiny but requested by several document tools. Keep it beside
 * text in the same session instead of asking PDF.js to rebuild it per tool.
 */
export async function getPdfPageGeometry(document: PdfJsDocument, pageNumber: number): Promise<PdfPageGeometry> {
  const entry = entryByLease.get(document as object);
  if (!entry) return readPageGeometry(document, pageNumber);
  const cached = entry.geometryCache.get(pageNumber);
  if (cached) {
    recordRuntimeMetric("render", "pdfjs.pageGeometry.hit", 0, undefined, { pageNumber });
    return cached;
  }
  const pending = readPageGeometry(document, pageNumber).catch((reason) => {
    entry.geometryCache.delete(pageNumber);
    throw reason;
  });
  entry.geometryCache.set(pageNumber, pending);
  recordRuntimeMetric("render", "pdfjs.pageGeometry.miss", 0, undefined, { pageNumber });
  return pending;
}

async function readPageGeometry(document: PdfJsDocument, pageNumber: number): Promise<PdfPageGeometry> {
  const page = await document.getPage(pageNumber);
  try {
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height, rotation: viewport.rotation };
  } finally {
    page.cleanup();
  }
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
