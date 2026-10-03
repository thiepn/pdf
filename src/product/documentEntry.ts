import { inspectDetailedPdf, openPdfWithPdfJs, type DetailedPdfInspection } from "../engines/pdfjs";
import { getTask } from "../ia/taskCatalog";
import { loadProjectBytes } from "../projects/projectRepository";
import { inspectSecurity } from "../security/securityClient";
import { readProjectSessionPassword } from "../security/sessionPasswords";
import type { ProjectManifest } from "../types/project";
import type { SecurityInspectionReport } from "../types/security";

export interface DocumentEntryEvidence {
  pageCount: number;
  byteLength: number;
  encrypted: boolean;
  formFieldCount: number;
  annotationCount: number;
  attachmentCount: number;
  hasJavaScript: boolean;
  metadataFieldCount: number;
  textCharacters?: number;
  imageOperations?: number;
  pagesWithText?: number;
  pagesWithImages?: number;
  likelyScanned?: boolean;
  imageHeavy?: boolean;
  fillableFormFieldCount?: number;
  signatureFieldCount?: number;
  signatureCount?: number;
  signedSignatureCount?: number;
  versionCount?: number;
  repaired?: boolean;
  hasOpenAction?: boolean;
  hasAdditionalActions?: boolean;
  warnings: string[];
  sources: {
    manifest: true;
    structure: boolean;
    security: boolean;
  };
}

export interface DocumentEntryRecommendation {
  taskId: string;
  label: string;
  reason: string;
  evidence: string;
  priority: number;
  warning?: string;
}

interface Candidate extends DocumentEntryRecommendation {
  order: number;
}

function countManifestMetadata(project: ProjectManifest): number {
  return [
    project.summary.title,
    project.summary.author,
    project.summary.subject,
    project.summary.creator,
    project.summary.producer
  ].filter((value) => Boolean(value?.trim())).length;
}

export function documentEntryEvidenceFromProject(project: ProjectManifest): DocumentEntryEvidence {
  return {
    pageCount: project.summary.pageCount,
    byteLength: project.byteLength,
    encrypted: project.summary.encrypted,
    formFieldCount: project.summary.formFieldCount ?? 0,
    annotationCount: project.summary.annotationCount ?? 0,
    attachmentCount: project.summary.attachmentCount ?? 0,
    hasJavaScript: project.summary.hasJavaScript ?? false,
    metadataFieldCount: countManifestMetadata(project),
    warnings: [],
    sources: { manifest: true, structure: false, security: false }
  };
}

function mergeStructure(evidence: DocumentEntryEvidence, details: DetailedPdfInspection): DocumentEntryEvidence {
  const pages = Math.max(1, details.pages.length);
  const pagesWithText = details.pages.filter((page) => page.textCharacters >= 32).length;
  const pagesWithImages = details.pages.filter((page) => page.imageOperations > 0).length;
  const averageText = details.totals.textCharacters / pages;
  const likelyScanned = pagesWithImages >= Math.ceil(pages * 0.6)
    && pagesWithText <= Math.floor(pages * 0.35)
    && averageText < 120;
  const imageHeavy = pagesWithImages >= Math.ceil(pages * 0.5)
    || details.totals.imageOperations >= pages * 2;

  return {
    ...evidence,
    formFieldCount: Math.max(evidence.formFieldCount, details.formFieldCount),
    annotationCount: Math.max(evidence.annotationCount, details.totals.annotations),
    attachmentCount: Math.max(evidence.attachmentCount, details.attachmentCount),
    metadataFieldCount: Math.max(evidence.metadataFieldCount, Object.keys(details.metadata).length),
    textCharacters: details.totals.textCharacters,
    imageOperations: details.totals.imageOperations,
    pagesWithText,
    pagesWithImages,
    likelyScanned,
    imageHeavy,
    sources: { ...evidence.sources, structure: true }
  };
}

function mergeSecurity(evidence: DocumentEntryEvidence, report: SecurityInspectionReport): DocumentEntryEvidence {
  const signatureFields = report.formFields.filter((field) => field.type === "signature");
  const signedSignatures = report.signatures.filter((signature) => signature.signed === true);
  const fillable = report.formFields.filter((field) => !field.readOnly && field.type !== "signature" && field.type !== "button");
  return {
    ...evidence,
    encrypted: evidence.encrypted || report.encrypted,
    formFieldCount: Math.max(evidence.formFieldCount, report.formFields.length),
    annotationCount: Math.max(evidence.annotationCount, report.annotationCount),
    attachmentCount: Math.max(evidence.attachmentCount, report.attachmentCount),
    hasJavaScript: evidence.hasJavaScript || report.hasJavaScript,
    metadataFieldCount: Math.max(evidence.metadataFieldCount, Object.keys(report.metadata).length),
    fillableFormFieldCount: fillable.length,
    signatureFieldCount: signatureFields.length,
    signatureCount: report.signatures.length,
    signedSignatureCount: signedSignatures.length,
    versionCount: report.versionCount,
    repaired: report.repaired,
    hasOpenAction: report.hasOpenAction,
    hasAdditionalActions: report.hasAdditionalActions,
    warnings: [...new Set([...evidence.warnings, ...report.warnings])],
    sources: { ...evidence.sources, security: true }
  };
}

