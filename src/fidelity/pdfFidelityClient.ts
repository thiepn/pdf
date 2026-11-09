import * as pdfjs from "pdfjs-dist";
import { openPdfWithPdfJs } from "../engines/pdfjs";
import { inspectSecurity, inspectP8RawLinkActions } from "../security/securityClient";
import {
  analyzePdfContainerFeatures,
  chooseFidelitySamplePages,
  comparePdfFidelityProfiles,
  stableTextDigest,
  type PdfFidelityExpectations,
  type PdfFidelityProfile,
  type PdfFormWidgetFingerprint,
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
    // A PDF.js Popup is a companion to a user-visible annotation, not a
    // separate authored item. MuPDF can rebuild it or mirror parent contents.
    else if (annotation?.subtype !== "Popup") annotationCount += 1;
  }
  return { annotationCount, linkCount, widgetCount };
}

async function canonicalLinkDestination(destination: unknown, document: any): Promise<unknown> {
  if (typeof destination === "string") {
    // PDF.js exposes a named destination by name, but the Names/Dests map
    // can be changed without touching the Link annotation. Resolve the map
    // before checking the semantic page and view, not the volatile name.
    const resolved = await document.getDestination(destination);
    if (!Array.isArray(resolved)) throw new Error("Named PDF link destination cannot be verified.");
    return canonicalLinkDestination(resolved, document);
  }
  if (!Array.isArray(destination)) return destination ?? null;
  const [reference, ...view] = destination;
  // An internal /GoTo target uses a PDF page reference, whose object number
  // may change during a valid save. Resolve its semantic 1-based page number
  // before comparing, while retaining the zoom/view operation and coordinates.
  if (reference && typeof reference === "object"
      && Number.isInteger(reference.num) && Number.isInteger(reference.gen)) {
    const index = await document.getPageIndex(reference);
    if (!Number.isInteger(index) || index < 0 || index >= document.numPages) {
      throw new Error("Internal PDF link target could not be verified.");
    }
    return [index + 1, ...view];
  }
  // PDF.js also permits zero-based integer page indices in explicit
  // destinations. Normalize both representation forms to 1-based semantics.
  if (Number.isInteger(reference) && reference >= 0 && reference < document.numPages) {
    return [reference + 1, ...view];
  }
  throw new Error("Internal PDF link destination cannot be verified.");
}

async function annotationEvidence(annotations: any[], document: any): Promise<Pick<PdfPageSemanticFingerprint, "linkFingerprints" | "annotationFingerprints">> {
  const links: string[] = [];
  const comments: string[] = [];
  const geometry = (rect: unknown): number[] =>
    Array.isArray(rect) ? rect.map((value) => Math.round(Number(value) * 100) / 100) : [];
  for (const entry of annotations) {
    if (entry?.subtype === "Widget" || entry?.subtype === "Popup") continue;
    // P7 owns widgets; PDF.js Popup entries are generated companions of notes.
    const rect = geometry(entry?.rect);
    if (rect.length !== 4 || rect.some((value) => !Number.isFinite(value))) {
      throw new Error("Link or annotation geometry cannot be verified.");
    }
    if (entry.subtype === "Link") {
      links.push(JSON.stringify({
        rect,
        target: entry.url ?? entry.unsafeUrl ?? null,
        destination: await canonicalLinkDestination(entry.dest, document),
        action: entry.action ?? null,
        flags: entry.annotationFlags ?? 0
      }));
    } else {
      comments.push(JSON.stringify({
        subtype: entry.subtype ?? "",
        rect,
        contents: entry.contentsObj?.str ?? "",
        title: entry.titleObj?.str ?? "",
        subject: entry.subject ?? "",
        color: entry.color ? Array.from(entry.color) : null,
        flags: entry.annotationFlags ?? 0
      }));
    }
  }
  return { linkFingerprints: links.sort(), annotationFingerprints: comments.sort() };
}

