import { inspectPdfBytes, openPdfWithPdfJs } from "../engines/pdfjs";
import { validatePdfFidelity } from "../fidelity/pdfFidelityClient";
import { optimizePdf } from "./processingClient";
import { rasterCompressPdf, rasterTransformPdf, RASTER_PROFILES } from "./rasterCompression";
import { compressPdfToTarget } from "./targetSizeCompression";
import { compilePagePlan } from "../tools/pageOperationsClient";
import { transformPdf } from "../toolbox/toolboxClient";
import { exportPdfImagesZip, exportPdfSplitZip } from "../toolbox/exporters";
import { applySecurity } from "../security/securityClient";
import { createSecurityState } from "../security/securityModel";
import { parsePageSelection } from "../quick/quickModel";
import type { BatchRecipe } from "../types/batch";
import { batchStepLabel, normalizeBatchBlankPageCount } from "./batchModel";
import { mmToPt } from "../toolbox/toolboxModel";

export { batchStepLabel, defaultBatchStep } from "./batchModel";

export interface BatchRunArtifact {
  bytes: Uint8Array;
  mimeType: "application/pdf" | "application/zip";
  extension: ".pdf" | ".zip";
  kind: "pdf" | "split-zip" | "images-zip";
  warnings: string[];
  terminalSummary?: string;
}

function check(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Operation cancelled.", "AbortError");
}

function isPasswordError(reason: unknown): boolean {
  return /password|encrypted|authenticate/i.test(reason instanceof Error ? reason.message : String(reason));
}

async function resolveOutputPassword(bytes: Uint8Array, fallback: string | undefined, signal: AbortSignal): Promise<string | undefined> {
  check(signal);
  try {
    await inspectPdfBytes(bytes);
    return undefined;
  } catch (reason) {
    check(signal);
    if (!fallback || !isPasswordError(reason)) throw reason;
    await inspectPdfBytes(bytes, fallback);
    return fallback;
  }
}

