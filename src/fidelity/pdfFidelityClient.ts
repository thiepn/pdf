import * as pdfjs from "pdfjs-dist";
import { openPdfWithPdfJs } from "../engines/pdfjs";
import {
  analyzePdfContainerFeatures,
  chooseFidelitySamplePages,
  comparePdfFidelityProfiles,
  stableTextDigest,
  type PdfFidelityProfile,
  type PdfFidelityReport,
  type PdfPageSemanticFingerprint
} from "./pdfFidelity";

const CORE_METADATA_KEYS = ["Title", "Author", "Subject", "Keywords", "Creator"] as const;

function normalizedPages(pageCount: number, pages: Iterable<number>): number[] {
  return [...new Set(pages)]
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pageCount)
    .sort((a, b) => a - b);
}

function countOutline(items: any[] | null): number {
  if (!items) return 0;
  return items.reduce((sum, item) => sum + 1 + countOutline(Array.isArray(item?.items) ? item.items : null), 0);
}

function coreMetadata(info: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of CORE_METADATA_KEYS) {
    const value = info[key];
    if (typeof value === "string" && value.length) result[key] = value;
  }
  return result;
}

function operatorSet(...names: string[]): Set<number> {
  const ops = (pdfjs as any).OPS ?? {};
  return new Set(names.map((name) => ops[name]).filter((value): value is number => typeof value === "number"));
}

const IMAGE_OPERATORS = operatorSet("paintImageXObject", "paintInlineImageXObject", "paintImageMaskXObject", "paintSolidColorImageMask");
const VECTOR_OPERATORS = operatorSet("constructPath", "stroke", "closeStroke", "fill", "eoFill", "fillStroke", "eoFillStroke", "closeFillStroke", "closeEOFillStroke");

function annotationCounts(annotations: any[]): Pick<PdfPageSemanticFingerprint, "annotationCount" | "linkCount" | "widgetCount"> {
  let annotationCount = 0;
  let linkCount = 0;
  let widgetCount = 0;
  for (const annotation of annotations ?? []) {
    if (annotation?.subtype === "Link") linkCount += 1;
    else if (annotation?.subtype === "Widget") widgetCount += 1;
    else annotationCount += 1;
  }
  return { annotationCount, linkCount, widgetCount };
}

async function semanticFingerprint(page: any, pageNumber: number, deep: boolean): Promise<PdfPageSemanticFingerprint> {
  // Edited pages are intentionally allowed to change text, images and vectors.
  // Running PDF.js text/operator extraction there adds cost and can exercise
  // transient writer-specific content we never compare. For affected pages P8
  // therefore validates only annotations/widgets plus page geometry. Untouched
  // sampled pages still receive the full semantic fingerprint.
  if (!deep) {
    const annotations = await page.getAnnotations({ intent: "display" });
    return {
      pageNumber,
      textCharacters: 0,
      textDigest: stableTextDigest(""),
      imageOperations: 0,
      vectorOperations: 0,
      ...annotationCounts(annotations)
    };
  }

  const [text, operatorList, annotations] = await Promise.all([
    page.getTextContent({ includeMarkedContent: false }),
    page.getOperatorList(),
    page.getAnnotations({ intent: "display" })
  ]);

  const pieces: string[] = [];
  let textCharacters = 0;
  for (const item of text.items ?? []) {
    if (!("str" in item) || typeof item.str !== "string") continue;
    pieces.push(item.str);
    textCharacters += item.str.length;
  }

  let imageOperations = 0;
  let vectorOperations = 0;
  for (const operation of operatorList.fnArray ?? []) {
    if (IMAGE_OPERATORS.has(operation)) imageOperations += 1;
    if (VECTOR_OPERATORS.has(operation)) vectorOperations += 1;
  }

  return {
    pageNumber,
    textCharacters,
    textDigest: stableTextDigest(pieces.join("\u241f")),
    imageOperations,
    vectorOperations,
    ...annotationCounts(annotations)
  };
}

