import { readFile } from "node:fs/promises";

const read = path => readFile(path, "utf8");
const [promotion, postRelease, stable, verifier, p10, freezeText, pkgText] = await Promise.all([
  read(".github/workflows/promote-stable.yml"),
  read(".github/workflows/post-release-verification.yml"),
  read(".github/workflows/release.yml"),
  read("scripts/p10/verify-promotion-certificate.mjs"),
  read("docs/product/P10_STABLE_RELEASE_PROMOTION.md"),
  read("docs/p9/release-freeze.json"),
  read("package.json")
]);
const freeze = JSON.parse(freezeText);
const pkg = JSON.parse(pkgText);
const checks = [];
function check(condition, name) {
  const passed = Boolean(condition);
  checks.push({ name, passed });
  if (!passed) throw new Error(`P10 stable-promotion audit failed: ${name}`);
}

check(pkg.version === freeze.version && freeze.stableTag === `v${pkg.version}`, "P10 version/tag identity is inherited from the P9 freeze");
check(freeze.projectPackageVersion === 9 && freeze.databaseSchemaVersion === 13 && freeze.nativeEditorSchemaVersion === 6, "P10 leaves frozen persistent formats unchanged");

check(promotion.includes("workflow_dispatch:"), "Stable promotion is manual rather than automatic");
check(promotion.includes("candidate_sha:") && promotion.includes("confirmation:"), "Promotion requires exact SHA and explicit confirmation inputs");
check(promotion.includes('test "$CONFIRMATION" = "PROMOTE v7.1.4"'), "Promotion requires the exact human confirmation phrase");
check(promotion.includes('git merge-base --is-ancestor "$CANDIDATE_SHA" refs/remotes/origin/main'), "Candidate must already be reachable from main");
check(promotion.includes("P10 never replaces a Stable tag"), "Existing Stable tags fail closed");
check(promotion.includes("release-completion.yml/runs") && promotion.includes('head_sha="$CANDIDATE_SHA"') && promotion.includes("status=success"), "Promotion locates successful exact-head P9 Release completion evidence");
check(promotion.includes("v7.1.4-release-certificate") && promotion.includes("expired == false"), "Promotion requires an unexpired exact-version P9 certificate artifact");
check(promotion.includes("verify-promotion-certificate.mjs") && promotion.includes('git worktree add --detach /tmp/p10-candidate "$CANDIDATE_SHA"') && promotion.includes("/tmp/p10-candidate"), "Certificate is revalidated against a detached exact-candidate source tree while the P10 verifier remains available");
check(promotion.includes("STABLE_PROMOTION_TOKEN") && promotion.includes("default GITHUB_TOKEN is deliberately not used"), "Stable tag push requires a dedicated credential that can trigger the tag workflow");
check(promotion.includes('git tag -a "$TAG" "$CANDIDATE_SHA"') && promotion.includes('git push "https://x-access-token:${PROMOTION_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "refs/tags/$TAG"'), "Promotion creates only the annotated immutable Stable tag with the dedicated credential");
check(promotion.includes("v7.1.4-promotion-receipt"), "Promotion retains a durable receipt");

check(verifier.includes("AUTOMATED_RELEASE_MATRIX_PASS"), "Certificate verifier requires a passing P9 matrix");
check(verifier.includes("freezeSha256") && verifier.includes("releaseNotesSha256"), "Certificate verifier binds frozen release contract hashes");
check(verifier.includes('CHANNELS = ["release-candidate", "stable"]') && verifier.includes("mobile-chromium") && verifier.includes("tablet-webkit"), "Certificate verifier requires both channels and all browser profiles");
check(verifier.includes("failed, 0") && verifier.includes("retries, 0") && verifier.includes("flaky, 0"), "Certificate verifier rejects failed, retried, and flaky evidence");

check(stable.includes('tags: ["v7.1.4"]'), "Existing Stable workflow remains tag-triggered");
check(stable.includes("Run frozen v7 web release gate") && stable.includes("Browser-qualify exact stable artifact"), "Stable tag still triggers independent release qualification");
check(stable.includes("smoke-stable") && stable.includes("action-gh-release"), "Stable publication remains downstream of deployed smoke verification");

check(postRelease.includes("release:") && postRelease.includes("types: [published]"), "Post-release verification starts only after publication");
check(postRelease.includes("sha256sum -c") && postRelease.includes("pdf-studio-v7.1.4.sha256"), "Published release assets are checksum-verified");
check(postRelease.includes('"channel": "stable"') && postRelease.includes('"version": "7.1.4"'), "Published asset and deployment identity are Stable v7.1.4");
check(postRelease.includes("release-integrity.json") && postRelease.includes("offline-assets.json"), "Post-release verification checks integrity and offline manifests");
check(postRelease.includes("v7.1.4-post-release-certificate"), "Post-release verification emits durable evidence");

check(p10.includes("P9 remains the source/product freeze") && p10.includes("P10 may not promote anything until"), "P10 documentation preserves P9 as the mandatory prerequisite");
check(p10.includes("does not automatically merge P9 or P10"), "P10 does not silently perform repository merges");

console.log(JSON.stringify({
  phase: "P10",
  version: pkg.version,
  status: "P10_PROMOTION_CONTROL_PASS",
  passed: checks.filter(item => item.passed).length,
  total: checks.length,
  checks
}, null, 2));
