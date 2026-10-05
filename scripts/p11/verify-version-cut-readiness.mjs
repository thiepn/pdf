import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export function verifyNextLineCut(postReleaseCertificate, manifest) {
  assert.equal(manifest?.schemaVersion, 1, "Unsupported P11 next-line manifest schema.");
  assert.equal(manifest?.status, "pre-cut", "P11 manifest is not in pre-cut state.");
  assert.equal(manifest?.currentRelease?.version, "7.1.4", "Unexpected current release version.");
  assert.equal(manifest?.currentRelease?.tag, "v7.1.4", "Unexpected current release tag.");
  assert.equal(manifest?.nextRelease?.version, "7.2.0", "Unexpected next release version.");
  assert.equal(manifest?.nextRelease?.tag, "v7.2.0", "Unexpected next release tag.");
  assert.equal(manifest?.nextRelease?.versionCutState, "blocked-until-post-release", "Version cut is not correctly blocked.");

  assert.ok(postReleaseCertificate && typeof postReleaseCertificate === "object", "P10 post-release certificate is missing.");
  assert.equal(postReleaseCertificate.schemaVersion, 1, "Unsupported P10 post-release certificate schema.");
  assert.equal(postReleaseCertificate.status, "P10_POST_RELEASE_PASS", "v7.1.4 post-release verification has not passed.");
  assert.equal(postReleaseCertificate.version, manifest.currentRelease.version, "Post-release certificate version does not match the current release.");
  assert.equal(postReleaseCertificate.tag, manifest.currentRelease.tag, "Post-release certificate tag does not match the current release.");
  assert.match(postReleaseCertificate.releaseSha ?? "", /^[0-9a-f]{40}$/, "Post-release certificate must contain an exact release SHA.");
  assert.ok(String(postReleaseCertificate.githubReleaseId ?? "").length > 0, "Post-release certificate is missing GitHub Release identity.");
  assert.ok(/^https:\/\//.test(postReleaseCertificate.publicUrl ?? ""), "Post-release certificate is missing a deployed Stable URL.");

  return {
    status: "P11_VERSION_CUT_READY",
    currentVersion: manifest.currentRelease.version,
    nextVersion: manifest.nextRelease.version,
    releaseSha: postReleaseCertificate.releaseSha,
    githubReleaseId: postReleaseCertificate.githubReleaseId,
    publicUrl: postReleaseCertificate.publicUrl
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [certificatePath, manifestPath = "docs/p11/next-line.json"] = process.argv.slice(2);
  assert.ok(certificatePath, "Usage: node scripts/p11/verify-version-cut-readiness.mjs <post-release-certificate.json> [next-line.json]");
  const certificate = JSON.parse(await readFile(certificatePath, "utf8"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  console.log(JSON.stringify(verifyNextLineCut(certificate, manifest), null, 2));
}