export async function inspectPdfFidelityProfile(
  bytes: Uint8Array,
  affectedPages: Iterable<number>,
  password?: string,
  signal?: AbortSignal,
  forcedSamplePages?: Iterable<number>
): Promise<PdfFidelityProfile> {
  const document = await openPdfWithPdfJs(bytes, password);
  try {
    if (signal?.aborted) throw new DOMException("Fidelity inspection cancelled.", "AbortError");
    const affected = normalizedPages(document.numPages, affectedPages);
    const affectedSet = new Set(affected);
    const sampledPages = forcedSamplePages
      ? normalizedPages(document.numPages, forcedSamplePages)
      : chooseFidelitySamplePages(document.numPages, affected);

    const [metadataResult, outlineResult, attachmentsResult, fieldsResult, actionsResult, labelsResult] = await Promise.allSettled([
      document.getMetadata(),
      document.getOutline(),
      document.getAttachments(),
      document.getFieldObjects(),
      document.getJSActions(),
      document.getPageLabels()
    ]);

    const info = metadataResult.status === "fulfilled" ? metadataResult.value.info as Record<string, unknown> : {};
    const outline = outlineResult.status === "fulfilled" ? outlineResult.value : null;
    const attachments = attachmentsResult.status === "fulfilled" ? attachmentsResult.value : null;
    const fields = fieldsResult.status === "fulfilled" ? fieldsResult.value : null;
    const actions = actionsResult.status === "fulfilled" ? actionsResult.value : null;
    const labels = labelsResult.status === "fulfilled" ? labelsResult.value : null;

    let formFieldCount = 0;
    if (fields) for (const value of Object.values(fields)) formFieldCount += Array.isArray(value) ? value.length : 0;

    const geometry: PdfFidelityProfile["geometry"] = [];
    const semantics: PdfFidelityProfile["semantics"] = [];
    for (const pageNumber of sampledPages) {
      if (signal?.aborted) throw new DOMException("Fidelity inspection cancelled.", "AbortError");
      const page = await document.getPage(pageNumber);
      try {
        const pageAny = page as any;
        const rawView = Array.isArray(pageAny.view) ? pageAny.view : [0, 0, 0, 0];
        geometry.push({
          pageNumber,
          view: [Number(rawView[0] ?? 0), Number(rawView[1] ?? 0), Number(rawView[2] ?? 0), Number(rawView[3] ?? 0)],
          rotation: Number(pageAny.rotate ?? 0),
          userUnit: Number(pageAny.userUnit ?? 1)
        });
        semantics.push(await semanticFingerprint(page, pageNumber, !affectedSet.has(pageNumber)));
      } finally {
        page.cleanup();
      }
    }

    return {
      pageCount: document.numPages,
      sampledPages,
      affectedPages: affected,
      container: analyzePdfContainerFeatures(bytes),
      outlineEntries: countOutline(outline),
      attachmentCount: attachments ? Object.keys(attachments).length : 0,
      formFieldCount,
      hasJavaScript: Boolean(actions && Object.keys(actions).length),
      pageLabelsDigest: stableTextDigest(JSON.stringify(labels ?? [])),
      coreMetadata: coreMetadata(info),
      geometry,
      semantics
    };
  } finally {
    await document.loadingTask.destroy();
  }
}

export async function validatePdfFidelity(
  sourceBytes: Uint8Array,
  outputBytes: Uint8Array,
  affectedPages: Iterable<number>,
  password?: string,
  signal?: AbortSignal
): Promise<PdfFidelityReport> {
  const source = await inspectPdfFidelityProfile(sourceBytes, affectedPages, password, signal);
  const output = await inspectPdfFidelityProfile(outputBytes, source.affectedPages, password, signal, source.sampledPages);
  return comparePdfFidelityProfiles(source, output);
}
