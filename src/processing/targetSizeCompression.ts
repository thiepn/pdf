import type { PDFDocumentProxy } from "pdfjs-dist";
import { optimizePdf } from "./processingClient";
import { rasterCompressPdf, type RasterCompressionProfile } from "./rasterCompression";

export type TargetSizePreservation = "preserve-structure" | "allow-raster";
export type TargetSizeOutcome = "target-met" | "best-effort" | "refused";
export type TargetSizeMethod = "structure-preserving" | "raster";

export interface TargetSizeAttempt {
  index: number;
  method: TargetSizeMethod;
  label: string;
  outputBytes: number;
  targetMet: boolean;
  smallerThanSource: boolean;
  dpi?: number;
  quality?: number;
}

export interface TargetSizePreservationSummary {
  mode: "structure-preserved" | "rasterized";
  label: string;
  detail: string;
  searchableText: boolean;
  vectorContent: boolean;
  interactiveContent: boolean;
}

export interface TargetSizeCompressionResult {
  outcome: TargetSizeOutcome;
  bytes?: Uint8Array;
  sourceBytes: number;
  targetBytes: number;
  outputBytes?: number;
  method?: TargetSizeMethod;
  attempts: TargetSizeAttempt[];
  preservation?: TargetSizePreservationSummary;
  warnings: string[];
  message: string;
}

export interface TargetSizeProgress {
  attempt: number;
  maximumAttempts: number;
  detail: string;
  pageProgress?: number;
}

interface Dependencies {
  optimize?: typeof optimizePdf;
  rasterize?: typeof rasterCompressPdf;
}

export const MIN_TARGET_SIZE_BYTES = 64 * 1024;

export const TARGET_SIZE_RASTER_PROFILES: RasterCompressionProfile[] = [
  { id: "target-high", label: "High-fidelity raster fallback", dpi: 200, quality: 0.84, description: "Highest tested raster fidelity." },
  { id: "target-medium-high", label: "Medium-high raster fallback", dpi: 165, quality: 0.78, description: "Moderate raster reduction." },
  { id: "target-balanced", label: "Balanced raster fallback", dpi: 135, quality: 0.68, description: "Balanced raster reduction." },
  { id: "target-small", label: "Small raster fallback", dpi: 105, quality: 0.56, description: "Strong raster reduction." },
  { id: "target-minimum", label: "Minimum raster fallback", dpi: 80, quality: 0.44, description: "Most aggressive bounded raster fallback." }
];

export const MAX_TARGET_SIZE_ATTEMPTS = 1 + TARGET_SIZE_RASTER_PROFILES.length;

const STRUCTURE_SUMMARY: TargetSizePreservationSummary = {
  mode: "structure-preserved",
  label: "PDF structure preserved",
  detail: "The structure-preserving rewrite keeps searchable text, vector page content and interactive PDF objects as PDF content. Digital-signature validity is not guaranteed after any rewrite.",
  searchableText: true,
  vectorContent: true,
  interactiveContent: true
};

const RASTER_SUMMARY: TargetSizePreservationSummary = {
  mode: "rasterized",
  label: "Pages rasterized",
  detail: "The selected fallback converts pages to images. Searchable text, vector content, forms, links, annotations and signature interactivity are not preserved.",
  searchableText: false,
  vectorContent: false,
  interactiveContent: false
};

function smallerCandidate(
  current: { bytes: Uint8Array; method: TargetSizeMethod; preservation: TargetSizePreservationSummary } | undefined,
  candidate: { bytes: Uint8Array; method: TargetSizeMethod; preservation: TargetSizePreservationSummary },
  sourceBytes: number
) {
  if (candidate.bytes.byteLength >= sourceBytes) return current;
  if (!current || candidate.bytes.byteLength < current.bytes.byteLength) return candidate;
  return current;
}

function validateTarget(sourceBytes: number, targetBytes: number): string | undefined {
  if (!Number.isFinite(targetBytes) || targetBytes <= 0) return "Enter a valid target size.";
  if (targetBytes < MIN_TARGET_SIZE_BYTES) return "Targets below 64 KiB are outside the qualified browser compression boundary.";
  if (targetBytes >= sourceBytes) return "The source already meets this target. Choose a target smaller than the source file.";
  return undefined;
}

