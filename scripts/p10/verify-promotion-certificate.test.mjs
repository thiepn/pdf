import test from "node:test";
import assert from "node:assert/strict";
import { verifyPromotionCertificate, CHANNELS, PROJECTS } from "./verify-promotion-certificate.mjs";

const sha = "a".repeat(40);
const contract = {
  version: "7.1.4",
  stableTag: "v7.1.4",
  roadmap: "task-first-product-hardening",
  projectPackageVersion: 9,
  databaseSchemaVersion: 13,
  nativeEditorSchemaVersion: 6,
  freezeSha256: "b".repeat(64),
  releaseNotesPath: "docs/releases/v7.1.4/release-notes.md",
  releaseNotesSha256: "c".repeat(64),
  certificateArtifact: "v7.1.4-release-certificate"
};

function certificate(overrides = {}) {
  const matrix = [];
  for (const channel of CHANNELS) for (const project of PROJECTS) {
    matrix.push({ channel, project, passed: 10, skipped: 0, failed: 0, retries: 0, flaky: 0, skipReasons: {} });
  }
  return {
    schemaVersion: 2,
    status: "AUTOMATED_RELEASE_MATRIX_PASS",
    sourceSha: sha,
    runId: "123",
    version: contract.version,
    roadmap: contract.roadmap,
    stableTag: contract.stableTag,
    projectPackageVersion: contract.projectPackageVersion,
    databaseSchemaVersion: contract.databaseSchemaVersion,
    nativeEditorSchemaVersion: contract.nativeEditorSchemaVersion,
    freezeSha256: contract.freezeSha256,
    releaseNotesPath: contract.releaseNotesPath,
    releaseNotesSha256: contract.releaseNotesSha256,
    matrix,
    totals: { passed: 100, skipped: 0 },
    ...overrides
  };
}

test("accepts a complete exact-head P9 release certificate", () => {
  const result = verifyPromotionCertificate(certificate(), sha, contract);
  assert.equal(result.sourceSha, sha);
  assert.equal(result.tag, "v7.1.4");
  assert.equal(result.matrixCells, 10);
});

test("rejects a certificate for another source SHA", () => {
  assert.throws(() => verifyPromotionCertificate(certificate({ sourceSha: "d".repeat(40) }), sha, contract), /does not belong/);
});

test("rejects changed freeze or release notes after certification", () => {
  assert.throws(() => verifyPromotionCertificate(certificate({ freezeSha256: "e".repeat(64) }), sha, contract), /freeze manifest changed/);
  assert.throws(() => verifyPromotionCertificate(certificate({ releaseNotesSha256: "f".repeat(64) }), sha, contract), /release notes changed/);
});

test("rejects incomplete, duplicated, failed, retried or flaky matrix evidence", () => {
  const missing = certificate();
  missing.matrix.pop();
  assert.throws(() => verifyPromotionCertificate(missing, sha, contract), /all ten/);

  const duplicate = certificate();
  duplicate.matrix[9] = { ...duplicate.matrix[0] };
  assert.throws(() => verifyPromotionCertificate(duplicate, sha, contract), /Duplicate|Missing/);

  const failed = certificate();
  failed.matrix[0] = { ...failed.matrix[0], failed: 1 };
  assert.throws(() => verifyPromotionCertificate(failed, sha, contract), /Failed tests/);

  const retried = certificate();
  retried.matrix[0] = { ...retried.matrix[0], retries: 1 };
  assert.throws(() => verifyPromotionCertificate(retried, sha, contract), /Retries/);

  const flaky = certificate();
  flaky.matrix[0] = { ...flaky.matrix[0], flaky: 1 };
  assert.throws(() => verifyPromotionCertificate(flaky, sha, contract), /Flaky/);
});
