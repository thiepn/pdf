// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as mupdf from "mupdf";
import * as pdfjs from "pdfjs-dist";
// @ts-ignore Node test fixture
import { readFileSync } from "node:fs";
// @ts-ignore Node path
import { resolve } from "node:path";
// @ts-ignore Node URL
import { pathToFileURL } from "node:url";
import { validatePdfFidelity } from "../../src/fidelity/pdfFidelityClient";

declare const Buffer: { from(value: string | Uint8Array, encoding?: string): Uint8Array & { toString(encoding: string): string } };
(Promise as any).try ??= (fn: (...args: any[]) => unknown, ...args: any[]) => Promise.resolve().then(() => fn(...args));
(Uint8Array as any).fromHex ??= (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));
(Uint8Array as any).fromBase64 ??= (value: string) => Uint8Array.from(Buffer.from(value, "base64"));
(Uint8Array.prototype as any).toHex ??= function () { return Buffer.from(this).toString("hex"); };
(Uint8Array.prototype as any).toBase64 ??= function () { return Buffer.from(this).toString("base64"); };
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs")).href;

export function makePopupSource(): Uint8Array {
  const data = new Uint8Array(readFileSync("tests/corpus/generated/plain-text.pdf"));
  const doc = mupdf.Document.openDocument(data, "application/pdf").asPDF()!;
  try {
    const page = doc.loadPage(0) as mupdf.PDFPage;
    try {
      for (let i = 0; i < 2; i++) {
        const note = page.createAnnotation("Text");
        note.setRect([40 + i * 55, 90, 66 + i * 55, 121]);
        note.setContents("Original comment owner " + i);
        note.update();
      }
      // Distinct user-visible popup open states make a reciprocal swap
      // consequential even when annotation counts and note text agree.
      const annotations = page.getObject().get("Annots");
      annotations.get(2).put("Open", doc.newBoolean(true));
      annotations.get(4).put("Open", doc.newBoolean(false));
      page.update();
    } finally { page.destroy(); }
    const data = doc.saveToBuffer();
    try { return Uint8Array.from(data.asUint8Array()); } finally { data.destroy(); }
  } finally { doc.destroy(); }
}
const source = makePopupSource();
function modified(mode: "swap-popup-parents" | "swap-owner-pointers" | "unlink-parent" | "unlink-popup" | "swap-both" | "delete-comment" | "change-popup-open"): Uint8Array {
  const doc=mupdf.Document.openDocument(source,"application/pdf").asPDF()!;
  try{
    const page=doc.loadPage(0) as mupdf.PDFPage;
    try{
      const annotations=page.getObject().get("Annots");
      const note1=annotations.get(1), popup1=annotations.get(2), note2=annotations.get(3), popup2=annotations.get(4);
      if(mode==="swap-popup-parents" || mode==="swap-both"){
        popup1.put("Parent",note2);
        popup2.put("Parent",note1);
      }
      if(mode==="swap-owner-pointers" || mode==="swap-both"){
        note1.put("Popup",popup2);
        note2.put("Popup",popup1);
      }
      if(mode==="unlink-parent")popup1.delete("Parent");
      if(mode==="unlink-popup")note1.delete("Popup");
      if(mode==="change-popup-open")popup1.put("Open",doc.newBoolean(false));
      if(mode==="delete-comment"){
        const first=page.getAnnotations().find(a=>a.getContents()==="Original comment owner 0");
        if(!first)throw new Error("Missing test comment");
        page.deleteAnnotation(first);
      }
      page.update();
    }finally{page.destroy()}
    const data=doc.saveToBuffer();
    try{return Uint8Array.from(data.asUint8Array())}finally{data.destroy()}
  }finally{doc.destroy()}
}
describe("P8 popup-to-annotation association integrity",()=>{
  it("rejects popup /Parent swapped across two surviving comments",async()=>{
    const report=await validatePdfFidelity(source,modified("swap-popup-parents"),[1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/popup|association|owner/i);
  });
  it("rejects the parent comment /Popup references swapped",async()=>{
    const report=await validatePdfFidelity(source,modified("swap-owner-pointers"),[1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/popup|association|owner/i);
  });
  it("rejects orphaned popup /Parent",async()=>{
    const report=await validatePdfFidelity(source,modified("unlink-parent"),[1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/popup|association|owner/i);
  });
  it("rejects lost comment-to-popup association with unchanged page annotation count",async()=>{
    const report=await validatePdfFidelity(source,modified("unlink-popup"),[1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/popup|association|owner/i);
  });
  it("rejects a reciprocal popup ownership swap when visible popup state differs",async()=>{
    const report=await validatePdfFidelity(source,modified("swap-both"),[1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/popup|ownership/i);
  });
  it("rejects changes to popup open state without changing parent note contents",async()=>{
    const report=await validatePdfFidelity(source,modified("change-popup-open"),[1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/popup|ownership/i);
  });
  it("allows explicitly authorized removal of a comment and its popup",async()=>{
    const output=modified("delete-comment");
    const permitted=await validatePdfFidelity(source,output,[1],undefined,undefined,{
      expectations:{allowAnnotationRemovalOnAffectedPages:true}
    });
    expect(permitted.failures).toEqual([]);
    const unapproved=await validatePdfFidelity(source,output,[1]);
    expect(unapproved.passed).toBe(false);
    expect(unapproved.failures.join(" ")).toMatch(/annotation|popup/i);
  });
  it("checks popup ownership on pages containing no links",async()=>{
    const document=mupdf.Document.openDocument(source,"application/pdf").asPDF()!;
    let noLink:Uint8Array;
    try{
      const page=document.loadPage(0) as mupdf.PDFPage;
      try{
        for(const link of [...page.getLinks()])page.deleteLink(link);
        page.update();
      }finally{page.destroy()}
      const output=document.saveToBuffer();
      try{noLink=Uint8Array.from(output.asUint8Array())}finally{output.destroy()}
    }finally{document.destroy()}
    const mutated=mupdf.Document.openDocument(noLink,"application/pdf").asPDF()!;
    let damaged:Uint8Array;
    try{
      const page=mutated.loadPage(0) as mupdf.PDFPage;
      try{
        const entries=page.getObject().get("Annots");
        const popup=entries.get(1),otherOwner=entries.get(2);
        popup.put("Parent",otherOwner);
        page.update();
      }finally{page.destroy()}
      const output=mutated.saveToBuffer();
      try{damaged=Uint8Array.from(output.asUint8Array())}finally{output.destroy()}
    }finally{mutated.destroy()}
    const report=await validatePdfFidelity(noLink,damaged,[1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/popup|association|owner/i);
  });
  it("accepts unchanged valid owned popup pairs",async()=>{
    const report=await validatePdfFidelity(source,source,[1]);
    expect(report.failures).toEqual([]);
  });
});
