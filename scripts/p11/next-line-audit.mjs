import { access, readFile } from "node:fs/promises";

const read = path => readFile(path, "utf8");
const exists = async path => { try { await access(path); return true; } catch { return false; } };

const [manifestText, packageText, lockText, releaseSource, p9FreezeText, p10Promotion, p10PostRelease, p10Doc, stableWorkflow, readme, changelog] = await Promise.all([
  read("docs/p11/next-line.json"),
  read("package.json"),
  read("package-lock.json"),
  read("src/core/release.ts"),
  read("docs/p9/release-freeze.json"),
  read(".github/workflows/promote-stable.yml"),
  read(".github/workflows/post-release-verification.yml"),
  read("docs/product/P10_STABLE_RELEASE_PROMOTION.md"),
  read(".github/workflows/release.yml"),
  read("README.md"),
  read("CHANGELOG.md")
]);

const manifest = JSON.parse(manifestText);
const pkg = JSON.parse(packageText);
const lock = JSON.parse(lockText);
const p9 = JSON.parse(p9FreezeText);
const checks = [];

function check(condition, name) {
  const passed = Boolean(condition);
  checks.push({ name, passed });
  if (!passed) throw new Error(`P11 next-line audit failed: ${name}`);
}

check(manifest.schemaVersion === 1 && manifest.phase === "P11", "P11 next-line manifest schema/phase are frozen");
check(manifest.roadmap === "v7.2-development-line" && manifest.status === "pre-cut", "P11 is explicitly a pre-cut v7.2 roadmap");
check(manifest.currentRelease?.version === "7.1.4" && manifest.currentRelease?.tag === "v7.1.4", "P11 current release remains v7.1.4");
check(manifest.nextRelease?.version === "7.2.0" && manifest.nextRelease?.tag === "v7.2.0", "P11 target release is v7.2.0");
check(manifest.nextRelease?.versionCutState === "blocked-until-post-release", "v7.2 version cut stays blocked before P10 post-release evidence");
check(manifest.currentRelease?.requiredPostReleaseArtifact === "v7.1.4-post-release-certificate", "P11 requires the exact P10 post-release artifact");

check(pkg.version === "7.1.4", "package.json remains v7.1.4 while P11 is pre-cut");
check(lock.version === "7.1.4" && lock.packages?.[""]?.version === "7.1.4", "package-lock remains atomically v7.1.4 while P11 is pre-cut");
check(releaseSource.includes('APP_VERSION = "7.1.4"'), "runtime APP_VERSION remains v7.1.4 while P11 is pre-cut");
check(releaseSource.includes("PROJECT_PACKAGE_VERSION = 9"), "project package schema remains v9");
check(releaseSource.includes("DATABASE_SCHEMA_VERSION = 13"), "database schema remains v13");
check(/NATIVE_EDITOR_SCHEMA_VERSION\s*=\s*6/.test(await read("src/types/nativeEditor.ts")), "native editor schema remains v6");

check(manifest.persistentFormats?.projectPackageVersion === 9 && manifest.persistentFormats?.databaseSchemaVersion === 13 && manifest.persistentFormats?.nativeEditorSchemaVersion === 6, "P11 manifest matches frozen persistent formats");
check(manifest.rules?.preserveV714Tag === true && manifest.rules?.preserveV714ReleaseWorkflows === true, "P11 explicitly preserves v7.1.4 release controls");
check(manifest.rules?.requirePostReleaseCertificateBeforeVersionCut === true && manifest.rules?.requireAtomicVersionCut === true, "P11 requires evidence and atomicity for the future version cut");

check(p9.version === "7.1.4" && p9.stableTag === "v7.1.4", "P9 freeze remains historical v7.1.4 evidence");
check(p10Promotion.includes("PROMOTE v7.1.4") && p10Promotion.includes("v7.1.4-release-certificate"), "P10 promotion remains pinned to v7.1.4");
check(p10PostRelease.includes("v7.1.4-post-release-certificate") && p10PostRelease.includes("P10_POST_RELEASE_PASS"), "P10 post-release evidence remains pinned to v7.1.4");
check(p10Doc.includes("v7.1.4-post-release-certificate"), "P10 documentation retains the v7.1.4 completion boundary");
check(stableWorkflow.includes('tags: ["v7.1.4"]') && stableWorkflow.includes("Publish qualified v7.1.4 stable release"), "Stable workflow remains immutable v7.1.4 release machinery");
check(!stableWorkflow.includes('tags: ["v7.2.0"]'), "P11 does not repurpose v7.1.4 Stable workflow as v7.2 machinery");

check(await exists("scripts/p11/verify-version-cut-readiness.mjs"), "P11 version-cut verifier exists");
check(await exists("scripts/p11/verify-version-cut-readiness.test.mjs"), "P11 version-cut verifier tests exist");
check(readme.includes("v7.2 development line") && readme.includes("pre-cut"), "README exposes the v7.2 pre-cut boundary");
check(changelog.includes("Unreleased — v7.2 development line"), "CHANGELOG starts the v7.2 development line without pretending it is released");

console.log(JSON.stringify({
  phase: "P11",
  status: "P11_NEXT_LINE_PASS",
  currentVersion: manifest.currentRelease.version,
  nextVersion: manifest.nextRelease.version,
  passed: checks.filter(item => item.passed).length,
  total: checks.length,
  checks
}, null, 2));
