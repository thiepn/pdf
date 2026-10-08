import type { PreservationCategory, PreservationGraph } from "../types/preservation";

export type SmartOptimizationMode = "careful" | "compact";
export interface SmartOptimizationSettings { mode: SmartOptimizationMode }
export interface SmartCandidate {
  variant: string;
  bytes: number;
  passed: boolean;
  failures: string[];
}
export interface SmartOptimizationDecision {
  candidate: SmartCandidate | null;
  savedBytes: number;
  rejected: SmartCandidate[];
  reason: string;
}

export const SMART_MODES: Record<SmartOptimizationMode, { label: string; description: string; saveOptions: readonly string[] }> = {
  careful: {
    label: "Safe structural cleanup",
    description: "Recompress unchanged streams and deduplicate without rasterizing pages.",
    saveOptions: ["garbage=2,compress=yes,compress-images=yes,compress-fonts=yes,encrypt=keep"]
  },
  compact: {
    label: "Maximum verified cleanup",
    description: "Try safe and more aggressive object cleanup; keep only byte-smaller, fidelity-verified results.",
    saveOptions: [
      "garbage=2,compress=yes,compress-images=yes,compress-fonts=yes,encrypt=keep",
      "garbage=4,clean=yes,compress=yes,compress-images=yes,compress-fonts=yes,encrypt=keep"
    ]
  }
};

export const SMART_PRESERVED_CATEGORIES: readonly PreservationCategory[] = [
  "pages", "text", "images", "vectors", "fonts", "annotations",
  "forms", "links", "bookmarks", "attachments", "layers", "metadata",
  "signatures", "tags", "encryption"
];

export function assertSmartOptimizationSafe(
  source: Pick<PreservationGraph, "counts" | "encrypted">,
  flags: { signed: boolean; certified: boolean; repaired: boolean; incrementalRevisions: boolean }
): void {
  if (source.encrypted || source.counts.encryption > 0) throw new Error("Smart optimization refuses encrypted PDFs; a rewrite could alter document security.");
  if (flags.signed || source.counts.signatures > 0 || flags.certified) throw new Error("Smart optimization refuses signed or certified PDFs; a rewrite could invalidate signatures.");
  if (flags.repaired) throw new Error("Smart optimization refuses repaired or malformed PDF sources. Repair a separate copy first.");
  if (flags.incrementalRevisions) throw new Error("Smart optimization refuses PDFs with previous incremental revisions to preserve revision history.");
}

export function selectSmartCandidate(originalBytes: number, candidates: readonly SmartCandidate[]): SmartOptimizationDecision {
  if (!Number.isSafeInteger(originalBytes) || originalBytes <= 0) throw new Error("Original PDF byte length is invalid.");
  const smallerAndValid = candidates
    .filter((candidate) => candidate.passed && Number.isSafeInteger(candidate.bytes) && candidate.bytes > 0 && candidate.bytes < originalBytes)
    .sort((a, b) => a.bytes - b.bytes);
  const best = smallerAndValid[0] ?? null;
  return {
    candidate: best,
    savedBytes: best ? originalBytes - best.bytes : 0,
    rejected: candidates.filter((item) => !item.passed),
    reason: best
      ? `Verified ${best.variant} and saved ${originalBytes - best.bytes} bytes without observed structural changes.`
      : "No smaller candidate satisfied every preservation check. Original PDF bytes were retained."
  };
}