export async function runBatchRecipe(
  bytes: Uint8Array,
  recipe: BatchRecipe,
  signal: AbortSignal,
  onProgress?: (progress:number,message:string)=>void,
  password?: string
): Promise<BatchRunArtifact> {
  const initial = await inspectPdfBytes(bytes, password);
  let output = bytes;
  let activePassword = password;
  let expectedPages = initial.pageCount;
  const warnings: string[] = [];
  const total = Math.max(1, recipe.steps.length);

  for (let index=0; index<recipe.steps.length; index+=1) {
    check(signal);
    const step = recipe.steps[index];
    const base = index/total;
    onProgress?.(base,batchStepLabel(step));
    const terminal = step.type === "split-fixed" || step.type === "page-images";
    if (terminal && index !== recipe.steps.length - 1) throw new Error("Split PDF and Export page images must be the final workflow step.");

    if (step.type === "rotate") {
      const info = await inspectPdfBytes(output, activePassword);
      output = (await compilePagePlan(output,Array.from({length:info.pageCount},(_,page)=>({sourcePageIndex:page,rotation:step.degrees})),signal,activePassword)).bytes;
    } else if (step.type === "optimize") {
      const result = await optimizePdf(output,{password:activePassword},signal);
      output = result.bytes;
      warnings.push(...result.report.warnings);
    } else if (step.type === "remove-metadata") {
      const result = await transformPdf(output,{removeMetadata:true},activePassword,signal);
      output = result.bytes;
      warnings.push(...result.report.warnings);
    } else if (step.type === "crop") {
      const result = await transformPdf(output,{crop:{enabled:true,topPt:mmToPt(step.topMm),rightPt:mmToPt(step.rightMm),bottomPt:mmToPt(step.bottomMm),leftPt:mmToPt(step.leftMm)}},activePassword,signal);
      output = result.bytes;
      warnings.push(...result.report.warnings);
    } else if (step.type === "decorate") {
      const result = await transformPdf(output,{decoration:{enabled:true,watermarkText:step.watermarkText,headerText:step.headerText,footerText:step.footerText,pageNumbers:step.pageNumbers,startNumber:step.startNumber,fontSize:10,marginPt:mmToPt(10),fontLanguage:step.fontLanguage ?? "auto"}},activePassword,signal);
      output = result.bytes;
      warnings.push(...result.report.warnings);
    } else if (step.type === "blank-pages") {
      const count = normalizeBatchBlankPageCount(step.count);
      const result = await transformPdf(output,{blankPages:{enabled:true,position:step.position,count,widthPt:mmToPt(step.widthMm),heightPt:mmToPt(step.heightMm)}},activePassword,signal);
      output = result.bytes;
      warnings.push(...result.report.warnings);
      expectedPages += count;
    } else if (step.type === "extract-pages" || step.type === "remove-pages") {
      const info = await inspectPdfBytes(output, activePassword);
      const selected = parsePageSelection(step.selection, info.pageCount);
      const all = Array.from({ length: info.pageCount }, (_, page) => page);
      const pages = step.type === "extract-pages" ? selected : all.filter((page) => !selected.includes(page));
      if (!pages.length) throw new Error("Remove pages cannot remove every page from a Batch item.");
      const result = await compilePagePlan(output,pages.map((sourcePageIndex)=>({sourcePageIndex,rotation:0 as const})),signal,activePassword);
      if (result.pageCount !== pages.length) throw new Error("Batch page-selection output did not match the requested pages.");
      output = result.bytes;
      expectedPages = pages.length;
      warnings.push(...result.warnings);
    } else if (step.type === "flatten" || step.type === "sanitize") {
      const state = createSecurityState("");
      const sanitization = step.type === "flatten"
        ? {
            ...state.sanitization,
            removeJavaScript: false,
            removeOpenActions: false,
            collapseRevisionHistory: false,
            flattenForms: step.flattenForms,
            flattenAnnotations: step.flattenAnnotations
          }
        : {
            ...state.sanitization,
            removeAttachments: step.removeAttachments,
            removeMetadata: step.removeMetadata
          };
      const result = await applySecurity(
        output,
        { formUpdates: [], redaction: state.redaction, sanitization, encryption: state.encryption },
        activePassword,
        signal
      );
      output = result.bytes;
      warnings.push(...result.report.warnings);
    } else if (step.type === "target-size") {
      if (output.byteLength > step.targetBytes) {
        const input = output;
        const pdf = await openPdfWithPdfJs(input, activePassword);
        try {
          const result = await compressPdfToTarget(
            input,
            pdf,
            {
              targetBytes: Math.max(1, Math.round(step.targetBytes)),
              preservation: step.preservation,
              password: activePassword,
              signal,
              onProgress: (event) => onProgress?.(
                Math.min((index + Math.max(0.03, event.attempt / event.maximumAttempts)) / total, (index + 0.96) / total),
                `${batchStepLabel(step)} · ${event.detail}`
              )
            }
          );
          warnings.push(...result.warnings);
          if (!result.bytes) throw new Error(`Target-size step could not produce a smaller PDF: ${result.message}`);
          const sourcePassword = activePassword;
          const resolvedOutputPassword = await resolveOutputPassword(result.bytes, sourcePassword, signal);
          if (result.method === "structure-preserving") {
            const fidelity = await validatePdfFidelity(
              input,
              result.bytes,
              [],
              sourcePassword,
              signal,
              { sourcePassword, outputPassword: resolvedOutputPassword }
            );
            warnings.push(...fidelity.warnings);
            if (!fidelity.passed) throw new Error(`Target-size structural result failed the fidelity gate: ${fidelity.failures.join(" ")}`);
          }
          output = result.bytes;
          activePassword = resolvedOutputPassword;
          if (result.outcome === "best-effort") warnings.push(`Target-size step used best effort: ${result.outputBytes ?? output.byteLength} bytes versus ${step.targetBytes} requested.`);
        } finally {
          await pdf.loadingTask.destroy();
        }
      }
    } else if (step.type === "raster-compress" || step.type === "grayscale") {
      const pdf = await openPdfWithPdfJs(output, activePassword);
      try {
        const profile=RASTER_PROFILES.find(item=>item.id===step.profile);
        if(!profile) throw new Error(`Unknown image-compression profile: ${step.profile}`);
        output=step.type === "grayscale"
          ? await rasterTransformPdf(pdf,profile,{grayscale:true},signal,(done,count)=>onProgress?.(base+(done/count)/total,`${batchStepLabel(step)} · ${done}/${count}`))
          : await rasterCompressPdf(pdf,profile,signal,(done,count)=>onProgress?.(base+(done/count)/total,`${batchStepLabel(step)} · ${done}/${count}`));
      } finally {
        await pdf.loadingTask.destroy();
      }
    } else if (step.type === "split-fixed") {
      const zip = await exportPdfSplitZip(output, step.pagesPerFile, activePassword, signal, (done,count)=>onProgress?.(base+(done/count)/total,`${batchStepLabel(step)} · ${done}/${count}`));
      onProgress?.(1,batchStepLabel(step));
      return {
        bytes: zip,
        mimeType: "application/zip",
        extension: ".zip",
        kind: "split-zip",
        warnings: [...new Set(warnings)],
        terminalSummary: "ZIP of PDF parts ordered by source page range; entries are named pages-0001-0010.pdf style."
      };
    } else if (step.type === "page-images") {
      const scale = step.quality === "compact" ? 1 : step.quality === "high" ? 2 : 1.5;
      const zip = await exportPdfImagesZip(output, scale, signal, (done,count)=>onProgress?.(base+(done/count)/total,`${batchStepLabel(step)} · ${done}/${count}`), activePassword);
      onProgress?.(1,batchStepLabel(step));
      return {
        bytes: zip,
        mimeType: "application/zip",
        extension: ".zip",
        kind: "images-zip",
        warnings: [...new Set(warnings)],
        terminalSummary: "ZIP of PNG pages in source-page order; entries are named page-0001.png style."
      };
    }
    if (index < recipe.steps.length - 1 && !terminal && step.type !== "target-size") {
      activePassword = await resolveOutputPassword(output, activePassword, signal);
    }
    onProgress?.((index+1)/total,batchStepLabel(step));
  }

  activePassword = await resolveOutputPassword(output, activePassword, signal);
  const final = await inspectPdfBytes(output, activePassword);
  if (final.pageCount !== expectedPages) throw new Error("The workflow output could not be verified because its page count changed unexpectedly.");
  return { bytes: output, mimeType: "application/pdf", extension: ".pdf", kind: "pdf", warnings: [...new Set(warnings)] };
}