async function semanticFingerprint(page: any, pageNumber: number, deep: boolean, document: any): Promise<PdfPageSemanticFingerprint> {
  // Edited pages are intentionally allowed to change text, images and vectors.
  // Running PDF.js text/operator extraction there adds cost and can exercise
  // transient writer-specific content we never compare. For affected pages P8
  // therefore validates only annotations/widgets plus page geometry. Untouched
  // sampled pages still receive the full semantic fingerprint.
  if (!deep) {
    // P8 is a preservation check, not a display-only rendering check.
    // "display" excludes NoView annotations, including hidden review notes.
    const annotations = await page.getAnnotations({ intent: "any" });
    return {
      pageNumber,
      textCharacters: 0,
      textDigest: stableTextDigest(""),
      imageOperations: 0,
      vectorOperations: 0,
      ...annotationCounts(annotations),
      ...(await annotationEvidence(annotations, document))
    };
  }

  const [text, operatorList, annotations] = await Promise.all([
    page.getTextContent({ includeMarkedContent: false }),
    page.getOperatorList(),
    page.getAnnotations({ intent: "any" })
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
    ...annotationCounts(annotations),
    ...(await annotationEvidence(annotations, document))
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

    if (metadataResult.status === "rejected") throw new Error("Document metadata fidelity inspection failed.");
    const info = metadataResult.value.info as Record<string, unknown>;
    const xmpMetadataXml = metadataResult.value.metadata?.getRaw?.() ?? "";
    const outline = outlineResult.status === "fulfilled" ? outlineResult.value : null;
    const attachments = attachmentsResult.status === "fulfilled" ? attachmentsResult.value : null;
    const fields = fieldsResult.status === "fulfilled" ? fieldsResult.value : null;
    const actions = actionsResult.status === "fulfilled" ? actionsResult.value : null;
    const labels = labelsResult.status === "fulfilled" ? labelsResult.value : null;


    // A PDF.js radio group has a synthetic parent with page=-1; it is not
    // an actual Widget annotation. Count and compare only real page widgets.
    // Never silently accept missing field inspection as an empty AcroForm.
    if (fieldsResult.status === "rejected") throw new Error("Form field fidelity inspection failed.");
    // PDF.js intentionally omits geometry from signature field objects.
    // Resolve only their matching real page Widget annotations; never invent a rectangle.
    const signatureRectCache = new Map<number, Map<string, number[]>>();
    const signatureRect = async (pageIndex: number, id: string, name: string): Promise<number[] | undefined> => {
      let byId = signatureRectCache.get(pageIndex);
      if (!byId) {
        const page = await document.getPage(pageIndex + 1);
        const annotations = await page.getAnnotations();
        byId = new Map<string, number[]>();
        for (const annotation of annotations) {
          if (annotation.subtype !== "Widget" || annotation.fieldType !== "Sig"
              || typeof annotation.id !== "string" || !Array.isArray(annotation.rect)
              || annotation.rect.length !== 4 || annotation.fieldName !== name) continue;
          byId.set(annotation.id, annotation.rect.map(Number));
        }
        signatureRectCache.set(pageIndex, byId);
      }
      return byId.get(id);
    };
    const formWidgets: PdfFormWidgetFingerprint[] = [];
    if (fields) {
      for (const [name, entries] of Object.entries(fields)) {
        if (!Array.isArray(entries)) throw new Error("Form field evidence is malformed.");
        for (const raw of entries) {
          const field = raw as any;
          if (field.page === -1 && Array.isArray(field.kidIds)) continue;
          const rect = field.type === "signature" && !Array.isArray(field.rect)
            && Number.isInteger(field.page) && field.page >= 0
            ? await signatureRect(field.page, String(field.id ?? ""), name) : field.rect;
          if (!Number.isInteger(field.page) || field.page < 0 || !Array.isArray(rect) || rect.length !== 4 || rect.some((n: number) => !Number.isFinite(n))) {
            throw new Error("Form widget geometry cannot be verified.");
          }
          const normalized = (value: unknown) => JSON.stringify(value ?? null);
          formWidgets.push({
            name, type: String(field.type ?? ""), pageNumber: field.page + 1,
            rect: rect.map(Number),
            value: normalized(field.value), defaultValue: normalized(field.defaultValue),
            exportValues: normalized(field.exportValues), editable: field.editable === true,
            password: field.password === true
          });
        }
      }
    }
    const formFieldCount = formWidgets.length;

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
        semantics.push(await semanticFingerprint(page, pageNumber, !affectedSet.has(pageNumber), document));
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
      formWidgets,
      hasJavaScript: Boolean(actions && Object.keys(actions).length),
      pageLabelsDigest: stableTextDigest(JSON.stringify(labels ?? [])),
      coreMetadata: coreMetadata(info),
      xmpMetadataXml,
      geometry,
      semantics
    };
  } finally {
    await document.loadingTask.destroy();
  }
}

