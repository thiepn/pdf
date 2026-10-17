/**
 * F1 qualification helpers. Deliberately separate from production PDF writers.
 * Byte-prefix tests are necessary, not sufficient: readers, signatures and
 * security-sensitive workflows still need independent validation.
 */
const NON_INCREMENTAL_OPERATIONS = new Set([
  "redact-apply", "sanitize", "remove-hidden-data", "secure-delete",
  "encrypt-change", "repair", "optimize", "merge", "split",
  "extract", "rearrange", "replace-source", "rasterize"
]);
const CANDIDATE_OPERATIONS = new Set(["annotate", "form-fill", "metadata"]);

export function assessIncrementalEligibility({
  operation,
  canSaveIncrementally = false,
  wasRepaired = false,
  containsSignatures = false,
  isEncrypted = false,
  browserWorkerQualified = false
} = {}) {
  const reasons = [];
  if (NON_INCREMENTAL_OPERATIONS.has(operation)) reasons.push("Operation requires a full rewrite; old bytes must not remain recoverable or the page graph changes.");
  else if (!CANDIDATE_OPERATIONS.has(operation)) reasons.push("Operation is not on the reviewed allowlist.");
  if (!canSaveIncrementally) reasons.push("MuPDF did not approve incremental writing for this document.");
  if (wasRepaired) reasons.push("Repaired PDFs must be rewritten and independently validated.");
  if (containsSignatures) reasons.push("Signature permissions and validity need separate document-specific verification.");
  if (isEncrypted) reasons.push("Encrypted input needs a separate credentials and permission qualification.");
  if (!browserWorkerQualified) reasons.push("Browser Worker incremental-save qualification has not passed.");
  return { allowed: reasons.length === 0, reasons };
}

export function hasExactPrefix(original, output) {
  if (!(original instanceof Uint8Array) || !(output instanceof Uint8Array) || output.byteLength <= original.byteLength) return false;
  for (let i = 0; i < original.byteLength; i++) if (original[i] !== output[i]) return false;
  return true;
}

export function assessIncrementalOutput(original, output, beforeVersions, afterVersions) {
  const failures = [];
  if (!hasExactPrefix(original, output)) failures.push("Saved bytes do not preserve the entire source as an unchanged prefix.");
  if (!Number.isInteger(beforeVersions) || !Number.isInteger(afterVersions) || afterVersions <= beforeVersions) {
    failures.push("MuPDF did not report a new, reopenable incremental version.");
  }
  return {
    passed: failures.length === 0,
    sourceBytes: original.byteLength,
    outputBytes: output.byteLength,
    addedBytes: output.byteLength - original.byteLength,
    beforeVersions,
    afterVersions,
    failures
  };
}
