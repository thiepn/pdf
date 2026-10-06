import { readFile } from "node:fs/promises";

const read = path => readFile(path, "utf8");
const [
  intakeText, p11Text, packageText, lockText, releaseSource, nativeSource,
  p12Doc, readme, changelog, p3Doc, p8Doc, p1Doc, known,
  docxSource, compressionSource, batchTypes, workflow
] = await Promise.all([
  read("docs/p12/feature-intake.json"),
  read("docs/p11/next-line.json"),
  read("package.json"),
  read("package-lock.json"),
  read("src/core/release.ts"),
  read("src/types/nativeEditor.ts"),
  read("docs/product/P12_V72_PRODUCT_ROADMAP.md"),
  read("README.md"),
  read("CHANGELOG.md"),
  read("docs/product/P3_OCR_SCAN_TO_EDITABLE.md"),
  read("docs/product/P8_FIDELITY_COMPATIBILITY.md"),
  read("docs/product/P1_EXISTING_TEXT_EDITING_EXCELLENCE.md"),
  read("KNOWN_LIMITATIONS.md"),
  read("src/professional/docx.ts"),
  read("src/views/CompressionPage.tsx"),
  read("src/types/batch.ts"),
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

check(intake.schemaVersion === 2 && intake.phase === "P12", "P12 intake schema/phase are frozen");
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

const shipped = intake.baseline?.alreadyShipped ?? [];
check(shipped.some(item => item.id === "SHIPPED-P3-OCR2"), "P12 records source-preserving OCR as already shipped");
check(shipped.some(item => item.id === "SHIPPED-V71-PAGE-COMPOSITION"), "P12 records visual page composition as already shipped");
check(shipped.some(item => item.id === "SHIPPED-P8-FIDELITY"), "P12 records fidelity gating as already shipped");
check(p3Doc.includes("adds invisible positioned text") && p3Doc.includes("retains original page graphics/content streams"), "current P3 source proves original-page OCR is already implemented");
check(readme.includes("Visual mixed PDF/image assembly") && changelog.includes("duplex interleaving"), "current v7.1 documentation proves visual page composition is already implemented");
check(p8Doc.includes("mandatory output gate") && p8Doc.includes("fails closed by default"), "current P8 contract proves fidelity gating is already implemented");

const items = intake.items ?? [];
const ids = items.map(item => item.id);
check(ids.length === new Set(ids).size, "feature intake IDs are unique");
check(items.every(item => ["committed","candidate","deferred"].includes(item.disposition)), "every open roadmap item has a valid disposition");
const committed = items.filter(item => item.disposition === "committed");
const candidates = items.filter(item => item.disposition === "candidate");
const deferred = items.filter(item => item.disposition === "deferred");
check(committed.length === 6, "v7.2 committed scope stays intentionally bounded to six roadmap items");
check(candidates.length === 3 && deferred.length >= 4, "candidate and deferred scope are explicit");
check(intake.committedRoadmapOrder.length === committed.length && intake.committedRoadmapOrder.every((id, index) => committed[index]?.id === id), "committed roadmap order exactly matches committed items");
check(committed.every(item => item.outcome && item.evidence?.length > 0 && item.acceptance?.length >= 5), "committed items have evidence-backed measurable acceptance criteria");
check(committed.every(item => item.schemaChange === false), "P12 committed scope does not smuggle in a persistent format migration");
check(deferred.every(item => typeof item.reason === "string" && item.reason.length > 30), "deferred items carry explicit reasons");

check(docxSource.includes("buildTextDocx") && docxSource.includes("extractPageText"), "V72-01 is anchored in the current text-focused DOCX exporter");
check((readme.includes("text-only DOCX") && readme.includes("not layout-faithful Office conversion")) || readme.includes("layout-aware editable DOCX"), "DOCX documentation retains the baseline fidelity boundary or an explicit downstream implementation");
check(known.includes("shaping-dependent scripts remain an appearance-only fallback") && p1Doc.includes("real shaping/font path"), "V72-02 is anchored in the current complex-script boundary");
check(compressionSource.includes('type ProfileId = "lossless" | "screen" | "balanced" | "small" | "print"'), "V72-03 is anchored in current fixed compression profiles");
check(batchTypes.includes("BATCH_RECIPE_SCHEMA_VERSION = 3") && batchTypes.includes('type: "split-fixed"') && batchTypes.includes('type: "page-images"'), "V72-04 is anchored in the current Batch v3 model");
check(known.includes("shared-image semantics") && known.includes("shadings, patterns") && known.includes("merged-cell"), "V72-05 is anchored in current native-content fidelity boundaries");

check(intake.principles.includes("local-first-privacy") && intake.principles.includes("fidelity-over-fake-parity"), "roadmap encodes privacy/fidelity principles");
check(intake.intakeRules?.staleGapClaimsRequireCurrentSourceRecheck === true, "future intake must re-check stale historical gap claims");
check(intake.nextPhase?.id === "P13" && intake.nextPhase?.roadmapItem === "V72-01", "P13 begins with layout-aware DOCX export");
check(p12Doc.includes("Baseline correction") && p12Doc.includes("Layout-aware editable PDF → DOCX export"), "human roadmap includes corrected baseline and first committed capability");
check(p12Doc.includes("Explicitly deferred from v7.2") && p12Doc.includes("P13 — Layout-Aware PDF → DOCX Export 2.0"), "human roadmap exposes deferrals and next phase");
check(workflow.includes("npm run check:p12") && workflow.includes("docs/p12/**"), "P12 roadmap CI enforces the intake contract");

console.log(JSON.stringify({
  phase: "P12",
  status: "P12_ROADMAP_PASS",
  alreadyShipped: shipped.map(item => item.id),
  committed: committed.map(item => item.id),
  candidates: candidates.map(item => item.id),
  deferred: deferred.map(item => item.id),
  nextPhase: intake.nextPhase,
  passed: checks.filter(item => item.passed).length,
  total: checks.length,
  checks
}, null, 2));
