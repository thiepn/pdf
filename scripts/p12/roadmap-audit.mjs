import { readFile } from "node:fs/promises";

const read = path => readFile(path, "utf8");
const [intakeText, p11Text, packageText, lockText, releaseSource, nativeSource, p12Doc, known, boundary, workflows] = await Promise.all([
  read("docs/p12/feature-intake.json"),
  read("docs/p11/next-line.json"),
  read("package.json"),
  read("package-lock.json"),
  read("src/core/release.ts"),
  read("src/types/nativeEditor.ts"),
  read("docs/product/P12_V72_PRODUCT_ROADMAP.md"),
  read("KNOWN_LIMITATIONS.md"),
  read("docs/CONSUMER_PRODUCT_BOUNDARY.md"),
  read(".github/workflows/p12-roadmap-ci.yml")
]);

const intake = JSON.parse(intakeText);
const p11 = JSON.parse(p11Text);
const pkg = JSON.parse(packageText);
const lock = JSON.parse(lockText);
const checks = [];
const check = (condition, name) => {
  const passed = Boolean(condition);
  checks.push({ name, passed });
  if (!passed) throw new Error(`P12 roadmap audit failed: ${name}`);
};

check(intake.schemaVersion === 1 && intake.phase === "P12", "P12 intake schema/phase are frozen");
check(intake.roadmap === "v7.2-product-roadmap" && intake.status === "scoped-pre-cut", "P12 is explicitly scoped and pre-cut");
check(intake.parentPhase === "P11", "P12 extends the P11 development-line boundary");
check(intake.releaseBoundary?.currentExecutableVersion === "7.1.4" && intake.releaseBoundary?.targetVersion === "7.2.0", "P12 preserves current/target release identities");
check(intake.releaseBoundary?.versionCutAllowed === false && intake.intakeRules?.versionCutForbiddenInP12 === true, "P12 cannot perform the v7.2 version cut");
check(intake.releaseBoundary?.requiredPostReleaseArtifact === "v7.1.4-post-release-certificate", "P12 retains the exact P10 prerequisite");

check(p11.status === "pre-cut" && p11.nextRelease?.version === "7.2.0", "P11 remains the controlling pre-cut release line");
check(pkg.version === "7.1.4" && lock.version === "7.1.4" && lock.packages?.[""]?.version === "7.1.4", "package identity remains atomically v7.1.4");
check(releaseSource.includes('APP_VERSION = "7.1.4"'), "runtime APP_VERSION remains v7.1.4");
check(releaseSource.includes("PROJECT_PACKAGE_VERSION = 9") && releaseSource.includes("DATABASE_SCHEMA_VERSION = 13"), "project/database schemas remain frozen");
check(/NATIVE_EDITOR_SCHEMA_VERSION\s*=\s*6/.test(nativeSource), "native editor schema remains v6");
check(JSON.stringify(intake.releaseBoundary?.persistentFormats) === JSON.stringify({projectPackageVersion:9,databaseSchemaVersion:13,nativeEditorSchemaVersion:6}), "P12 manifest matches frozen persistent formats");

const items = intake.items ?? [];
const ids = items.map(item => item.id);
check(ids.length === new Set(ids).size, "feature intake IDs are unique");
check(items.length >= 10, "feature intake covers committed, candidate, and deferred scope");
check(items.every(item => intake.intakeRules.allowedDispositions.includes(item.disposition)), "every feature has an allowed disposition");

const committed = items.filter(item => item.disposition === "committed");
const candidates = items.filter(item => item.disposition === "candidate");
const deferred = items.filter(item => item.disposition === "deferred");
check(committed.length === 6, "v7.2 committed scope stays intentionally bounded to six roadmap items");
check(candidates.length >= 3 && deferred.length >= 4, "high-risk work is explicitly triaged instead of silently committed");
check(intake.committedRoadmapOrder.length === committed.length && intake.committedRoadmapOrder.every(id => committed.some(item => item.id === id)), "committed roadmap order exactly covers committed items");
check(committed.every(item => item.outcome && item.evidence?.length > 0 && item.acceptance?.length >= 3), "committed items have evidence-backed measurable acceptance criteria");
check(committed.every(item => item.schemaChange === false), "P12 committed scope does not smuggle in a persistent format migration");
check(deferred.every(item => typeof item.reason === "string" && item.reason.length > 20), "deferred items carry explicit reasons");

check(intake.principles.includes("local-first-privacy") && intake.principles.includes("fidelity-over-fake-parity"), "roadmap encodes product privacy/fidelity principles");
check(intake.nextPhase?.id === "P13" && intake.nextPhase?.roadmapItem === "V72-01", "P13 starts with visual page composition");
check(p12Doc.includes("V72-01 — Visual page composition") && p12Doc.includes("V72-D1") === false, "human roadmap documents committed scope without implementation noise");
check(p12Doc.includes("Explicitly deferred from v7.2") && p12Doc.includes("P13 — Visual Page Composition & Page Surgery UX"), "human roadmap exposes deferrals and next phase");
check(known.includes("OCR creates searchable raster reconstructions") && boundary.includes("Complete page/document operations"), "roadmap evidence remains anchored in current product gaps");
check(workflows.includes("npm run check:p12") && workflows.includes("feature-intake.json"), "P12 roadmap CI enforces the intake contract");

console.log(JSON.stringify({
  phase:"P12",
  status:"P12_ROADMAP_PASS",
  committed: committed.map(item => item.id),
  candidates: candidates.map(item => item.id),
  deferred: deferred.map(item => item.id),
  passed: checks.filter(item => item.passed).length,
  total: checks.length,
  checks
}, null, 2));
