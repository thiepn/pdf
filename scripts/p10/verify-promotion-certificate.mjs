import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const CHANNELS = ["release-candidate", "stable"];
export const PROJECTS = ["chromium", "firefox", "webkit", "mobile-chromium", "tablet-webkit"];

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export async function loadPromotionContract(root = new URL("../../", import.meta.url)) {
  const packageBytes = await readFile(new URL("package.json", root));
  const freezeBytes = await readFile(new URL("docs/p9/release-freeze.json", root));
  const pkg = JSON.parse(packageBytes.toString("utf8"));
  const freeze = JSON.parse(freezeBytes.toString("utf8"));
  const notesBytes = await readFile(new URL(freeze.releaseNotes, root));
  return {
    version: pkg.version,
    stableTag: freeze.stableTag,
    roadmap: freeze.roadmap,
    projectPackageVersion: freeze.projectPackageVersion,
    databaseSchemaVersion: freeze.databaseSchemaVersion,
    nativeEditorSchemaVersion: freeze.nativeEditorSchemaVersion,
    freezeSha256: sha256(freezeBytes),
    releaseNotesPath: freeze.releaseNotes,
    releaseNotesSha256: sha256(notesBytes),
    certificateArtifact: freeze.certificateArtifact
  };
}

export function verifyPromotionCertificate(certificate, expectedSha, contract) {
  assert.match(expectedSha ?? "", /^[0-9a-f]{40}$/, "Promotion requires an exact 40-character candidate SHA.");
  assert.ok(certificate && typeof certificate === "object", "Release certificate is missing.");
  assert.equal(certificate.schemaVersion, 2, "Unsupported release-certificate schema.");
  assert.equal(certificate.status, "AUTOMATED_RELEASE_MATRIX_PASS", "Release matrix is not certified.");
  assert.equal(certificate.sourceSha, expectedSha, "Release certificate does not belong to the requested candidate SHA.");
  assert.equal(certificate.version, contract.version, "Release certificate version differs from package.json.");
  assert.equal(certificate.stableTag, contract.stableTag, "Release certificate stable tag differs from the P9 freeze.");
  assert.equal(certificate.roadmap, contract.roadmap, "Release certificate roadmap differs from the P9 freeze.");
  assert.equal(certificate.projectPackageVersion, contract.projectPackageVersion, "Project package version differs from the certified release.");
  assert.equal(certificate.databaseSchemaVersion, contract.databaseSchemaVersion, "Database schema differs from the certified release.");
  assert.equal(certificate.nativeEditorSchemaVersion, contract.nativeEditorSchemaVersion, "Native editor schema differs from the certified release.");
  assert.equal(certificate.freezeSha256, contract.freezeSha256, "P9 freeze manifest changed after certification.");
  assert.equal(certificate.releaseNotesPath, contract.releaseNotesPath, "Curated release-notes path differs from the certified release.");
  assert.equal(certificate.releaseNotesSha256, contract.releaseNotesSha256, "Curated release notes changed after certification.");

  assert.ok(Array.isArray(certificate.matrix), "Release certificate matrix is missing.");
  assert.equal(certificate.matrix.length, CHANNELS.length * PROJECTS.length, "Release certificate does not contain all ten browser/channel cells.");

  const keys = new Set();
  for (const row of certificate.matrix) {
    assert.ok(CHANNELS.includes(row.channel), `Unexpected release channel: ${row.channel}`);
    assert.ok(PROJECTS.includes(row.project), `Unexpected browser project: ${row.project}`);
    const key = `${row.channel}:${row.project}`;
    assert.ok(!keys.has(key), `Duplicate release-certificate matrix row: ${key}`);
    keys.add(key);
    assert.ok(Number.isInteger(row.passed) && row.passed > 0, `No passing tests recorded for ${key}`);
    assert.equal(row.failed, 0, `Failed tests recorded for ${key}`);
    assert.equal(row.retries, 0, `Retries recorded for ${key}`);
    assert.equal(row.flaky, 0, `Flaky tests recorded for ${key}`);
  }
  for (const channel of CHANNELS) for (const project of PROJECTS) {
    assert.ok(keys.has(`${channel}:${project}`), `Missing matrix row: ${channel}:${project}`);
  }
  assert.ok(certificate.totals?.passed > 0, "Release certificate contains no passing tests.");
  return {
    version: contract.version,
    tag: contract.stableTag,
    sourceSha: expectedSha,
    certificateRunId: certificate.runId,
    matrixCells: keys.size,
    passed: certificate.totals.passed,
    skipped: certificate.totals.skipped ?? 0
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [certificatePath, expectedSha, sourceRoot] = process.argv.slice(2);
  assert.ok(certificatePath && expectedSha, "Usage: node scripts/p10/verify-promotion-certificate.mjs <certificate.json> <candidate-sha> [candidate-source-root]");
  const certificate = JSON.parse(await readFile(certificatePath, "utf8"));
  const root = sourceRoot ? pathToFileURL(resolve(sourceRoot) + "/") : undefined;
  const contract = await loadPromotionContract(root);
  const result = verifyPromotionCertificate(certificate, expectedSha, contract);
  console.log(JSON.stringify({ status: "P10_PROMOTION_CERTIFICATE_PASS", ...result }, null, 2));
}
