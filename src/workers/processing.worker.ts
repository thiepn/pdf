import * as mupdf from "mupdf";

interface OptimizeRequest { type: "OPTIMIZE"; requestId: string; bytes: ArrayBuffer; password?: string; removeMetadata?: boolean }
interface RepairRequest { type: "REPAIR"; requestId: string; bytes: ArrayBuffer; password?: string }
interface CancelRequest { type: "CANCEL"; requestId: string }
type Request = OptimizeRequest | RepairRequest | CancelRequest;
const cancelled = new Set<string>();
function active(id: string) { if (cancelled.has(id)) throw new DOMException("Operation cancelled.", "AbortError"); }
function authenticate(document: any, password?: string) { if (document.needsPassword() && (!password || document.authenticatePassword(password) === 0)) throw new Error("The PDF password is required or incorrect."); }
function clearMetadata(pdf: any) { for (const key of ["Title","Author","Subject","Keywords","Creator","Producer","CreationDate","ModDate"]) { try { pdf.setMetaData(`info:${key}`, ""); } catch {} } try { pdf.getTrailer?.()?.delete?.("Info"); } catch {} }
function save(pdf: any): Uint8Array {
  pdf.check?.();
  let buffer: any;
  try { buffer = pdf.saveToBuffer("garbage=4,clean=yes,compress=yes,compress-images=yes,compress-fonts=yes"); }
  catch { buffer = pdf.saveToBuffer("garbage=2,compress=yes"); }
  try { return new Uint8Array(buffer.asUint8Array()); } finally { buffer.destroy(); }
}
self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "CANCEL") { cancelled.add(request.requestId); return; }
  const startedAt = performance.now();
  try {
    active(request.requestId);
    const document = mupdf.Document.openDocument(request.bytes, "application/pdf");
    try {
      authenticate(document, request.password);
      const pdf = document.asPDF();
      if (!pdf) throw new Error("The input is not a PDF.");
      const repaired = Boolean(pdf.wasRepaired?.());
      const versionsBefore = Number(pdf.countVersions?.() ?? 1);
      if (request.type === "OPTIMIZE" && request.removeMetadata) clearMetadata(pdf);
      const output = save(pdf);
      active(request.requestId);
      const transferable = Uint8Array.from(output).buffer;
      self.postMessage({ type: "PROCESSING_RESULT", requestId: request.requestId, output: transferable, report: { operation: request.type.toLowerCase(), inputBytes: request.bytes.byteLength, outputBytes: output.byteLength, repaired, versionsBefore, durationMs: performance.now() - startedAt, warnings: repaired ? ["MuPDF repaired the source structure while opening it."] : [] } }, [transferable]);
    } finally { document.destroy(); }
  } catch (error) {
    self.postMessage({ type: "PROCESSING_ERROR", requestId: request.requestId, error: { name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) } });
  } finally { cancelled.delete(request.requestId); }
};
export {};
