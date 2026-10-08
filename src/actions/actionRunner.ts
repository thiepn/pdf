import { inspectPdfBytes, openPdfWithPdfJs } from "../engines/pdfjs";
import { compilePagePlan } from "../tools/pageOperationsClient";
import { optimizePdf } from "../processing/processingClient";
import { rasterCompressPdf, rasterTransformPdf, RASTER_PROFILES } from "../processing/rasterCompression";
import { transformPdf } from "../toolbox/toolboxClient";
import { exportPdfImagesZip, exportPdfSplitZip } from "../toolbox/exporters";
import { mmToPt } from "../toolbox/toolboxModel";
import {
  getHeadlessAction, planHeadlessActions, validateActionRequest,
  type ActionRequest, type ActionOutputKind
} from "./actionCatalog";

export interface HeadlessActionResult {
  bytes: Uint8Array;
  mimeType: "application/pdf" | "application/zip";
  extension: ".pdf" | ".zip";
  kind: ActionOutputKind;
  pageCount: number | null;
  inputBytes: number;
  outputBytes: number;
  durationMs: number;
  warnings: string[];
}
export interface HeadlessSequenceResult extends HeadlessActionResult {
  actionReports: Array<{ actionId: string; durationMs: number; inputBytes: number; outputBytes: number; warnings: string[] }>;
}
export interface HeadlessExecutionOptions {
  signal: AbortSignal;
  /** Called with 0..1 for the active action. */
  onProgress?: (progress: number, detail: string) => void;
  /** Skip redundant source PDF inspection when the previous action was just validated. */
  knownPageCount?: number;
}
const MAX_ACTION_OUTPUT_BYTES = 256 * 1024 * 1024;
function cancelled(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException("PDF operation cancelled.", "AbortError");
}
function readNumber(params: Record<string, unknown>, key: string): number { return params[key] as number; }
function readString(params: Record<string, unknown>, key: string): string { return params[key] as string; }
function checkBytes(output: Uint8Array): void {
  if (!(output instanceof Uint8Array) || !output.byteLength) throw new Error("PDF action returned no output.");
  if (output.byteLength > MAX_ACTION_OUTPUT_BYTES) throw new Error("Action output exceeds the 256 MB browser safety limit.");
}
export async function runHeadlessAction(
  source: Uint8Array,
  untrustedRequest: unknown,
  options: HeadlessExecutionOptions
): Promise<HeadlessActionResult> {
  const { signal, onProgress } = options;
  cancelled(signal);
  const request = validateActionRequest(untrustedRequest);
  const action = getHeadlessAction(request.actionId);
  const missing = action.risks.filter(risk => !request.approvedRisks?.includes(risk));
  if (missing.length) throw new Error(`Explicit permission required for: ${missing.join(", ")}.`);
  if (!(source instanceof Uint8Array) || !source.length) throw new Error("Input must be nonempty PDF bytes.");
  const start = performance.now();
  const inputPageCount = options.knownPageCount ?? (await inspectPdfBytes(source)).pageCount;
  if (!Number.isSafeInteger(inputPageCount) || inputPageCount <= 0) throw new Error("Source PDF has no valid pages.");
  cancelled(signal);
  const params = request.params;
  onProgress?.(0, action.label);
  let output: Uint8Array;
  const warnings: string[] = [];
  switch (request.actionId) {
    case "pdf.rotate": {
      const pages = Array.from({length:inputPageCount},(_,sourcePageIndex)=>({sourcePageIndex,rotation:readNumber(params,"degrees") as 90|180|270}));
      output = (await compilePagePlan(source,pages,signal)).bytes;
      break;
    }
    case "pdf.optimize": {
      const result = await optimizePdf(source,{},signal);
      output = result.bytes;
      warnings.push(...result.report.warnings);
      break;
    }
    case "pdf.metadata.remove": {
      output = (await transformPdf(source,{removeMetadata:true},undefined,signal)).bytes;
      break;
    }
    case "pdf.crop": {
      output = (await transformPdf(source,{crop:{enabled:true,
        topPt:mmToPt(readNumber(params,"topMm")),rightPt:mmToPt(readNumber(params,"rightMm")),
        bottomPt:mmToPt(readNumber(params,"bottomMm")),leftPt:mmToPt(readNumber(params,"leftMm"))
      }},undefined,signal)).bytes;
      break;
    }
    case "pdf.decorate": {
      output = (await transformPdf(source,{decoration:{enabled:true,
        watermarkText:readString(params,"watermarkText"),headerText:readString(params,"headerText"),footerText:readString(params,"footerText"),
        pageNumbers:params.pageNumbers as boolean,startNumber:readNumber(params,"startNumber"),fontSize:10,
        marginPt:mmToPt(10),fontLanguage:(params.fontLanguage as "auto"|"ko"|"ja"|"zh-Hans"|"zh-Hant"|undefined)??"auto"
      }},undefined,signal)).bytes;
      break;
    }
    case "pdf.pages.blank": {
      output = (await transformPdf(source,{blankPages:{enabled:true,
        position:readString(params,"position") as "start"|"end",count:readNumber(params,"count"),
        widthPt:mmToPt(readNumber(params,"widthMm")),heightPt:mmToPt(readNumber(params,"heightMm"))
      }},undefined,signal)).bytes;
      break;
    }
    case "pdf.raster.compress":
    case "pdf.raster.grayscale": {
      const pdf = await openPdfWithPdfJs(source);
      try {
        const profile = RASTER_PROFILES.find(value=>value.id===params.profile);
        if (!profile) throw new Error("Unknown raster profile.");
        const progress = (done:number,total:number) => onProgress?.(Math.min(0.95,done/total),`${action.label} · ${done}/${total}`);
        output = request.actionId==="pdf.raster.grayscale"
          ? await rasterTransformPdf(pdf,profile,{grayscale:true},signal,progress)
          : await rasterCompressPdf(pdf,profile,signal,progress);
      } finally { await pdf.loadingTask.destroy(); }
      warnings.push("Rasterization removes selectable text, vectors, forms, and most interactive PDF features.");
      break;
    }
    case "pdf.split.fixed":
      output = await exportPdfSplitZip(source,readNumber(params,"pagesPerFile"),undefined,signal,(done,total)=>onProgress?.(Math.min(.95,done/total),`${action.label} · ${done}/${total}`));
      break;
    case "pdf.pages.images": {
      const scale = params.quality==="compact" ? 1 : params.quality==="high" ? 2 : 1.5;
      output = await exportPdfImagesZip(source,scale,signal,(done,total)=>onProgress?.(Math.min(.95,done/total),`${action.label} · ${done}/${total}`));
      break;
    }
  }
  cancelled(signal);
  checkBytes(output);
  let pageCount: number | null = null;
  if (action.outputKind === "pdf") {
    const info = await inspectPdfBytes(output);
    pageCount = info.pageCount;
    const expected = inputPageCount + (request.actionId==="pdf.pages.blank" ? readNumber(params,"count") : 0);
    if (pageCount !== expected) throw new Error(`PDF action page validation failed: expected ${expected} pages but got ${pageCount}.`);
  } else if (output[0]!==0x50 || output[1]!==0x4b || output[2]!==3 || output[3]!==4) {
    throw new Error("Terminal PDF action produced an invalid ZIP header.");
  }
  cancelled(signal);
  onProgress?.(1,action.label);
  return {
    bytes:output,mimeType:action.outputMime,extension:action.outputKind==="pdf"?".pdf":".zip",
    kind:action.outputKind,pageCount,inputBytes:source.length,outputBytes:output.byteLength,
    durationMs:performance.now()-start,warnings
  };
}
/** Caller must explicitly acknowledge destructive changes per command; no UI or filesystem side effects. */
export async function runHeadlessSequence(
  source: Uint8Array, rawActions: readonly unknown[], options: Omit<HeadlessExecutionOptions,"knownPageCount">
): Promise<HeadlessSequenceResult> {
  const plan=planHeadlessActions(rawActions);
  if (!plan.approved) throw new Error(`Explicit risk approval required: ${plan.requiredRisks.join(", ")}.`);
  const actions=rawActions.map(validateActionRequest);
  cancelled(options.signal);
  let bytes=source;
  let pageCount: number|undefined;
  let last:HeadlessActionResult|undefined;
  const actionReports:HeadlessSequenceResult["actionReports"]=[];
  for (const [index,request] of actions.entries()) {
    cancelled(options.signal);
    last=await runHeadlessAction(bytes,request,{
      signal:options.signal,knownPageCount:pageCount,
      onProgress:(stepProgress,detail)=>options.onProgress?.((index+stepProgress)/actions.length,detail)
    });
    actionReports.push({actionId:request.actionId,durationMs:last.durationMs,inputBytes:last.inputBytes,outputBytes:last.outputBytes,warnings:[...last.warnings]});
    bytes=last.bytes;
    pageCount=last.pageCount??undefined;
  }
  if (!last) throw new Error("At least one action is required.");
  return {...last,actionReports};
}