export async function inspectDocumentEntry(project: ProjectManifest, signal?: AbortSignal): Promise<DocumentEntryEvidence> {
  signal?.throwIfAborted();
  const evidence = documentEntryEvidenceFromProject(project);
  const bytes = await loadProjectBytes(project);
  signal?.throwIfAborted();
  const password = readProjectSessionPassword(project.id);
  let document: Awaited<ReturnType<typeof openPdfWithPdfJs>> | null = null;
  try {
    document = await openPdfWithPdfJs(bytes, password);
    const [structure, security] = await Promise.allSettled([
      inspectDetailedPdf(document, signal),
      inspectSecurity(bytes, password, signal)
    ]);
    signal?.throwIfAborted();
    let merged = evidence;
    if (structure.status === "fulfilled") merged = mergeStructure(merged, structure.value);
    else if (!(structure.reason instanceof DOMException && structure.reason.name === "AbortError")) {
      merged = { ...merged, warnings: [...merged.warnings, "Structure inspection could not complete; recommendations use the available document summary."] };
    }
    if (security.status === "fulfilled") merged = mergeSecurity(merged, security.value);
    else if (!(security.reason instanceof DOMException && security.reason.name === "AbortError")) {
      merged = { ...merged, warnings: [...merged.warnings, "Security inspection could not complete; signature and action recommendations may be limited."] };
    }
    return merged;
  } finally {
    if (document) await document.loadingTask.destroy().catch(() => undefined);
  }
}

