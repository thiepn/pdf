import { assemblePdfPages, type AssemblyEnginePage, type AssemblyEngineSource } from "../tools/assemblyEngine";
import * as mupdf from "mupdf";
interface CompileRequest { type: "COMPILE_PLAN"; requestId: string; bytes: ArrayBuffer; pages: Array<{ sourcePageIndex: number; rotation: 0 | 90 | 180 | 270 }>; password?: string }
interface MergeRequest { type: "MERGE"; requestId: string; sources: Array<{ name: string; bytes: ArrayBuffer; password?: string }> }
interface CancelRequest { type: "CANCEL"; requestId: string }
interface AssemblyRequest { type: "ASSEMBLE"; requestId: string; sources: AssemblyEngineSource[]; pages: AssemblyEnginePage[] }
type Request = CompileRequest | MergeRequest | AssemblyRequest | CancelRequest;
const cancelled = new Set<string>();
function assertActive(requestId: string): void { if (cancelled.has(requestId)) throw new DOMException("Operation cancelled.", "AbortError"); }
function rotatePage(pdf: any, pageIndex: number, delta: number): void {
  if (!delta) return;
  const page = pdf.loadPage(pageIndex);
  try {
    const pageObject = page.getObject(); const inherited = pageObject.getInheritable("Rotate");
    const current = inherited && typeof inherited.asNumber === "function" ? inherited.asNumber() : 0;
    pageObject.put("Rotate", ((current + delta) % 360 + 360) % 360);
  } finally { page.destroy(); }
}
function copyMetadata(source: any, destination: any): void {
  for (const key of ["Title", "Author", "Subject", "Keywords", "Creator", "Producer"]) {
    const value = source.getMetaData(`info:${key}`); if (typeof value === "string" && value) destination.setMetaData(`info:${key}`, value);
  }
}
function save(pdf: mupdf.PDFDocument): Uint8Array {
  const buffer = pdf.saveToBuffer("garbage=2,compress=yes");
  try {
    const bytes = Uint8Array.from(buffer.asUint8Array());
    const verified = mupdf.Document.openDocument(bytes, "application/pdf");
    try {
      if (verified.countPages() !== pdf.countPages()) throw new Error("The saved PDF page count did not match the requested output.");
    } finally { verified.destroy(); }
    return bytes;
  } finally { buffer.destroy(); }
}
function postResult(requestId: string, output: Uint8Array, pageCount: number, startedAt: number, warnings: string[]): void {
  const outputBuffer = Uint8Array.from(output).buffer;
  self.postMessage({ type: "PAGE_OPERATION_RESULT", requestId, output: outputBuffer, result: { pageCount, outputBytes: output.byteLength, durationMs: performance.now() - startedAt, warnings } }, [outputBuffer]);
}
self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "CANCEL") { cancelled.add(request.requestId); return; }
  const startedAt = performance.now();
  try {
    assertActive(request.requestId);
    if (request.type === "ASSEMBLE") {
      const output = assemblePdfPages(request.sources, request.pages);
      postResult(request.requestId, output, request.pages.length, startedAt, ["Page content and selectable text are retained. Document-level bookmarks, attachments, complex form relationships and digital signatures may not survive page assembly."]);
    } else if (request.type === "COMPILE_PLAN") {
      if (!request.pages.length) throw new Error("A PDF must contain at least one page.");
      const source = mupdf.Document.openDocument(request.bytes, "application/pdf");
      try {
        if (source.needsPassword() && (!request.password || source.authenticatePassword(request.password) === 0)) throw new Error("The PDF password is required or incorrect.");
        const sourcePdf = source.asPDF(); if (!sourcePdf) throw new Error("MuPDF did not recognize the source document as a PDF.");
        const destination = new mupdf.PDFDocument();
        try {
          copyMetadata(sourcePdf, destination);
          for (let index = 0; index < request.pages.length; index += 1) {
            assertActive(request.requestId); const plan = request.pages[index];
            if (plan.sourcePageIndex < 0 || plan.sourcePageIndex >= sourcePdf.countPages()) throw new Error(`Source page ${plan.sourcePageIndex + 1} does not exist.`);
            destination.graftPage(-1, sourcePdf, plan.sourcePageIndex); rotatePage(destination, index, plan.rotation);
          }
          const output = save(destination);
          postResult(request.requestId, output, destination.countPages(), startedAt, ["This page compiler preserves page appearance and annotations, but document-level outlines, attachments, signatures, and complex form relationships may not survive a rebuilt page tree."]);
        } finally { destination.destroy(); }
      } finally { source.destroy(); }
    } else {
      if (!request.sources.length) throw new Error("Select at least one PDF.");
      const destination = new mupdf.PDFDocument();
      try {
        for (const sourceData of request.sources) {
          assertActive(request.requestId); const source = mupdf.Document.openDocument(sourceData.bytes, "application/pdf");
          try {
            if (source.needsPassword() && (!sourceData.password || source.authenticatePassword(sourceData.password) === 0)) throw new Error(`The PDF password is required or incorrect: ${sourceData.name}`);
            const sourcePdf = source.asPDF(); if (!sourcePdf) throw new Error(`MuPDF did not recognize ${sourceData.name} as a PDF.`);
            if (destination.countPages() === 0) copyMetadata(sourcePdf, destination);
            for (let page = 0; page < sourcePdf.countPages(); page += 1) { assertActive(request.requestId); destination.graftPage(-1, sourcePdf, page); }
          } finally { source.destroy(); }
        }
        const output = save(destination);
        postResult(request.requestId, output, destination.countPages(), startedAt, ["Merged pages preserve visual content, page annotations, and resources. Source-level bookmarks, signatures, attachments, and duplicate form-field relationships require later preservation work."]);
      } finally { destination.destroy(); }
    }
  } catch (error) {
    self.postMessage({ type: "PAGE_OPERATION_ERROR", requestId: request.requestId, error: error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError", message: String(error) } });
  } finally { cancelled.delete(request.requestId); }
};
export {};
