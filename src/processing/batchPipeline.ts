import { inspectPdfBytes, openPdfWithPdfJs } from "../engines/pdfjs";
import { optimizePdf } from "./processingClient";
import { rasterCompressPdf, rasterTransformPdf, RASTER_PROFILES } from "./rasterCompression";
import { compilePagePlan } from "../tools/pageOperationsClient";
import { transformPdf } from "../toolbox/toolboxClient";
import { exportPdfImagesZip, exportPdfSplitZip } from "../toolbox/exporters";
import type { BatchRecipe } from "../types/batch";
import { batchStepLabel, normalizeBatchBlankPageCount } from "./batchModel";
import { mmToPt } from "../toolbox/toolboxModel";

export { batchStepLabel, defaultBatchStep } from "./batchModel";

export interface BatchRunArtifact {
  bytes: Uint8Array;
  mimeType: "application/pdf" | "application/zip";
  extension: ".pdf" | ".zip";
  kind: "pdf" | "split-zip" | "images-zip";
}

export async function runBatchRecipe(bytes: Uint8Array, recipe: BatchRecipe, signal: AbortSignal, onProgress?: (progress:number,message:string)=>void): Promise<BatchRunArtifact> {
  const initial = await inspectPdfBytes(bytes); let output = bytes; let expectedPages = initial.pageCount;
  const total = Math.max(1, recipe.steps.length);
  for (let index=0; index<recipe.steps.length; index+=1) {
    if (signal.aborted) throw new DOMException("Operation cancelled.", "AbortError");
    const step = recipe.steps[index]; const base = index/total; onProgress?.(base,batchStepLabel(step));
    const terminal = step.type === "split-fixed" || step.type === "page-images";
    if (terminal && index !== recipe.steps.length - 1) throw new Error("Multi-output Batch steps must be the final recipe step.");
    if (step.type === "rotate") {
      const info = await inspectPdfBytes(output); output = (await compilePagePlan(output,Array.from({length:info.pageCount},(_,page)=>({sourcePageIndex:page,rotation:step.degrees})),signal)).bytes;
    } else if (step.type === "optimize") output = (await optimizePdf(output,{},signal)).bytes;
    else if (step.type === "remove-metadata") output = (await transformPdf(output,{removeMetadata:true},undefined,signal)).bytes;
    else if (step.type === "crop") output = (await transformPdf(output,{crop:{enabled:true,topPt:mmToPt(step.topMm),rightPt:mmToPt(step.rightMm),bottomPt:mmToPt(step.bottomMm),leftPt:mmToPt(step.leftMm)}},undefined,signal)).bytes;
    else if (step.type === "decorate") output = (await transformPdf(output,{decoration:{enabled:true,watermarkText:step.watermarkText,headerText:step.headerText,footerText:step.footerText,pageNumbers:step.pageNumbers,startNumber:step.startNumber,fontSize:10,marginPt:mmToPt(10),fontLanguage:step.fontLanguage ?? "auto"}},undefined,signal)).bytes;
    else if (step.type === "blank-pages") { const count = normalizeBatchBlankPageCount(step.count); output = (await transformPdf(output,{blankPages:{enabled:true,position:step.position,count,widthPt:mmToPt(step.widthMm),heightPt:mmToPt(step.heightMm)}},undefined,signal)).bytes; expectedPages += count; }
    else if (step.type === "raster-compress" || step.type === "grayscale") {
      const pdf = await openPdfWithPdfJs(output); try { const profile=RASTER_PROFILES.find(item=>item.id===step.profile); if(!profile) throw new Error(`Unknown raster profile: ${step.profile}`); output=step.type === "grayscale" ? await rasterTransformPdf(pdf,profile,{grayscale:true},signal,(done,count)=>onProgress?.(base+(done/count)/total,`${batchStepLabel(step)} · ${done}/${count}`)) : await rasterCompressPdf(pdf,profile,signal,(done,count)=>onProgress?.(base+(done/count)/total,`${batchStepLabel(step)} · ${done}/${count}`)); } finally { await pdf.loadingTask.destroy(); }
    } else if (step.type === "split-fixed") {
      const zip = await exportPdfSplitZip(output, step.pagesPerFile, undefined, signal, (done,count)=>onProgress?.(base+(done/count)/total,`${batchStepLabel(step)} · ${done}/${count}`));
      onProgress?.(1,batchStepLabel(step)); return { bytes: zip, mimeType: "application/zip", extension: ".zip", kind: "split-zip" };
    } else if (step.type === "page-images") {
      const scale = step.quality === "compact" ? 1 : step.quality === "high" ? 2 : 1.5;
      const zip = await exportPdfImagesZip(output, scale, signal, (done,count)=>onProgress?.(base+(done/count)/total,`${batchStepLabel(step)} · ${done}/${count}`));
      onProgress?.(1,batchStepLabel(step)); return { bytes: zip, mimeType: "application/zip", extension: ".zip", kind: "images-zip" };
    }
    onProgress?.((index+1)/total,batchStepLabel(step));
  }
  const final = await inspectPdfBytes(output); if (final.pageCount !== expectedPages) throw new Error(`Output page count ${final.pageCount} does not match expected ${expectedPages}.`);
  return { bytes: output, mimeType: "application/pdf", extension: ".pdf", kind: "pdf" };
}