export interface PdfFidelityValidationOptions {
  sourcePassword?: string;
  outputPassword?: string;
  expectations?: PdfFidelityExpectations;
}

export async function validatePdfFidelity(
  sourceBytes: Uint8Array,
  outputBytes: Uint8Array,
  affectedPages: Iterable<number>,
  password?: string,
  signal?: AbortSignal,
  options: PdfFidelityValidationOptions = {}
): Promise<PdfFidelityReport> {
  const sourcePassword = options.sourcePassword ?? password;
  const outputPassword = options.outputPassword ?? password;
  const source = await inspectPdfFidelityProfile(sourceBytes, affectedPages, sourcePassword, signal);
  // PDF Studio rewrites exports, which invalidates existing cryptographic
  // signatures. Do not return a PDF that still displays a signature field
  // when its signed byte ranges are no longer valid.
  const byteIdentical = sourceBytes.length === outputBytes.length
    && sourceBytes.every((value, index) => value === outputBytes[index]);
  if (!byteIdentical && source.formWidgets?.some((field) => field.type === "signature")) {
    const inspection = await inspectSecurity(sourceBytes, sourcePassword, signal);
    if (inspection.signatures.some((signature) => signature.signed)) {
      const affected = new Set(source.affectedPages);
      return {
        passed: false,
        failures: ["Signed PDF export blocked: rewriting would invalidate an existing cryptographic signature. The original remains unchanged."],
        warnings: [],
        sampledPages: source.sampledPages,
        sampledAffectedPages: source.sampledPages.filter((page) => affected.has(page)),
        affectedPageCount: source.affectedPages.length
      };
    }
  }
  const output = await inspectPdfFidelityProfile(outputBytes, source.affectedPages, outputPassword, signal, source.sampledPages);
  const report = comparePdfFidelityProfiles(source, output, options.expectations);
  if (!options.expectations?.expectNoLinksOnAffectedPages && source.affectedPages.some((page) =>
    (source.semantics.find((item) => item.pageNumber === page)?.linkCount ?? 0) > 0 ||
    (output.semantics.find((item) => item.pageNumber === page)?.linkCount ?? 0) > 0
  )) {
    const normalization = {
      removeJavaScript: options.expectations?.removeEmbeddedLinkScripts === true,
      removeAdditionalActions: options.expectations?.removeLinkAdditionalActions === true
    };
    const [original, exported] = await Promise.all([
      inspectP8RawLinkActions(sourceBytes, source.affectedPages, sourcePassword, signal, normalization),
      inspectP8RawLinkActions(outputBytes, source.affectedPages, outputPassword, signal, normalization)
    ]);
    for (const page of source.affectedPages) {
      const before = original[page]?.fingerprints ?? [];
      const after = exported[page]?.fingerprints ?? [];
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        report.failures.push(`Page ${page} supplemental link action graph changed unexpectedly.`);
      }
      if (normalization.removeJavaScript && exported[page]?.hasJavaScript) {
        report.failures.push(`Page ${page} embedded link scripts were not removed.`);
      }
      if (normalization.removeAdditionalActions && exported[page]?.hasAdditionalActions) {
        report.failures.push(`Page ${page} link additional actions were not removed.`);
      }
    }
    if (report.failures.length) report.passed = false;
  }
  return report;
}
