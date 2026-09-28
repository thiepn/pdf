import { createAssemblyPlan, validateAssemblyPlan } from "./assemblyModel";
import { openPdfWithPdfJs, extractPageText } from "../engines/pdfjsBase";
import { assembleSources, compilePagePlan, mergePdfSources } from "../tools/pageOperationsClient";
import { createStoredZip } from "../toolbox/zip";
import { transformPdf } from "../toolbox/toolboxClient";
import { optimizePdf, repairPdf } from "../processing/processingClient";
import { RASTER_PROFILES, rasterTransformPdf } from "../processing/rasterCompression";
import { applySecurity } from "../security/securityClient";
import { createSecurityState } from "../security/securityModel";
import { buildJpegPdf, type JpegPdfPage } from "../pdf/jpegPdf";
import { MAX_CANVAS_PIXELS, MAX_OUTPUT_BYTES, parsePageSelection, planSplit, safeOutputName, type QuickOptions, type QuickTaskId } from "./quickModel";

export interface QuickInput { id: string; name: string; bytes: Uint8Array; pageCount: number; password?: string; image?: File }
export interface QuickOutput { name: string; bytes: Uint8Array; mime: string; /** Confirmed by reopening the output, never inferred from the input. */ password?: string; pageCount?: number }
export interface QuickResult { files: QuickOutput[]; warnings: string[] }
const PDF = "application/pdf";
const check = (signal: AbortSignal) => signal.throwIfAborted();
const asPdf = (name: string, bytes: Uint8Array): QuickOutput => ({ name: safeOutputName(name, "pdf"), bytes, mime: PDF });

export function validateQuickOptions(task: QuickTaskId, inputs: QuickInput[], options: QuickOptions): void {
  if (!inputs.length) throw new Error("Choose a file first.");
  if (task === "merge-pdfs" && inputs.length < 2 && !options.pagePlan) throw new Error("Add another PDF or image, or arrange the pages of this document.");
  if (!["merge-pdfs", "organize-pages", "images-to-pdf", "compress-pdf"].includes(task) && inputs.length !== 1) throw new Error("This tool works on one PDF at a time.");
  if (["extract-pages", "remove-pages", "rotate-pdf", "pdf-to-jpg", "pdf-to-png", "pdf-to-text", "pdf-to-docx"].includes(task)) {
    const selected = parsePageSelection(options.selection, inputs[0].pageCount);
    if (task === "remove-pages" && selected.length === inputs[0].pageCount) throw new Error("Keep at least one page. Select only the pages you want to remove.");
  }
  if ((task === "organize-pages" || task === "merge-pdfs") && options.pagePlan) validateAssemblyPlan(options.pagePlan, inputs);
  if (["add-page-numbers", "add-watermark"].includes(task)) parsePageSelection(options.selection, inputs[0].pageCount);
  if (task === "flatten-pdf" && !options.flattenForms && !options.flattenAnnotations) throw new Error("Choose forms or annotations to flatten.");
  if (task === "crop-pages") parsePageSelection(options.cropPages, inputs[0].pageCount);
  if (task === "split-pdf") planSplit(inputs[0].pageCount, options.splitMode, options.every, options.ranges);
  if (task === "password-protect" && (!options.outputPassword || options.outputPassword !== options.confirmPassword)) throw new Error("Enter a password and the same password again to confirm it.");
  if (task === "add-watermark" && !options.watermark.trim()) throw new Error("Enter the watermark text.");
  if (task === "add-page-numbers" && (!Number.isSafeInteger(options.startNumber) || options.startNumber < 1)) throw new Error("Start number must be a positive whole number.");
  if (task === "crop-pages" && (Object.values(options.crop).some((n) => !Number.isFinite(n) || n < 0) || !Object.values(options.crop).some((n) => n > 0))) throw new Error("Enter a positive crop margin. Margins cannot be negative.");
  if (task === "compress-pdf" && options.compression !== "lossless" && !options.acceptRaster) throw new Error("Confirm that image-based compression can remove selectable text and interactive content.");
  if (["pdf-to-jpg", "pdf-to-png"].includes(task) && ![72, 150, 300].includes(options.dpi)) throw new Error("Choose 72, 150, or 300 DPI.");
  if (task === "images-to-pdf" && ![0, 10, 20].includes(options.margin)) throw new Error("Choose a supported image margin.");
}

async function encodeCanvas(canvas: HTMLCanvasElement, mime: string, quality = 0.9): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The browser could not encode this image.")), mime, quality));
  return new Uint8Array(await blob.arrayBuffer());
}

function enforceOutputBudget(files: QuickOutput[]): void {
  if (files.reduce((total, file) => total + file.bytes.byteLength, 0) > MAX_OUTPUT_BYTES) throw new Error("This export is too large for a safe browser download. Choose fewer pages or a lower image resolution.");
}