export async function compressPdfToTarget(
  source: Uint8Array,
  document: PDFDocumentProxy,
  options: {
    targetBytes: number;
    preservation: TargetSizePreservation;
    password?: string;
    removeMetadata?: boolean;
    signal?: AbortSignal;
    onProgress?: (progress: TargetSizeProgress) => void;
  },
  dependencies: Dependencies = {}
): Promise<TargetSizeCompressionResult> {
  const sourceBytes = source.byteLength;
  const targetError = validateTarget(sourceBytes, options.targetBytes);
  if (targetError) {
    return {
      outcome: "refused",
      sourceBytes,
      targetBytes: options.targetBytes,
      attempts: [],
      warnings: [targetError],
      message: targetError
    };
  }

  const optimize = dependencies.optimize ?? optimizePdf;
  const rasterize = dependencies.rasterize ?? rasterCompressPdf;
  const attempts: TargetSizeAttempt[] = [];
  const warnings: string[] = [];
  let best: { bytes: Uint8Array; method: TargetSizeMethod; preservation: TargetSizePreservationSummary } | undefined;

  options.signal?.throwIfAborted();
  options.onProgress?.({ attempt: 1, maximumAttempts: MAX_TARGET_SIZE_ATTEMPTS, detail: "Trying structure-preserving PDF optimization…" });
  const structural = await optimize(source, { password: options.password, removeMetadata: options.removeMetadata }, options.signal);
  warnings.push(...structural.report.warnings);
  const structuralSmaller = structural.bytes.byteLength < sourceBytes;
  const structuralTargetMet = structuralSmaller && structural.bytes.byteLength <= options.targetBytes;
  attempts.push({
    index: 1,
    method: "structure-preserving",
    label: "Structure-preserving optimization",
    outputBytes: structural.bytes.byteLength,
    targetMet: structuralTargetMet,
    smallerThanSource: structuralSmaller
  });
  best = smallerCandidate(best, { bytes: structural.bytes, method: "structure-preserving", preservation: STRUCTURE_SUMMARY }, sourceBytes);

  if (structuralTargetMet) {
    return {
      outcome: "target-met",
      bytes: structural.bytes,
      sourceBytes,
      targetBytes: options.targetBytes,
      outputBytes: structural.bytes.byteLength,
      method: "structure-preserving",
      attempts,
      preservation: STRUCTURE_SUMMARY,
      warnings,
      message: "Target met without rasterizing pages."
    };
  }

  if (options.preservation === "preserve-structure") {
    if (best) {
      return {
        outcome: "best-effort",
        bytes: best.bytes,
        sourceBytes,
        targetBytes: options.targetBytes,
        outputBytes: best.bytes.byteLength,
        method: best.method,
        attempts,
        preservation: best.preservation,
        warnings: [...warnings, "The requested target cannot be reached within the selected structure-preserving boundary."],
        message: "Target not reached. Returning the smallest structure-preserving result."
      };
    }
    const message = "The structure-preserving pass did not make the PDF smaller, so no compressed output is offered.";
    return {
      outcome: "refused",
      sourceBytes,
      targetBytes: options.targetBytes,
      attempts,
      warnings: [...warnings, message],
      message
    };
  }

  for (let profileIndex = 0; profileIndex < TARGET_SIZE_RASTER_PROFILES.length; profileIndex += 1) {
    options.signal?.throwIfAborted();
    const profile = TARGET_SIZE_RASTER_PROFILES[profileIndex];
    const attemptNumber = profileIndex + 2;
    options.onProgress?.({
      attempt: attemptNumber,
      maximumAttempts: MAX_TARGET_SIZE_ATTEMPTS,
      detail: `Trying ${profile.dpi} DPI raster fallback…`
    });
    const rasterBytes = await rasterize(document, profile, options.signal, (completed, total) => {
      options.onProgress?.({
        attempt: attemptNumber,
        maximumAttempts: MAX_TARGET_SIZE_ATTEMPTS,
        detail: `Raster fallback ${profile.dpi} DPI · page ${completed} of ${total}`,
        pageProgress: total ? completed / total : 0
      });
    });
    const smaller = rasterBytes.byteLength < sourceBytes;
    const targetMet = smaller && rasterBytes.byteLength <= options.targetBytes;
    attempts.push({
      index: attemptNumber,
      method: "raster",
      label: profile.label,
      outputBytes: rasterBytes.byteLength,
      targetMet,
      smallerThanSource: smaller,
      dpi: profile.dpi,
      quality: profile.quality
    });
    best = smallerCandidate(best, { bytes: rasterBytes, method: "raster", preservation: RASTER_SUMMARY }, sourceBytes);
    if (targetMet) {
      return {
        outcome: "target-met",
        bytes: rasterBytes,
        sourceBytes,
        targetBytes: options.targetBytes,
        outputBytes: rasterBytes.byteLength,
        method: "raster",
        attempts,
        preservation: RASTER_SUMMARY,
        warnings: [...warnings, RASTER_SUMMARY.detail],
        message: `Target met after ${attemptNumber} bounded attempts using ${profile.dpi} DPI raster fallback.`
      };
    }
  }

  if (best) {
    return {
      outcome: "best-effort",
      bytes: best.bytes,
      sourceBytes,
      targetBytes: options.targetBytes,
      outputBytes: best.bytes.byteLength,
      method: best.method,
      attempts,
      preservation: best.preservation,
      warnings: [
        ...warnings,
        "The requested target was not reached by the bounded compression ladder. The smallest real improvement is offered as best effort.",
        ...(best.method === "raster" ? [RASTER_SUMMARY.detail] : [])
      ],
      message: "Target not reached. Returning the smallest output produced by the bounded attempts."
    };
  }

  const message = "None of the bounded compression attempts produced a file smaller than the source.";
  return {
    outcome: "refused",
    sourceBytes,
    targetBytes: options.targetBytes,
    attempts,
    warnings: [...warnings, message],
    message
  };
}
