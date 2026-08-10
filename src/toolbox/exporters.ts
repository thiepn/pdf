import { extractPageText, inspectPdfBytes, openPdfWithPdfJs } from "../engines/pdfjs";
import { compilePagePlan } from "../tools/pageOperationsClient";
import { normalizePagesPerSplit } from "./toolboxModel";
import { createStoredZip } from "./zip";

function escapeHtml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;"); }

export async function exportPdfText(bytes: Uint8Array, password?: string): Promise<string> {
  const pdf = await openPdfWithPdfJs(bytes, password);
  try { const pages: string[] = []; for (let page = 1; page <= pdf.numPages; page += 1) pages.push(await extractPageText(pdf, page)); return pages.join("\n\n--- Page break ---\n\n"); }
  finally { await pdf.destroy(); }
}
export async function exportPdfMarkdown(bytes: Uint8Array, title = "PDF export", password?: string): Promise<string> {
  const pdf = await openPdfWithPdfJs(bytes, password);
  try { const pages: string[] = [`# ${title}`]; for (let page = 1; page <= pdf.numPages; page += 1) { const text = (await extractPageText(pdf, page)).trim(); pages.push(`\n## Page ${page}\n\n${text || "_No extractable text on this page._"}`); } return pages.join("\n"); }
  finally { await pdf.destroy(); }
}
export async function exportPdfHtml(bytes: Uint8Array, title = "PDF export", password?: string): Promise<string> {
  const pdf = await openPdfWithPdfJs(bytes, password);
  try { const sections: string[] = []; for (let page = 1; page <= pdf.numPages; page += 1) { const text = (await extractPageText(pdf, page)).trim(); sections.push(`<section class="page"><h2>Page ${page}</h2><pre>${escapeHtml(text)}</pre></section>`); } return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#111}.page{padding:24px 0;border-bottom:1px solid #ddd}pre{white-space:pre-wrap;font:inherit}</style></head><body><h1>${escapeHtml(title)}</h1>${sections.join("")}</body></html>`; }
  finally { await pdf.destroy(); }
}

async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> { const blob = await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("Could not encode PNG.")),"image/png")); return new Uint8Array(await blob.arrayBuffer()); }
export async function exportPdfImagesZip(bytes: Uint8Array, scale = 2, signal?: AbortSignal, onProgress?: (done:number,total:number)=>void, password?: string): Promise<Uint8Array> {
  const pdf = await openPdfWithPdfJs(bytes, password);
  try {
    const files: Array<{ name:string; bytes:Uint8Array }> = [];
    for (let pageNumber=1; pageNumber<=pdf.numPages; pageNumber+=1) {
      if (signal?.aborted) throw new DOMException("Operation cancelled.","AbortError");
      const page=await pdf.getPage(pageNumber);
      try {
        const viewport=page.getViewport({scale});
        const canvas=window.document.createElement("canvas");
        canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
        const context=canvas.getContext("2d",{alpha:false}); if(!context) throw new Error("Canvas rendering is unavailable.");
        await page.render({canvasContext:context,viewport,canvas}).promise;
        files.push({name:`page-${String(pageNumber).padStart(4,"0")}.png`,bytes:await canvasPng(canvas)});
      } finally { page.cleanup?.(); }
      onProgress?.(pageNumber,pdf.numPages);
    }
    return createStoredZip(files);
  } finally { await pdf.destroy(); }
}


export async function exportPdfSplitZip(
  bytes: Uint8Array,
  pagesPerFile: number,
  password?: string,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void
): Promise<Uint8Array> {
  const summary = await inspectPdfBytes(bytes, password);
  const chunkSize = normalizePagesPerSplit(pagesPerFile);
  const total = Math.ceil(summary.pageCount / chunkSize);
  const files: Array<{ name: string; bytes: Uint8Array }> = [];
  for (let chunk = 0; chunk < total; chunk += 1) {
    if (signal?.aborted) throw new DOMException("Operation cancelled.", "AbortError");
    const first = chunk * chunkSize;
    const lastExclusive = Math.min(summary.pageCount, first + chunkSize);
    const pages = Array.from({ length: lastExclusive - first }, (_, index) => ({ sourcePageIndex: first + index, rotation: 0 as const }));
    const compiled = await compilePagePlan(bytes, pages, signal, password);
    if (compiled.pageCount !== pages.length) throw new Error(`Split validation failed for part ${chunk + 1}.`);
    const start = String(first + 1).padStart(4, "0");
    const end = String(lastExclusive).padStart(4, "0");
    files.push({ name: `pages-${start}-${end}.pdf`, bytes: compiled.bytes });
    onProgress?.(chunk + 1, total);
  }
  return createStoredZip(files);
}