async function imagesToPdf(inputs: QuickInput[], options: QuickOptions, signal: AbortSignal, progress: (text: string) => void): Promise<Uint8Array> {
  const pages: JpegPdfPage[] = [];
  let bytes = 0;
  for (const [index, input] of inputs.entries()) {
    check(signal); progress(`Preparing image ${index + 1} of ${inputs.length}…`);
    if (!input.image) throw new Error("Choose JPG, PNG, or WebP images.");
    const bitmap = await createImageBitmap(input.image);
    const canvas = document.createElement("canvas");
    try {
      let [width, height] = options.paper === "a4" ? [595.276, 841.89] : options.paper === "letter" ? [612, 792] : [bitmap.width * 0.75, bitmap.height * 0.75];
      const landscape = options.orientation === "landscape" || (options.orientation === "auto" && bitmap.width > bitmap.height);
      if (options.paper !== "original" && landscape) [width, height] = [height, width];
      const margin = options.margin * 72 / 25.4;
      if (width <= 2 * margin || height <= 2 * margin) throw new Error("The margins leave no room for this image. Choose no margins or A4 paper.");
      const scale = Math.min(150 / 72, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
      canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d", { alpha: false }); if (!context) throw new Error("Image conversion needs canvas support.");
      context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
      const fit = Math.min((width - 2 * margin) * scale / bitmap.width, (height - 2 * margin) * scale / bitmap.height);
      const w = bitmap.width * fit; const h = bitmap.height * fit;
      context.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      const jpeg = await encodeCanvas(canvas, "image/jpeg", 0.92); check(signal);
      bytes += jpeg.byteLength; if (bytes > MAX_OUTPUT_BYTES) throw new Error("These images exceed the safe output size. Convert fewer images together.");
      pages.push({ jpeg, pixelWidth: canvas.width, pixelHeight: canvas.height, pageWidth: width, pageHeight: height });
    } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
  }
  return buildJpegPdf(pages);
}

export async function runQuickOperation(task: QuickTaskId, inputs: QuickInput[], options: QuickOptions, name: string, signal: AbortSignal, progress: (text: string) => void): Promise<QuickResult> {
  check(signal); validateQuickOptions(task, inputs, options);
  const input = inputs[0]; const warnings: string[] = []; const files: QuickOutput[] = [];
  if (task === "compress-pdf" && inputs.length > 1) {
    for (const [index, source] of inputs.entries()) {
      check(signal);
      const output = await runQuickOperation(task, [source], options, `${String(index + 1).padStart(3, "0")}-${source.name.replace(/\.pdf$/i, "")}-compressed`, signal, (detail) => progress(`${index + 1}/${inputs.length} · ${source.name} · ${detail}`));
      files.push(...output.files); warnings.push(...output.warnings.map((warning) => `${source.name}: ${warning}`)); enforceOutputBudget(files);
    }
    return { files, warnings: [...new Set(warnings)] };
  }
  if (task === "images-to-pdf") {
    files.push(asPdf(name, await imagesToPdf(inputs, options, signal, progress)));
  } else if (task === "organize-pages" || (task === "merge-pdfs" && (options.pagePlan || inputs.some((source) => source.image)))) {
    const plan = options.pagePlan ?? createAssemblyPlan(inputs);
    validateAssemblyPlan(plan, inputs);
    const sources: QuickInput[] = [];
    for (const source of inputs) {
      check(signal);
      sources.push(source.image ? { ...source, bytes: await imagesToPdf([source], options, signal, progress), password: undefined } : source);
    }
    progress("Assembling pages in the exact order shown…");
    const result = await assembleSources(sources, plan.map((page) => ({ sourceIndex: page.sourceId === null ? null : inputs.findIndex((source) => source.id === page.sourceId), sourcePageIndex: page.sourcePageIndex, rotation: page.rotation })), signal);
    warnings.push(...result.warnings); files.push(asPdf(name, result.bytes));
  } else if (task === "merge-pdfs") {
    progress("Combining PDFs in the order shown…");
    const result = await mergePdfSources(inputs, signal); warnings.push(...result.warnings); files.push(asPdf(name, result.bytes));
  } else if (["split-pdf", "extract-pages", "remove-pages", "rotate-pdf"].includes(task)) {
    const all = Array.from({ length: input.pageCount }, (_, index) => index);
    const selected = task === "split-pdf" ? [] : parsePageSelection(options.selection, input.pageCount);
    const groups = task === "split-pdf" ? planSplit(input.pageCount, options.splitMode, options.every, options.ranges)
      : [task === "extract-pages" ? selected : task === "remove-pages" ? all.filter((index) => !selected.includes(index)) : all];
    for (const [index, group] of groups.entries()) {
      check(signal); progress(`Creating PDF ${index + 1} of ${groups.length}…`);
      const result = await compilePagePlan(input.bytes, group.map((sourcePageIndex) => ({ sourcePageIndex, rotation: task === "rotate-pdf" && selected.includes(sourcePageIndex) ? options.rotation : 0 })), signal, input.password);
      if (result.pageCount !== group.length) throw new Error("The output page count did not match your selection.");
      warnings.push(...result.warnings);
      files.push(asPdf(groups.length > 1 ? `${name}-part-${String(index + 1).padStart(3, "0")}` : name, result.bytes)); enforceOutputBudget(files);
    }
  } else if (["pdf-to-jpg", "pdf-to-png", "pdf-to-text", "pdf-to-docx"].includes(task)) {
    const pdf = await openPdfWithPdfJs(input.bytes, input.password);
    try {
      const selected = parsePageSelection(options.selection, pdf.numPages); const texts: string[] = [];
      for (const [index, pageIndex] of selected.entries()) {
        check(signal); progress(`Exporting page ${pageIndex + 1} (${index + 1} of ${selected.length})…`);
        if (task === "pdf-to-text" || task === "pdf-to-docx") { texts.push(await extractPageText(pdf, pageIndex + 1)); continue; }
        const page = await pdf.getPage(pageIndex + 1); const canvas = document.createElement("canvas");
        try {
          const viewport = page.getViewport({ scale: options.dpi / 72 });
          if (viewport.width * viewport.height > MAX_CANVAS_PIXELS) throw new Error(`Page ${pageIndex + 1} is too large at this resolution. Choose a lower DPI.`);
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d", { alpha: false }); if (!context) throw new Error("Page export needs canvas support.");
          context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
          const render = page.render({ canvas, canvasContext: context, viewport });
          const cancel = () => render.cancel(); signal.addEventListener("abort", cancel, { once: true });
          try { check(signal); await render.promise; } finally { signal.removeEventListener("abort", cancel); }
          check(signal); const extension = task === "pdf-to-jpg" ? "jpg" : "png"; const mime = task === "pdf-to-jpg" ? "image/jpeg" : "image/png";
          files.push({ name: safeOutputName(`${name}-page-${String(pageIndex + 1).padStart(3, "0")}`, extension), bytes: await encodeCanvas(canvas, mime), mime }); enforceOutputBudget(files);
        } finally { page.cleanup(); canvas.width = 0; canvas.height = 0; }
      }
      if (task === "pdf-to-text" || task === "pdf-to-docx") {
        if (!texts.some((text) => text.trim())) throw new Error("No selectable text was found. Use OCR PDF first to recognize text in scanned pages.");
        if (task === "pdf-to-docx") {
          const { buildSimpleDocx } = await import("../professional/docx");
          const paragraphs = texts.flatMap((text, index) => [...(index ? ["\f"] : []), ...text.split(/\r?\n/)]);
          files.push({ name: safeOutputName(name, "docx"), bytes: buildSimpleDocx(name, paragraphs, false), mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
          warnings.push("This Word document contains editable extracted text with page breaks. Original fonts, page layout, tables and images are not reconstructed. Check text order before using it.");
        } else files.push({ name: safeOutputName(name, "txt"), bytes: new TextEncoder().encode(texts.join("\n\n")), mime: "text/plain;charset=utf-8" });
      }
    } finally { await pdf.loadingTask.destroy(); }
  } else if (task === "compress-pdf") {
    let output: Uint8Array;
    if (options.compression === "lossless") {
      progress("Optimizing without rasterizing pages…");
      const result = await optimizePdf(input.bytes, { password: input.password }, signal); output = result.bytes; warnings.push(...result.report.warnings);
    } else {
      const pdf = await openPdfWithPdfJs(input.bytes, input.password);
      try {
        const profile = RASTER_PROFILES.find((item) => item.id === options.compression)!;
        output = await rasterTransformPdf(pdf, profile, {}, signal, (done, total) => progress(`Compressing page ${done} of ${total}…`));
      } finally { await pdf.loadingTask.destroy(); }
      warnings.push("Image-based compression removes selectable text, interactive forms, links, layers, and digital signatures. Password protection is not retained.");
    }
    if (output.byteLength >= input.bytes.byteLength) { output = input.bytes; warnings.length = 0; warnings.push("This PDF is already smaller than the compressed result. The original file is offered unchanged instead."); }
    files.push(asPdf(name, output));
  } else if (task === "repair-pdf") {
    progress("Rebuilding a separate copy and checking that it opens…");
    const result = await repairPdf(input.bytes, input.password, signal);
    warnings.push(...result.report.warnings, "Repair rewrites recoverable PDF structure; missing or irreversibly damaged content cannot be recreated. Review every page of the result.");
    files.push(asPdf(name, result.bytes));
  } else if (task === "flatten-pdf" || task === "sanitize-pdf") {
    const state = createSecurityState("");
    const sanitization = task === "sanitize-pdf"
      ? { ...state.sanitization, removeAttachments: options.removeAttachments, removeMetadata: options.removeMetadata }
      : { ...state.sanitization, removeJavaScript: false, removeOpenActions: false, collapseRevisionHistory: false, flattenForms: options.flattenForms, flattenAnnotations: options.flattenAnnotations };
    progress(task === "flatten-pdf" ? "Flattening selected interactive content into page appearance…" : "Removing active scripts and automatic actions…");
    const result = await applySecurity(input.bytes, { formUpdates: [], redaction: state.redaction, sanitization, encryption: state.encryption }, input.password, signal);
    files.push(asPdf(name, result.bytes)); warnings.push(...result.report.warnings, task === "flatten-pdf" ? "Flattened content is visible but no longer interactive or independently editable. Review the resulting appearance." : "Cleanup is not redaction or malware certification. Visible text, links and annotations stay unless explicitly removed by a separate operation.");
  } else if (task === "unlock-pdf" || task === "password-protect") {
    progress(task === "unlock-pdf" ? "Removing password protection from the opened PDF…" : "Encrypting your PDF…");
    const state = createSecurityState("");
    // This task must not also silently sanitize, flatten, or clear form values.
    const sanitization = { ...state.sanitization, removeJavaScript: false, removeOpenActions: false, collapseRevisionHistory: false };
    const encryption = { ...state.encryption, mode: task === "unlock-pdf" ? "remove" as const : "aes-256" as const, userPassword: options.outputPassword, ownerPassword: options.outputPassword, permissions: { print: true, edit: true, copy: true, annotate: true, form: true, accessibility: true, assemble: true, printHighQuality: true } };
    const result = await applySecurity(input.bytes, { formUpdates: [], redaction: state.redaction, sanitization, encryption }, input.password, signal);
    warnings.push(...result.report.warnings); files.push(asPdf(name, result.bytes));
  } else {
    progress("Applying changes to a separate copy…");
    const crop = options.crop;
    const result = await transformPdf(input.bytes, task === "remove-metadata" ? { removeMetadata: true } : task === "crop-pages" ? { crop: { enabled: true, pageNumbers: parsePageSelection(options.cropPages, input.pageCount).map((index) => index + 1), topPt: crop.top * 72 / 25.4, rightPt: crop.right * 72 / 25.4, bottomPt: crop.bottom * 72 / 25.4, leftPt: crop.left * 72 / 25.4 } } : { decoration: { enabled: true, watermarkText: task === "add-watermark" ? options.watermark : "", headerText: "", footerText: "", pageNumbers: task === "add-page-numbers", startNumber: options.startNumber, pageNumbersToChange: parsePageSelection(options.selection, input.pageCount).map((index) => index + 1), numberPosition: options.numberPosition, fontSize: options.decorationFontSize, watermarkSize: options.decorationFontSize * 2.6, marginPt: 28.35 } }, input.password, signal);
    warnings.push(...result.report.warnings); files.push(asPdf(name, result.bytes));
  }
  check(signal); enforceOutputBudget(files);
  // Verify the actual download and its password state before offering a handoff.
  // Optimization may return the original encrypted bytes; other tools decrypt.
  for (const file of files) {
    if (file.mime !== PDF) continue;
    check(signal);
    const candidates = [...new Set([undefined, ...(task === "password-protect" ? [options.outputPassword] : []), ...inputs.map((source) => source.password)])];
    let failure: unknown;
    for (const password of candidates) {
      check(signal);
      try {
        const pdf = await openPdfWithPdfJs(file.bytes, password);
        try { if (!pdf.numPages) throw new Error("The output contains no pages."); file.pageCount = pdf.numPages; file.password = password; }
        finally { await pdf.loadingTask.destroy(); }
        failure = undefined; break;
      } catch (reason) {
        failure = reason;
        if (!/password|encrypted/i.test(reason instanceof Error ? reason.message : String(reason))) throw reason;
      }
    }
    if (failure) throw new Error("The output could not be reopened with its expected password. No download was published.");
  }
  check(signal);
  return { files, warnings: [...new Set(warnings)] };
}

export function zipQuickResults(files: QuickOutput[]): Uint8Array {
  enforceOutputBudget(files); return createStoredZip(files.map(({ name, bytes }) => ({ name, bytes })));
}
