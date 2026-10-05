import { describe, expect, it } from "vitest";
import manifestSource from "../../docs/p11/next-line.json?raw";
import p11Doc from "../../docs/product/P11_V72_DEVELOPMENT_LINE.md?raw";
import packageSource from "../../package.json?raw";
import lockSource from "../../package-lock.json?raw";
import releaseSource from "../../src/core/release.ts?raw";
import p9FreezeSource from "../../docs/p9/release-freeze.json?raw";
import promotionWorkflow from "../../.github/workflows/promote-stable.yml?raw";
import postReleaseWorkflow from "../../.github/workflows/post-release-verification.yml?raw";
import stableWorkflow from "../../.github/workflows/release.yml?raw";

const manifest = JSON.parse(manifestSource);
const pkg = JSON.parse(packageSource);
const lock = JSON.parse(lockSource);
const p9 = JSON.parse(p9FreezeSource);

describe("P11 v7.2 development-line foundation", () => {
  it("defines v7.2 as next release without cutting executable version identity yet", () => {
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      phase: "P11",
      roadmap: "v7.2-development-line",
      status: "pre-cut",
      currentRelease: { version: "7.1.4", tag: "v7.1.4" },
      nextRelease: { version: "7.2.0", tag: "v7.2.0", versionCutState: "blocked-until-post-release" }
    });
    expect(pkg.version).toBe("7.1.4");
    expect(lock.version).toBe("7.1.4");
    expect(lock.packages[""].version).toBe("7.1.4");
    expect(releaseSource).toContain('APP_VERSION = "7.1.4"');
  });

  it("requires real P10 post-release evidence before the atomic version cut", () => {
    expect(manifest.currentRelease.requiredPostReleaseArtifact).toBe("v7.1.4-post-release-certificate");
    expect(manifest.rules.requirePostReleaseCertificateBeforeVersionCut).toBe(true);
    expect(manifest.rules.requireAtomicVersionCut).toBe(true);
    expect(p11Doc).toContain("Atomic version cut");
    expect(p11Doc).toContain("P10_POST_RELEASE_PASS");
  });

  it("keeps v7.1.4 P9/P10/Stable release machinery immutable", () => {
    expect(p9.version).toBe("7.1.4");
    expect(p9.stableTag).toBe("v7.1.4");
    expect(promotionWorkflow).toContain("PROMOTE v7.1.4");
    expect(postReleaseWorkflow).toContain("v7.1.4-post-release-certificate");
    expect(stableWorkflow).toContain('tags: ["v7.1.4"]');
    expect(stableWorkflow).not.toContain('tags: ["v7.2.0"]');
  });

  it("keeps persistent formats frozen at the inherited v7.1.4 boundary", () => {
    expect(manifest.persistentFormats).toEqual({
      projectPackageVersion: 9,
      databaseSchemaVersion: 13,
      nativeEditorSchemaVersion: 6
    });
    expect(releaseSource).toContain("PROJECT_PACKAGE_VERSION = 9");
    expect(releaseSource).toContain("DATABASE_SCHEMA_VERSION = 13");
  });
});
