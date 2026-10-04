import { extractPageText, inspectPdfAnnotationInventory, inspectPdfBytes, openPdfWithPdfJs } from "../engines/pdfjsBase";

export type TrustOutcome = "passed" | "changed" | "warning" | "not-checked";
export type TrustLevel = "verified" | "verified-with-notes";

export interface OutputTrustFact {
  label: string;
  value: string;
  detail?: string;
}

export interface OutputTrustCheck {
  label: string;
  outcome: TrustOutcome;
  detail: string;
}

export interface OutputTrustReport {
  schemaVersion: 1;
  operationId: string;
  level: TrustLevel;
  headline: string;
  generatedAt: number;
  facts: OutputTrustFact[];
  checks: OutputTrustCheck[];
  notes: string[];
  lossy: boolean;
}

export interface TrustArtifact {
  name: string;
  bytes: Uint8Array;
  mime: string;
  password?: string;
  pageCount?: number;
}

export interface VerifyOutputOptions {
  operationId: string;
  sources: TrustArtifact[];
  outputs: TrustArtifact[];
  warnings?: string[];
  rasterized?: boolean;
  expectedPageCount?: number;
  explicitLossNotes?: string[];
}

interface PdfTrustSnapshot {
  name: string;
  byteLength: number;
  pageCount: number;
  encrypted: boolean;
  formFieldCount: number;
  attachmentCount: number;
  hasOutline: boolean;
  hasJavaScript: boolean;
  sampledPages: number;
  sampledPagesWithText: number;
  sampledAnnotationCount: number;
  sampledLinkCount: number;
  sampledWidgetCount: number;
}

const PDF = "application/pdf";
const PAGE_SAMPLE_LIMIT = 12;

const pageChangingOperations = new Set([
  "merge-pdfs", "organize-pages", "split-pdf", "extract-pages", "remove-pages", "images-to-pdf"
]);

const lossyOperations = new Set([
  "pdf-to-jpg", "pdf-to-png", "pdf-to-docx", "pdf-to-text",
  "flatten-pdf", "sanitize-pdf", "remove-metadata"
]);

const signatureInvalidatingOperations = new Set([
  "editor", "organizer", "ocr", "merge-pdfs", "organize-pages", "split-pdf",
  "extract-pages", "remove-pages", "rotate-pdf", "compress-pdf", "repair-pdf",
  "flatten-pdf", "sanitize-pdf", "remove-metadata", "unlock-pdf", "password-protect",
  "add-page-numbers", "add-watermark", "crop-pages"
]);

function samplePageNumbers(pageCount: number): number[] {
  if (pageCount <= PAGE_SAMPLE_LIMIT) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set<number>([1, pageCount]);
  for (let index = 1; index < PAGE_SAMPLE_LIMIT - 1; index += 1) {
    pages.add(Math.max(1, Math.min(pageCount, Math.round(1 + index * (pageCount - 1) / (PAGE_SAMPLE_LIMIT - 1)))));
  }
  return [...pages].sort((left, right) => left - right);
}

async function inspectPdfTrustSnapshot(artifact: TrustArtifact): Promise<PdfTrustSnapshot> {
  const summary = await inspectPdfBytes(artifact.bytes, artifact.password);
  const pages = samplePageNumbers(summary.pageCount);
  const [annotations, textCoverage] = await Promise.all([
    inspectPdfAnnotationInventory(artifact.bytes, artifact.password, pages),
    inspectSearchableText(artifact.bytes, artifact.password, pages)
  ]);
  return {
    name: artifact.name,
    byteLength: artifact.bytes.byteLength,
    pageCount: summary.pageCount,
    encrypted: summary.encrypted,
    formFieldCount: summary.formFieldCount,
    attachmentCount: summary.attachmentCount,
    hasOutline: summary.hasOutline,
    hasJavaScript: summary.hasJavaScript,
    sampledPages: pages.length,
    sampledPagesWithText: textCoverage,
    sampledAnnotationCount: annotations.annotationCount,
    sampledLinkCount: annotations.linkCount,
    sampledWidgetCount: annotations.widgetCount
  };
}

async function inspectSearchableText(bytes: Uint8Array, password: string | undefined, pages: number[]): Promise<number> {
  const document = await openPdfWithPdfJs(bytes, password);
  try {
    let withText = 0;
    for (const pageNumber of pages) {
      const text = await extractPageText(document, pageNumber);
      if (text.trim()) withText += 1;
    }
    return withText;
  } finally {
    await document.loadingTask.destroy();
  }
}

