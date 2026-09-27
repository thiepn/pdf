import { assemblePdfPages, type AssemblyEnginePage, type AssemblyEngineSource } from "../tools/assemblyEngine";
import { MAX_ASSEMBLY_PAGES } from "../quick/assemblyModel";
import * as mupdf from "mupdf";
interface CompileRequest { type: "COMPILE_PLAN"; requestId: string; bytes: ArrayBuffer; pages: Array<{ sourcePageIndex: number; rotation: 0 | 90 | 180 | 270 }>; password?: string }
interface MergeRequest { type: "MERGE"; requestId: string; sources: Array<{ name: string; bytes: ArrayBuffer; password?: string }> }
interface CancelRequest { type: "CANCEL"; requestId: string }
interface AssemblyRequest { type: "ASSEMBLE"; requestId: string; sources: AssemblyEngineSource[]; pages: AssemblyEnginePage[] }
type Request = CompileRequest | MergeRequest | AssemblyRequest | CancelRequest;
const cancelled = new Set<string>();
function assertActive(requestId: string): void { if (cancelled.has(requestId)) throw new DOMException("Operation cancelled.", "AbortError"); }
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
    const warnings = ["Page content, standard annotations, supported form fields and web links are retained. Links to omitted pages and executable actions are not copied. Document-level bookmarks, attachments, layers, scripts and advanced form behavior require review; source digital signatures cannot remain valid after assembly."];
    if (request.type === "ASSEMBLE") {
      const output = assemblePdfPages(request.sources, request.pages);
      postResult(request.requestId, output, request.pages.length, startedAt, warnings);
    } else if (request.type === "COMPILE_PLAN") {
      const pages = request.pages.map((page) => ({ ...page, sourceIndex: 0 }));
      const output = assemblePdfPages([{ name: "Source PDF", bytes: request.bytes, password: request.password }], pages);
      postResult(request.requestId, output, pages.length, startedAt, warnings);
    } else {
      if (!request.sources.length) throw new Error("Select at least one PDF.");
      const pages: AssemblyEnginePage[] = [];
      for (const [sourceIndex, input] of request.sources.entries()) {
        assertActive(request.requestId);
        const document = mupdf.Document.openDocument(input.bytes, "application/pdf");
        try {
          if (document.needsPassword() && (!input.password || !document.authenticatePassword(input.password))) throw new Error(`The PDF password is required or incorrect: ${input.name}`);
          if (pages.length + document.countPages() > MAX_ASSEMBLY_PAGES) throw new Error(`Arrange up to ${MAX_ASSEMBLY_PAGES} pages at a time.`);
          for (let sourcePageIndex = 0; sourcePageIndex < document.countPages(); sourcePageIndex++) pages.push({ sourceIndex, sourcePageIndex, rotation: 0 });
        } finally { document.destroy(); }
      }
      const output = assemblePdfPages(request.sources, pages);
      postResult(request.requestId, output, pages.length, startedAt, warnings);
    }
  } catch (error) {
    self.postMessage({ type: "PAGE_OPERATION_ERROR", requestId: request.requestId, error: error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError", message: String(error) } });
  } finally { cancelled.delete(request.requestId); }
};
export {};