function evidenceText(parts: Array<string | false | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

export function recommendDocumentEntryTasks(evidence: DocumentEntryEvidence, limit = 4): DocumentEntryRecommendation[] {
  const candidates = new Map<string, Candidate>();
  let order = 0;

  const add = (taskId: string, priority: number, reason: string, evidenceLabel: string, label?: string, warning?: string) => {
    const task = getTask(taskId);
    if (!task) return;
    const candidate: Candidate = {
      taskId,
      label: label ?? task.label,
      reason,
      evidence: evidenceLabel,
      priority,
      warning,
      order: order++
    };
    const current = candidates.get(taskId);
    if (!current || candidate.priority > current.priority) candidates.set(taskId, candidate);
  };

  const megabytes = evidence.byteLength / (1024 * 1024);
  const formCount = evidence.fillableFormFieldCount ?? evidence.formFieldCount;
  const signatures = evidence.signatureCount ?? 0;
  const signedSignatures = evidence.signedSignatureCount ?? 0;
  const signatureFields = evidence.signatureFieldCount ?? 0;
  const riskyActions = evidence.hasJavaScript || evidence.hasOpenAction || evidence.hasAdditionalActions;
  const malformed = Boolean(evidence.repaired || evidence.warnings.some((warning) => /repair|malformed|xref|structure/i.test(warning)));

  if (malformed) {
    add("repair-pdf", 220, "Create a clean rewritten copy before doing more work with a PDF that needed structural recovery.", evidence.repaired ? "Repair detected" : "Structural warning", "Repair this PDF");
    add("document-details", 145, "Review the structure and recovery evidence before making additional changes.", "Structural recovery evidence", "Inspect what was repaired");
  }

  if (signedSignatures > 0 || signatures > 0) {
    add("document-details", 210, "Review signature objects and change history before modifying the document.", evidenceText([
      "${signatures || signedSignatures} signature${(signatures || signedSignatures) === 1 ? "" : "s"}",
      evidence.versionCount && evidence.versionCount > 1 ? "${evidence.versionCount} revisions" : undefined
    ]), "Review signatures");
    add("edit-pdf", 145, "Work on a separate editable copy while keeping the signed source unchanged.", "Existing signature coverage", "Edit a copy", "Changing PDF bytes means the changed copy cannot retain the original signature's validity over those new bytes.");
  }

  if (riskyActions || evidence.attachmentCount > 0) {
    add("sanitize-pdf", 195, "Review and remove active or embedded content before sharing a cleaned copy.", evidenceText([
      evidence.hasJavaScript ? "JavaScript detected" : undefined,
      evidence.hasOpenAction || evidence.hasAdditionalActions ? "Automatic actions detected" : undefined,
      evidence.attachmentCount ? "${evidence.attachmentCount} attachment${evidence.attachmentCount === 1 ? "" : "s"}" : undefined
    ]), "Clean risky content");
    add("document-details", 120, "Inspect active content, attachments, revisions, and security details.", "Interactive/embedded content", "Inspect document structure");
  }

  if (formCount > 0) {
    add("fill-forms", 200, "Open the supported interactive fields instead of placing ordinary text over the page.", "${formCount} fillable form field${formCount === 1 ? "" : "s"}", "Fill ${formCount} form field${formCount === 1 ? "" : "s"}");
    add("flatten-pdf", 115, "Create a static copy after form filling when interactivity is no longer needed.", "${evidence.formFieldCount} form widget${evidence.formFieldCount === 1 ? "" : "s"}", "Flatten when finished");
  }

  if (signatureFields > 0 && signedSignatures === 0) {
    add("visual-signature", 135, "The PDF contains signature fields; add an appearance signature if that matches the document workflow.", "${signatureFields} signature field${signatureFields === 1 ? "" : "s"}", "Add a visual signature", "This is appearance-only signing, not certificate-backed digital signing.");
  }

  if (evidence.likelyScanned) {
    add("ocr-pdf", 205, "Recognize the page images so the scan becomes searchable and easier to copy from.", evidenceText([
      evidence.pagesWithImages !== undefined ? "${evidence.pagesWithImages}/${evidence.pageCount} pages contain images" : undefined,
      evidence.textCharacters !== undefined ? "${evidence.textCharacters.toLocaleString()} selectable text characters" : undefined
    ]), "Make this scan searchable");
    add("compress-pdf", 130, "Image-heavy scans are often the best candidates for meaningful file-size reduction.", evidenceText(["${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB", "Image-heavy pages"]), "Compress this scan");
  } else if ((evidence.textCharacters ?? 0) > 100) {
    add("edit-pdf", 85, "This document contains selectable text and is a good candidate for direct content editing.", "${(evidence.textCharacters ?? 0).toLocaleString()} text characters", "Edit document content");
    add("pdf-to-text", 58, "Export the selectable text directly when you only need the document contents.", "Selectable text detected", "Extract text");
  }

  if (megabytes >= 20) {
    add("compress-pdf", megabytes >= 100 ? 190 : 120, "Reduce the local PDF size while choosing how much structure and image quality to preserve.", "${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB", "Reduce file size");
    if (megabytes >= 100) add("document-details", 95, "Inspect what is making this PDF large before choosing an aggressive compression path.", "${megabytes.toFixed(0)} MB", "Inspect file size");
  }

  if (evidence.annotationCount > 0 && formCount === 0) {
    add("flatten-pdf", 82, "Create a static copy if comments or annotations should no longer remain interactive.", "${evidence.annotationCount} annotation${evidence.annotationCount === 1 ? "" : "s"}", "Flatten annotations");
  }

  if (evidence.encrypted) {
    add("document-details", 92, "Review encryption, permissions, and document security before changing protection.", "Password-protected PDF", "Review protection");
    add("unlock-pdf", 64, "Create an unprotected copy using the password already required to open this PDF.", "Encrypted source", "Remove password protection");
  }

  if (evidence.pageCount >= 40) {
    add("organize-pages", 72, "Large documents are easier to work with after reviewing page order, ranges, and unnecessary pages.", "${evidence.pageCount} pages", "Organize pages");
  }

  if (evidence.metadataFieldCount >= 3) {
    add("metadata", 45, "Review descriptive metadata before sharing or archiving the PDF.", "${evidence.metadataFieldCount} metadata fields", "Review metadata");
  }

  if (!candidates.size) {
    add("edit-pdf", 70, "Open the document editor for supported text, image, vector, table, and annotation changes.", "${evidence.pageCount} page${evidence.pageCount === 1 ? "" : "s"}", "Edit this PDF");
    add("read-pdf", 60, "Read, search, zoom, and print without changing the source.", "Ordinary digital PDF", "Read PDF");
    add("document-details", 35, "Inspect fonts, images, forms, revisions, and PDF structure when you need technical details.", "Local document inspection", "Inspect document");
  }

  if (candidates.size === 1) {
    add("document-details", 30, "Inspect the document structure if you need more context before choosing another operation.", "${evidence.pageCount} page${evidence.pageCount === 1 ? "" : "s"}", "Inspect document");
  }

  return [...candidates.values()]
    .sort((left, right) => right.priority - left.priority || left.order - right.order)
    .slice(0, Math.max(2, Math.min(4, limit)))
    .map(({ order: _order, ...recommendation }) => recommendation);
}