function sum<T>(items: T[], read: (item: T) => number): number {
  return items.reduce((total, item) => total + read(item), 0);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function sizeChange(before: number, after: number): string {
  if (!before) return formatBytes(after);
  const percent = Math.round((after - before) / before * 100);
  if (!percent) return `${formatBytes(before)} → ${formatBytes(after)} · unchanged`;
  return `${formatBytes(before)} → ${formatBytes(after)} · ${Math.abs(percent)}% ${percent < 0 ? "smaller" : "larger"}`;
}

function textCoverageLabel(items: PdfTrustSnapshot[]): string {
  const sampled = sum(items, (item) => item.sampledPages);
  const withText = sum(items, (item) => item.sampledPagesWithText);
  if (!sampled) return "Not checked";
  return `${withText}/${sampled} sampled pages contain searchable text`;
}

function comparisonCheck(
  label: string,
  before: number,
  after: number,
  detailUnit: string,
  preserveExpected: boolean
): OutputTrustCheck {
  if (before === after) return { label, outcome: "passed", detail: `${after} ${detailUnit} found before and after.` };
  return {
    label,
    outcome: preserveExpected && before > after ? "warning" : "changed",
    detail: `${before} → ${after} ${detailUnit} in the checked document structure.`
  };
}

function operationLossNotes(operationId: string, rasterized: boolean): string[] {
  if (operationId === "compress-pdf" && rasterized) {
    return ["Image-based compression rasterizes pages. Selectable text, forms, links, layers, password protection, and digital signatures are not retained."];
  }
  switch (operationId) {
    case "pdf-to-jpg":
    case "pdf-to-png":
      return ["Image export preserves page appearance only. Searchable text, forms, links, layers, and other PDF structure are not part of the image files."];
    case "pdf-to-docx":
      return ["Word export reconstructs editable extracted text and page breaks, not the original PDF layout, images, tables, links, forms, or signatures."];
    case "pdf-to-text":
      return ["Text export contains extracted text only. Page appearance and PDF structure are not part of the output."];
    case "flatten-pdf":
      return ["Flattened content keeps its visible appearance but intentionally stops being interactive or independently editable."];
    case "sanitize-pdf":
      return ["Cleanup intentionally removes selected active content or document data. The removed structures cannot be recovered from the cleaned copy."];
    case "remove-metadata":
      return ["Document metadata is intentionally removed from the output copy."];
    case "repair-pdf":
      return ["Repair rewrites recoverable structure. Content already missing or irreversibly damaged in the source cannot be recreated."];
    default:
      return [];
  }
}

export async function verifyOutputTrust(options: VerifyOutputOptions): Promise<OutputTrustReport> {
  const sourceBytes = sum(options.sources, (item) => item.bytes.byteLength);
  const outputBytes = sum(options.outputs, (item) => item.bytes.byteLength);
  const sourcePdfArtifacts = options.sources.filter((item) => item.mime === PDF);
  const outputPdfArtifacts = options.outputs.filter((item) => item.mime === PDF);
  const [sourcePdf, outputPdf] = await Promise.all([
    Promise.all(sourcePdfArtifacts.map(inspectPdfTrustSnapshot)),
    Promise.all(outputPdfArtifacts.map(inspectPdfTrustSnapshot))
  ]);

  const facts: OutputTrustFact[] = [
    { label: "Output", value: `${options.outputs.length} ${options.outputs.length === 1 ? "file" : "files"} · ${formatBytes(outputBytes)}` },
    { label: "File size", value: sizeChange(sourceBytes, outputBytes) }
  ];
  const checks: OutputTrustCheck[] = [];
  const notes = [...new Set([...(options.warnings ?? []), ...(options.explicitLossNotes ?? []), ...operationLossNotes(options.operationId, options.rasterized === true)])];

  if (outputPdf.length) {
    const beforePages = sum(sourcePdf, (item) => item.pageCount);
    const afterPages = sum(outputPdf, (item) => item.pageCount);
    facts.push({ label: "Pages", value: sourcePdf.length ? `${beforePages} → ${afterPages}` : String(afterPages) });
    facts.push({
      label: "Searchable text",
      value: textCoverageLabel(outputPdf),
      detail: outputPdf.some((item) => item.pageCount > item.sampledPages) ? "Representative pages were sampled for text; page count and document structure were checked separately." : "Every output page was checked for searchable text."
    });
    checks.push({ label: "Output opens", outcome: "passed", detail: `All ${outputPdf.length} output PDF${outputPdf.length === 1 ? "" : "s"} reopened successfully after processing.` });

    if (options.expectedPageCount !== undefined) {
      checks.push({
        label: "Expected pages",
        outcome: afterPages === options.expectedPageCount ? "passed" : "warning",
        detail: `Expected ${options.expectedPageCount}; verified ${afterPages}.`
      });
    } else if (sourcePdf.length) {
      const expectedPreserved = !pageChangingOperations.has(options.operationId);
      checks.push({
        label: "Page count",
        outcome: beforePages === afterPages ? "passed" : expectedPreserved ? "warning" : "changed",
        detail: beforePages === afterPages
          ? `All ${afterPages} pages are present.`
          : `${beforePages} source pages → ${afterPages} output pages${expectedPreserved ? "." : " as required by this operation."}`
      });
    }

    if (sourcePdf.length) {
      const sourceTextPages = sum(sourcePdf, (item) => item.sampledPagesWithText);
      const outputTextPages = sum(outputPdf, (item) => item.sampledPagesWithText);
      const sourceSampled = sum(sourcePdf, (item) => item.sampledPages);
      const outputSampled = sum(outputPdf, (item) => item.sampledPages);
      const textExpected = !options.rasterized && !["flatten-pdf"].includes(options.operationId);
      checks.push({
        label: "Searchable text",
        outcome: sourceTextPages > 0 && outputTextPages === 0 ? (textExpected ? "warning" : "changed") : outputTextPages >= Math.min(sourceTextPages, outputSampled) ? "passed" : "changed",
        detail: `Source: ${sourceTextPages}/${sourceSampled} sampled pages · output: ${outputTextPages}/${outputSampled} sampled pages.`
      });

      const sourceLinks = sum(sourcePdf, (item) => item.sampledLinkCount);
      const outputLinks = sum(outputPdf, (item) => item.sampledLinkCount);
      const linksExpected = !options.rasterized && !["flatten-pdf"].includes(options.operationId);
      checks.push(comparisonCheck("Links", sourceLinks, outputLinks, "links on sampled pages", linksExpected && !pageChangingOperations.has(options.operationId)));

      const sourceForms = sum(sourcePdf, (item) => item.formFieldCount);
      const outputForms = sum(outputPdf, (item) => item.formFieldCount);
      const formsExpected = !options.rasterized && options.operationId !== "flatten-pdf";
      checks.push(comparisonCheck("Forms", sourceForms, outputForms, "form fields", formsExpected && !pageChangingOperations.has(options.operationId)));

      const sourceAttachments = sum(sourcePdf, (item) => item.attachmentCount);
      const outputAttachments = sum(outputPdf, (item) => item.attachmentCount);
      if (sourceAttachments || outputAttachments) checks.push(comparisonCheck("Attachments", sourceAttachments, outputAttachments, "attachments", !["sanitize-pdf"].includes(options.operationId)));

      const sourceEncrypted = sourcePdf.some((item) => item.encrypted);
      const outputEncrypted = outputPdf.some((item) => item.encrypted);
      if (sourceEncrypted || outputEncrypted || ["unlock-pdf", "password-protect"].includes(options.operationId)) {
        const expected = options.operationId === "password-protect" ? true : options.operationId === "unlock-pdf" ? false : sourceEncrypted;
        checks.push({
          label: "Password protection",
          outcome: outputEncrypted === expected ? "passed" : "warning",
          detail: `Source: ${sourceEncrypted ? "protected" : "not protected"} · output: ${outputEncrypted ? "protected" : "not protected"}.`
        });
      }
    }
  } else {
    checks.push({ label: "PDF structure", outcome: "not-checked", detail: "This operation creates a non-PDF format, so PDF structural preservation does not apply to the output." });
  }

  const explicitLoss = options.rasterized === true || lossyOperations.has(options.operationId) || notes.some((note) => /removes|not retained|not reconstructed|cannot be recovered|raster/i.test(note));
  if (signatureInvalidatingOperations.has(options.operationId) && sourcePdf.length && outputPdf.length) {
    const changedBytes = sourcePdfArtifacts.length !== outputPdfArtifacts.length
      || sourcePdfArtifacts.some((source, index) => {
        const output = outputPdfArtifacts[index];
        if (!output || source.bytes.byteLength !== output.bytes.byteLength) return true;
        for (let byte = 0; byte < source.bytes.byteLength; byte += 1) if (source.bytes[byte] !== output.bytes[byte]) return true;
        return false;
      });
    if (changedBytes) notes.push("The PDF bytes changed. Existing cryptographic/digital signatures require re-validation and generally cannot remain valid after document modification.");
  }

  const warningChecks = checks.filter((item) => item.outcome === "warning").length;
  const level: TrustLevel = warningChecks || notes.length ? "verified-with-notes" : "verified";
  return {
    schemaVersion: 1,
    operationId: options.operationId,
    level,
    headline: level === "verified"
      ? "Output checked"
      : "Output checked · review notes",
    generatedAt: Date.now(),
    facts,
    checks,
    notes: [...new Set(notes)],
    lossy: explicitLoss
  };
}
