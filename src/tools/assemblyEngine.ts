import * as mupdf from "mupdf";
import { MAX_ASSEMBLY_PAGES } from "../quick/assemblyModel";

export interface AssemblyEnginePage { sourceIndex: number | null; sourcePageIndex: number; rotation: 0 | 90 | 180 | 270 }
export interface AssemblyEngineSource { name: string; bytes: ArrayBuffer; password?: string }
/** Copies native page objects. PDF inputs are not rasterized to make assembly easier. */
export function assemblePdfPages(sources: AssemblyEngineSource[], pages: AssemblyEnginePage[]): Uint8Array {
  if (!pages.length || pages.length > MAX_ASSEMBLY_PAGES) throw new Error(`Choose between 1 and ${MAX_ASSEMBLY_PAGES} output pages.`);
  const destination = new mupdf.PDFDocument();
  const opened: mupdf.Document[] = [];
  const maps: mupdf.PDFGraftMap[] = [];
  try {
    const documents = sources.map((source) => {
      const document = mupdf.Document.openDocument(source.bytes, "application/pdf"); opened.push(document);
      if (document.needsPassword() && (!source.password || document.authenticatePassword(source.password) === 0)) throw new Error(`Enter the password for ${source.name}.`);
      const pdf = document.asPDF(); if (!pdf) throw new Error(`${source.name} is not a PDF.`);
      maps.push(destination.newGraftMap()); return pdf;
    });
    for (const item of pages) {
      if (![0, 90, 180, 270].includes(item.rotation)) throw new Error("Invalid page rotation.");
      if (item.sourceIndex === null) {
        const resources = destination.newDictionary();
        const blank = destination.addPage([0, 0, 595.276, 841.89], item.rotation, resources, "");
        try { destination.insertPage(-1, blank); } finally { blank.destroy(); resources.destroy(); }
      } else {
        const source = documents[item.sourceIndex];
        if (!Number.isInteger(item.sourceIndex) || !source || !Number.isInteger(item.sourcePageIndex) || item.sourcePageIndex < 0 || item.sourcePageIndex >= source.countPages()) throw new Error("An output page refers to a missing source page.");
        maps[item.sourceIndex].graftPage(-1, source, item.sourcePageIndex);
        if (item.rotation) {
          const page = destination.loadPage(destination.countPages() - 1);
          try {
            const object = page.getObject(); const inherited = object.getInheritable("Rotate");
            try { object.put("Rotate", ((inherited.asNumber() + item.rotation) % 360 + 360) % 360); }
            finally { inherited.destroy(); object.destroy(); }
          } finally { page.destroy(); }
        }
      }
    }
    const buffer = destination.saveToBuffer("garbage=2,compress=yes");
    try {
      const bytes = Uint8Array.from(buffer.asUint8Array());
      const verified = mupdf.Document.openDocument(bytes, "application/pdf");
      try { if (verified.countPages() !== pages.length) throw new Error("The assembled PDF has an unexpected page count."); }
      finally { verified.destroy(); }
      return bytes;
    } finally { buffer.destroy(); }
  } finally {
    for (const map of maps) map.destroy();
    for (const document of opened) document.destroy();
    destination.destroy();
  }
}
