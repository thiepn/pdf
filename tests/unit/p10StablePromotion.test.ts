import { describe, expect, it } from "vitest";
import promotionWorkflow from "../../.github/workflows/promote-stable.yml?raw";
import postReleaseWorkflow from "../../.github/workflows/post-release-verification.yml?raw";
import verifierSource from "../../scripts/p10/verify-promotion-certificate.mjs?raw";
import p10Doc from "../../docs/product/P10_STABLE_RELEASE_PROMOTION.md?raw";
import releaseWorkflow from "../../.github/workflows/release.yml?raw";
import releaseSource from "../../src/core/release.ts?raw";

describe("P10 stable release promotion", () => {
  it("requires explicit manual promotion of an exact certified SHA", () => {
    expect(promotionWorkflow).toContain("workflow_dispatch:");
    expect(promotionWorkflow).toContain("candidate_sha:");
    expect(promotionWorkflow).toContain("confirmation:");
    expect(promotionWorkflow).toContain('test "$CONFIRMATION" = "PROMOTE v7.1.4"');
    expect(promotionWorkflow).toContain('git merge-base --is-ancestor "$CANDIDATE_SHA" refs/remotes/origin/main');
    expect(promotionWorkflow).toContain("No successful Release completion run exists for exact candidate");
  });

  it("refuses tag replacement and uses the exact P9 certificate artifact", () => {
    expect(promotionWorkflow).toContain('refs/tags/$TAG');
    expect(promotionWorkflow).toContain("P10 never replaces a Stable tag");
    expect(promotionWorkflow).toContain("v7.1.4-release-certificate");
    expect(promotionWorkflow).toContain("verify-promotion-certificate.mjs");
    expect(promotionWorkflow).toContain('git tag -a "$TAG" "$CANDIDATE_SHA"');
    expect(promotionWorkflow).toContain('git push origin "refs/tags/$TAG"');
  });

  it("verifies the full ten-cell certificate and frozen release hashes", () => {
    expect(verifierSource).toContain('CHANNELS = ["release-candidate", "stable"]');
    expect(verifierSource).toContain('PROJECTS = ["chromium", "firefox", "webkit", "mobile-chromium", "tablet-webkit"]');
    expect(verifierSource).toContain("freezeSha256");
    expect(verifierSource).toContain("releaseNotesSha256");
    expect(verifierSource).toContain("AUTOMATED_RELEASE_MATRIX_PASS");
    expect(verifierSource).toContain("Release certificate does not contain all ten browser/channel cells");
  });

  it("keeps tag-triggered Stable requalification downstream of P10", () => {
    expect(releaseWorkflow).toContain('tags: ["v7.1.4"]');
    expect(releaseWorkflow).toContain("Run frozen v7 web release gate");
    expect(releaseWorkflow).toContain("Browser-qualify exact stable artifact");
    expect(releaseWorkflow).toContain("smoke-stable");
    expect(releaseWorkflow).toContain("action-gh-release");
  });

  it("verifies published assets, checksums and deployed Stable identity", () => {
    expect(postReleaseWorkflow).toContain("release:");
    expect(postReleaseWorkflow).toContain("types: [published]");
    expect(postReleaseWorkflow).toContain("sha256sum -c");
    expect(postReleaseWorkflow).toContain('"channel": "stable"');
    expect(postReleaseWorkflow).toContain("v7.1.4-post-release-certificate");
    expect(postReleaseWorkflow).toContain("release-integrity.json");
    expect(postReleaseWorkflow).toContain("offline-assets.json");
  });

  it("documents the P9 dependency and keeps persistent formats frozen", () => {
    expect(p10Doc).toContain("P9 remains the source/product freeze");
    expect(p10Doc).toContain("P10 may not promote anything until");
    expect(releaseSource).toContain("PROJECT_PACKAGE_VERSION = 9");
    expect(releaseSource).toContain("DATABASE_SCHEMA_VERSION = 13");
  });
});
