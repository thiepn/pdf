import test from "node:test";
import assert from "node:assert/strict";
import { verifyNextLineCut } from "./verify-version-cut-readiness.mjs";

const manifest = {
  schemaVersion: 1,
  status: "pre-cut",
  currentRelease: { version: "7.1.4", tag: "v7.1.4" },
  nextRelease: { version: "7.2.0", tag: "v7.2.0", versionCutState: "blocked-until-post-release" }
};

function certificate(overrides = {}) {
  return {
    schemaVersion: 1,
    status: "P10_POST_RELEASE_PASS",
    version: "7.1.4",
    tag: "v7.1.4",
    releaseSha: "a".repeat(40),
    githubReleaseId: 123,
    publicUrl: "https://example.test/pdf/",
    ...overrides
  };
}

test("accepts the exact v7.1.4 post-release certificate for the v7.2 cut", () => {
  const result = verifyNextLineCut(certificate(), manifest);
  assert.equal(result.status, "P11_VERSION_CUT_READY");
  assert.equal(result.nextVersion, "7.2.0");
});

test("rejects missing or wrong release evidence", () => {
  assert.throws(() => verifyNextLineCut(null, manifest), /missing/);
  assert.throws(() => verifyNextLineCut(certificate({ status: "FAILED" }), manifest), /has not passed/);
  assert.throws(() => verifyNextLineCut(certificate({ version: "7.1.3" }), manifest), /version does not match/);
  assert.throws(() => verifyNextLineCut(certificate({ tag: "v7.1.3" }), manifest), /tag does not match/);
  assert.throws(() => verifyNextLineCut(certificate({ releaseSha: "bad" }), manifest), /exact release SHA/);
});

test("rejects an accidentally activated or retargeted P11 manifest", () => {
  assert.throws(() => verifyNextLineCut(certificate(), { ...manifest, status: "active" }), /pre-cut/);
  assert.throws(() => verifyNextLineCut(certificate(), { ...manifest, nextRelease: { ...manifest.nextRelease, version: "8.0.0" } }), /Unexpected next release version/);
});
