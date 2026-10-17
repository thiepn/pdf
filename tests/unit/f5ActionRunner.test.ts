import { beforeEach, describe, expect, it, vi } from "vitest";
import { runHeadlessAction, runHeadlessSequence } from "../../src/actions/actionRunner";
import { inspectPdfBytes } from "../../src/engines/pdfjs";
import { optimizePdf } from "../../src/processing/processingClient";
import { transformPdf } from "../../src/toolbox/toolboxClient";

vi.mock("../../src/engines/pdfjs", () => ({
  inspectPdfBytes: vi.fn(async (bytes: Uint8Array) => ({pageCount: bytes[0]})),
  openPdfWithPdfJs: vi.fn()
}));
vi.mock("../../src/processing/processingClient", () => ({
  optimizePdf: vi.fn(async (bytes: Uint8Array) => ({bytes: Uint8Array.from(bytes),report:{warnings:[]}}))
}));
vi.mock("../../src/toolbox/toolboxClient", () => ({
  transformPdf: vi.fn(async (bytes:Uint8Array, options:Record<string,any>) => {
    const copy=Uint8Array.from(bytes);
    if (options.blankPages) copy[0] += options.blankPages.count;
    return {bytes:copy};
  })
}));
vi.mock("../../src/tools/pageOperationsClient",()=>({compilePagePlan:vi.fn(async (bytes:Uint8Array)=>({bytes:Uint8Array.from(bytes)}))}));
vi.mock("../../src/processing/rasterCompression",()=>({
  RASTER_PROFILES:[{id:"screen"},{id:"balanced"},{id:"small"},{id:"print"}],
  rasterCompressPdf:vi.fn(),rasterTransformPdf:vi.fn()
}));
vi.mock("../../src/toolbox/exporters",()=>({
  exportPdfSplitZip:vi.fn(async()=>new Uint8Array([0x50,0x4b,3,4,8])),
  exportPdfImagesZip:vi.fn(async()=>new Uint8Array([0x50,0x4b,3,4,7]))
}));
const req=(actionId:string,params:Record<string,unknown>={},approvedRisks:string[]=[])=>
  ({schemaVersion:1,actionId,params,approvedRisks});
const signal=()=>new AbortController().signal;
beforeEach(()=>vi.clearAllMocks());

describe("F5 shared executor: safety and composition",()=>{
  it("reuses existing MuPDF optimizer and verifies the output PDF",async()=>{
    const source=new Uint8Array([2,10]);
    const result=await runHeadlessAction(source,req("pdf.optimize"),{signal:signal()});
    expect(result.kind).toBe("pdf");
    expect(result.pageCount).toBe(2);
    expect(result.bytes).toEqual(source);
    expect(optimizePdf).toHaveBeenCalledOnce();
    expect(inspectPdfBytes).toHaveBeenCalledTimes(2);
  });
  it("refuses destructive operations without acknowledgement before running",async()=>{
    await expect(runHeadlessAction(new Uint8Array([2,3]),req("pdf.metadata.remove"),{signal:signal()})).rejects.toThrow(/permission/);
    expect(transformPdf).not.toHaveBeenCalled();
  });
  it("executes approved metadata cleanup and blank pages, preserving page counts",async()=>{
    const inputs=[req("pdf.metadata.remove",{},["metadata-removal"]),req("pdf.pages.blank",{position:"end",count:2,widthMm:210,heightMm:297})];
    const result=await runHeadlessSequence(new Uint8Array([2,3]),inputs,{signal:signal()});
    expect(result.pageCount).toBe(4);
    expect(result.actionReports.map(x=>x.actionId)).toEqual(["pdf.metadata.remove","pdf.pages.blank"]);
    expect(result.kind).toBe("pdf");
    expect(transformPdf).toHaveBeenCalledTimes(2);
  });
  it("rejects changed page counts and never returns an invalid PDF result",async()=>{
    vi.mocked(optimizePdf).mockResolvedValueOnce({bytes:new Uint8Array([9,1]),report:{warnings:[]}} as any);
    await expect(runHeadlessAction(new Uint8Array([2,1]),req("pdf.optimize"),{signal:signal()})).rejects.toThrow(/page validation failed/);
  });
  it("rejects terminal ZIP headers that are not actual ZIP files",async()=>{
    const {exportPdfSplitZip}=await import("../../src/toolbox/exporters");
    vi.mocked(exportPdfSplitZip).mockResolvedValueOnce(new Uint8Array([2,1]) as any);
    await expect(runHeadlessAction(new Uint8Array([2,1]),req("pdf.split.fixed",{pagesPerFile:2}),{signal:signal()})).rejects.toThrow(/ZIP header/);
  });
  it("runs a valid terminal ZIP as last step",async()=>{
    const result=await runHeadlessSequence(new Uint8Array([2,3]),[
      req("pdf.optimize"),req("pdf.split.fixed",{pagesPerFile:2})
    ],{signal:signal()});
    expect(result.kind).toBe("split-zip");
    expect(result.mimeType).toBe("application/zip");
    expect(result.pageCount).toBeNull();
  });
  it("cancels before any side effects if the signal is aborted",async()=>{
    const abort=new AbortController();abort.abort();
    await expect(runHeadlessAction(new Uint8Array([2,3]),req("pdf.optimize"),{signal:abort.signal})).rejects.toBeTruthy();
    expect(optimizePdf).not.toHaveBeenCalled();
  });
  it("rejects invalid sequences in preflight before any operation",async()=>{
    await expect(runHeadlessSequence(new Uint8Array([2,3]),[
      req("pdf.split.fixed",{pagesPerFile:2}),req("pdf.optimize")
    ],{signal:signal()})).rejects.toThrow(/last action/);
    expect(optimizePdf).not.toHaveBeenCalled();
  });
  it("reports monotonic combined progress across steps",async()=>{
    const values:number[]=[];
    await runHeadlessSequence(new Uint8Array([2,3]),[req("pdf.optimize"),req("pdf.optimize")],{
      signal:signal(),onProgress:value=>values.push(value)
    });
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(1);
    for (let i=1;i<values.length;i++) expect(values[i]).toBeGreaterThanOrEqual(values[i-1]);
  });
});
