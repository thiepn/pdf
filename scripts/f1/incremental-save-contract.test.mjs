import assert from "node:assert/strict";
import test from "node:test";
import { assessIncrementalEligibility, assessIncrementalOutput, hasExactPrefix } from "./incremental-save-contract.mjs";

test("F1 remains fail-closed until the browser Worker qualifies", () => {
  const decision = assessIncrementalEligibility({ operation: "annotate", canSaveIncrementally: true });
  assert.equal(decision.allowed, false);
  assert.match(decision.reasons.join(" "), /Browser Worker/);
});

test("F1 allows only audited, qualified non-destructive operations", () => {
  for (const operation of ["annotate", "form-fill", "metadata"]) {
    assert.equal(assessIncrementalEligibility({ operation, canSaveIncrementally: true, browserWorkerQualified: true }).allowed, true);
  }
  for (const operation of ["redact-apply", "sanitize", "secure-delete", "optimize", "merge", "split", "extract", "repair", "replace-source", "rasterize", "unknown"]) {
    assert.equal(assessIncrementalEligibility({ operation, canSaveIncrementally: true, browserWorkerQualified: true }).allowed, false);
  }
});

test("F1 refuses repaired, signed, encrypted or MuPDF-ineligible sources", () => {
  for (const flag of [{ wasRepaired: true }, { containsSignatures: true }, { isEncrypted: true }, { canSaveIncrementally: false }]) {
    assert.equal(assessIncrementalEligibility({ operation: "metadata", canSaveIncrementally: true, browserWorkerQualified: true, ...flag }).allowed, false);
  }
});

test("F1 requires a strictly longer, exact source prefix and a new version", () => {
  const source = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 55]);
  const appended = Uint8Array.from([...source, 10, 120, 114, 101, 102]);
  assert.equal(hasExactPrefix(source, appended), true);
  assert.equal(assessIncrementalOutput(source, appended, 1, 2).passed, true);
  assert.equal(assessIncrementalOutput(source, appended, 2, 2).passed, false);
  assert.equal(assessIncrementalOutput(source, source, 1, 2).passed, false);
  assert.equal(assessIncrementalOutput(source, Uint8Array.from([0, ...source]), 1, 2).passed, false);
});
